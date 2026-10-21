/// <reference types="node" />
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ACCOUNTS_TEXT,
  ACCOUNT_ERROR_TEXT,
  ACCOUNT_KIND_LABEL,
  accountErrorText,
  validateAccountDraft,
  NOTA_ERROR_TEXT,
  ANNUAL_HELP_TEXT,
  DUE_DAY_TEXT,
  DUE_RULE_SOURCES,
  NATIONAL_HOLIDAY_LAWS,
  addDays,
  dueDayNotice,
  nationalHolidays,
  reminderBody,
  CARD_MONTH_TEXT,
  NOTA_FLOW_TEXT,
  NOTA_PAYMENT_TEXT,
  NOTA_TEXT,
  PAYMENT_FORMS,
  PAYMENT_FORM_LABEL,
  SEFAZ_TEXT,
  noteGaps,
  noteReadLine,
  sefazReadErrorText,
  suggestDescription,
  RECEIPT_ERROR_CODES,
  accessKeyCheckDigit,
  danfeFromText,
  factsFromDanfe,
  factsFromKey,
  factsFromQr,
  noteErrorText,
  parseAccessKey,
  parseNfceQr,
  readReceiptCode,
  receiptDraft,
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
  LEARN_SECTIONS,
  LEARN_UI_TEXT,
  RETURN_TEXT,
  TOPICS,
  learnUiTextSamples,
  returnTextSamples,
  type Topic,
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
  calculatorBySlug,
  calcJuntarParaObjetivo,
  calcRowA11yLabel,
  calcMultaEJuros,
  calcAntesDeFinanciar,
  ANTES_ESTIMATE_TEXT,
  ANTES_TEXT,
  calcPlanoDividas,
  PLANO_ESTIMATE_TEXT,
  PLANO_TEXT,
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
import { dueText, nextBusinessDayDueText, type Commitment as DiaUtilCommitment } from '../src';
import { APP_SCREENS, APP_SEARCH_TEXT, BAR_TEXT, GOALS_NAV_TEXT, PAYABLES_NAV_TEXT, SUMMARY_NAV_TEXT, searchAppScreens } from '../src';
import { DEFAULT_SEARCH_DRAFT, SEARCH_PAGE, SEARCH_PERIODS, SEARCH_TEXT, searchFromDraft } from '../src';
import { SUBSCRIPTION_ERROR_TEXT, SUBSCRIPTION_TEXT, subscriptionCount, subscriptionErrorText } from '../src';
import { EXPORT_FORMATS, EXPORT_PERIODS, EXPORT_TEXT, buildExportFiles, loadExportSource } from '../src';
import { IMPORT_ERROR_TEXT, IMPORT_SAVE_ERROR_TEXT, IMPORT_TEXT, failedItemIndex, importSaveErrorText, importedSummary, reviewLineA11y } from '../src';
import { GUIDE_ENTRIES, GUIDE_GROUPS, GUIDE_TEXT, HELP_TEXT, MANUAL_TEXT, TOUR_CARDS, TOUR_TEXT, guideSummary, guideWhere } from '../src';
import { COMPROVANTE_TEXT, comprovanteDraft, comprovanteErrorText, comprovanteGaps, comprovanteKindLabel, comprovanteKindPhrase, comprovanteMismatch, comprovanteReadLine, suggestComprovanteDescription } from '../src';
import type { ComprovanteDirection, ComprovanteKind, ComprovanteReading } from '../src';
import { SAVED_BEFORE_TEXT } from '../src';
import { SEU_MES_TEXT, WIDGET_TEXT, buildSeuMes, buildWidgetContent, loadInvoicesOfRecords, seuMesRowA11y, plannedForGoals, savedInMonth, type SeuMesInput } from '../src';

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

/** Textos de "Antes de financiar" (D-044) com entradas comuns e de borda: resultado, juntar antes, entrada maior, hipóteses e avisos. */
function antesTexts(): string[] {
  const out: string[] = [];
  const base = { preco: '50.000,00', entrada: '10.000,00', parcelas: '48', taxaMes: '1,99' };
  const variants = [
    {},
    { primeiraEmUmMes: false },
    { entrada: '', rendimento: '8' },
    { rendimento: '12', guardar: '900,00' },
    { guardar: '1,00' },
    { renda: '8.000,00', comprometidoCents: 420_000 },
    { renda: '1.000,00', comprometidoCents: 900_000 },
    { renda: '9.999.999,99' },
    { comprometidoCents: 420_000 },
    { renda: '8.000,00', comprometidoCents: 0 },
    { taxaMes: '0' },
    { taxaMes: '0', preco: '1.000,00', entrada: '' },
    { parcelas: '1' },
    { parcelas: '1', primeiraEmUmMes: false },
    { entrada: '50.000,00' },
    { entrada: '49.000,00' },
    { preco: '9.999.999,99', entrada: '', parcelas: '480', taxaMes: '99,99' },
  ];
  for (const today of [undefined, '2026-10-07'])
    for (const v of variants) {
      const res = calcAntesDeFinanciar({ ...base, ...v }, today);
      if (!res.ok) continue;
      out.push(...res.result.resultLines, ...res.result.hypotheses, ...res.result.notes, ...res.result.savingLines, ...res.result.entryLines);
    }
  return out;
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
  // Plano para quitar dívidas (D-040): resultado, sequências, diferenças, hipóteses e notas de várias combinações.
  const planos = [
    { extra: '200,00', dividas: [{ tipo: 'saldo' as const, saldo: '2.000,00', taxaSaldo: '2', pagamento: '60,00' }, { tipo: 'saldo' as const, saldo: '4.000,00', taxaSaldo: '5', pagamento: '300,00' }] },
    { dividas: [{ tipo: 'parcelada' as const, parcela: '100,00', restantes: '3' }, { tipo: 'saldo' as const, saldo: '900,00', taxaSaldo: '5', pagamento: '200,00', apelido: 'Cartão azul' }] },
    { dividas: [{ tipo: 'saldo' as const, saldo: '1.000,00', taxaSaldo: '8', pagamento: '50,00' }] },
    { extra: '100,00', dividas: [{ tipo: 'parcelada' as const, parcela: '850,00', restantes: '36', taxaParcelada: '1,5' }] },
    { dividas: [{ tipo: 'parcelada' as const, parcela: '850,00', restantes: '36', taxaParcelada: '1,5' }] },
    { dividas: [{ tipo: 'saldo' as const, saldo: '100.000,00', taxaSaldo: '1', pagamento: '1.000,01' }] },
    { dividas: [{ tipo: 'saldo' as const, saldo: '100.000,00', taxaSaldo: '1', pagamento: '1.000,01' }, { tipo: 'saldo' as const, saldo: '50.000,00', taxaSaldo: '1', pagamento: '500,01' }] },
  ];
  for (const today of [undefined, '2026-10-10'])
    for (const input of planos) {
      const out = calcPlanoDividas(input, today);
      if (!out.ok) continue;
      all.push(...outcomeTexts(out), ...out.result.differences);
      for (const s of out.result.scenarios) all.push(s.title, s.summary, ...s.detailLines, ...s.sequenceLines);
    }
  all.push(...antesTexts());
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
      // Endereços de fontes (learn/topics) não são texto exibido: "cuidados-ao-investir" é parte de uma URL oficial.
      const text = readFileSync(f, 'utf8').replace(/'https:\/\/[^'\s]+'/g, "''");
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
      PLANO_ESTIMATE_TEXT,
      ANTES_ESTIMATE_TEXT,
      ...Object.values(ANTES_TEXT),
      ...staticStrings(PLANO_TEXT),
      PLANO_TEXT.removeDebtA11y('Cartão azul'),
      PLANO_TEXT.debtTitle(0),
      PLANO_TEXT.balanceStaysNote('Rotativo', 8_000),
      PLANO_TEXT.savingsHint(30_000),
      PLANO_TEXT.hypotheses.noRate('Dívida 1'),
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
      T.roundingNote,
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
      T.detail.planned(100_000, '2028-04', '2026-11'),
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
    expect(CARDS_TEXT.invoice.payAfterClosing('2026-11-03')).toBe(
      'Esta fatura ainda está aberta. Registre o pagamento depois do fechamento, em 03/11/2026. Se você já pagou antes, use a data em que pagou.',
    );
    expect(cardErrorText('fatura_aberta', { closingOn: '2026-11-03' })).toBe(CARDS_TEXT.invoice.payAfterClosing('2026-11-03'));
    expect(cardErrorText('fatura_aberta')).toBe(CARD_ERROR_TEXT.fatura_aberta);
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
    // Fatura ainda aberta: o texto com a data do fechamento, o do erro e a dica nas telas.
    texts.push(T.invoice.payAfterClosing('2026-11-03'), cardErrorText('fatura_aberta', { closingOn: '2026-11-03' }));
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
        texts.push(it.title, it.situation, it.total, it.closes, it.due, it.period, it.a11yLabel, ...(it.estimated ? [it.estimated] : []), ...(it.payHint ? [it.payHint] : []));
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
    clock.today = '2027-01-04'; // janeiro fechou em 03/01; o pagamento é informado com a data em que foi feito (20/12)
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
 * Leitura de notas fiscais (Ciclo E, D-038): sem julgamento, sem alerta, sem produto; nenhum texto pede CPF (o aviso de
 * privacidade diz que não guardamos) nem traz número longo (chave de acesso, cartão); os textos montados (resumo, descrição,
 * nota de teste, mês futuro, nota já anotada) são gerados com várias notas e conferidos um a um, e também os arquivos-fonte.
 */
describe('textos de notas fiscais (Ciclo E)', () => {
  /** Chave de 44 dígitos com o dígito verificador certo (CNPJ 11.222.333/0001-81, o exemplo público). */
  function sampleKey(aamm: string, model: '55' | '65', uf = '33'): string {
    const body = `${uf}${aamm}11222333000181${model}001000012345187654321`;
    return body + String(accessKeyCheckDigit(body));
  }

  it('NOTA_TEXT, NOTA_ERROR_TEXT, rascunhos, nota já anotada e o arquivo-fonte', () => {
    const today = '2026-10-09';
    const texts: string[] = [
      ...staticStrings(NOTA_TEXT),
      ...staticStrings(NOTA_ERROR_TEXT),
      NOTA_TEXT.alreadyNoted('2026-10-12', 'Mercado', 8_740),
      NOTA_TEXT.alreadyNoted('2026-10-12', 'Compra em Loja Exemplo Ltda', 1),
      NOTA_TEXT.alreadyNotedCard('2026-10-12', 'Mercado', 8_740, 'Nubank'),
      NOTA_TEXT.summary('RJ', 'outubro de 2026'),
      NOTA_TEXT.summary('SP', '12/10/2026'),
      noteErrorText('qualquer_outro'),
      ...RECEIPT_ERROR_CODES.map((code) => noteErrorText(code)),
    ];
    // Rascunhos de várias notas: do mês, de outro mês, de mês futuro, em contingência, de teste e do DANFE.
    const base = 'https://consultadfe.fazenda.rj.gov.br/consultaNFCe/QRCode?p=';
    const qrs = [
      `${base}${sampleKey('2610', '65')}|2|1|1|ABCDEF0123456789ABCDEF0123456789ABCDEF01`,
      `${base}${sampleKey('2609', '65')}|2|1|08|87.40|0123456789ABCDEF0123456789ABCDEF01234567|1|ABCDEF0123456789ABCDEF0123456789ABCDEF01`,
      `${base}${sampleKey('2611', '65')}|2|2|1|ABCDEF0123456789ABCDEF0123456789ABCDEF01`,
      `${base}${sampleKey('2601', '65', '35')}|3|1`,
    ];
    for (const qr of qrs) {
      const parsed = parseNfceQr(qr);
      expect(parsed.ok, qr).toBe(true);
      if (!parsed.ok) continue;
      const draft = receiptDraft(factsFromQr(parsed.qr, qr), today);
      texts.push(draft.description, draft.summary, ...(draft.testNote ? [draft.testNote] : []), ...(draft.futureNote ? [draft.futureNote] : []));
    }
    expect(texts.some((t) => t === NOTA_TEXT.testNote)).toBe(true);
    expect(texts.some((t) => t === NOTA_TEXT.futureMonth)).toBe(true);
    const keyParsed = readReceiptCode(sampleKey('2610', '55'));
    expect(keyParsed.ok).toBe(true);
    if (keyParsed.ok) texts.push(receiptDraft(factsFromKey(keyParsed.key), today).description);
    const danfe = danfeFromText(
      `RECEBEMOS DE LOJA EXEMPLO LTDA OS PRODUTOS E/OU SERVIÇOS CONSTANTES DA NOTA FISCAL ELETRÔNICA INDICADA AO LADO\nCHAVE DE ACESSO\n${sampleKey('2610', '55').replace(/(.{4})/g, '$1 ').trim()}\nDATA DA EMISSÃO 08/10/2026\nVALOR TOTAL DA NOTA 150,00`,
    );
    expect(danfe.ok).toBe(true);
    if (danfe.ok) {
      const draft = receiptDraft(factsFromDanfe(danfe.reading), today);
      expect(draft.description).toBe('Compra em Loja Exemplo Ltda');
      texts.push(draft.description, draft.summary);
    }
    expect(parseAccessKey(sampleKey('2610', '65')).ok).toBe(true);
    expect(texts.length).toBeGreaterThan(40);
    for (const text of texts) {
      expect(text, text).not.toMatch(FORBIDDEN);
      expect(text, text).not.toMatch(JUDGMENT);
      expect(text, text).not.toMatch(NEUTRAL);
      // Nunca chave, número de cartão nem código de segurança nos textos.
      expect(text, text).not.toMatch(/\d{13,}/);
      expect(text, text).not.toMatch(/\bcvv\b|c[oó]digo de verifica/i);
    }
    // Só o aviso de privacidade fala em CPF, e é para dizer que não guardamos.
    expect(texts.filter((t) => /\bCPF\b/i.test(t))).toEqual([NOTA_TEXT.privacy]);
    expect(NOTA_TEXT.privacy).toMatch(/Não guardamos CPF/);
    for (const file of ['nota.ts', 'danfe.ts']) {
      const source = readFileSync(join(CORE_SRC, file), 'utf8');
      expect(source, file).not.toMatch(FORBIDDEN);
      expect(source, file).not.toMatch(JUDGMENT);
    }
  });
});

/**
 * Passo 3 do ciclo E (telas das notas): folha, câmera, bloco "Nota lida", mensagens do que a nota não traz, boleto e leitura da
 * página da Sefaz. Sem julgamento, sem alerta, neutro quanto a gênero, sem travessões e sem a expressão vetada; nenhum texto
 * pede CPF nem traz número longo.
 */
describe('textos das telas de notas fiscais (Ciclo E, passo 3)', () => {
  it('NOTA_FLOW_TEXT, SEFAZ_TEXT, mensagens montadas e os arquivos-fonte', () => {
    const texts: string[] = [
      ...staticStrings(NOTA_FLOW_TEXT),
      ...staticStrings(SEFAZ_TEXT),
      NOTA_FLOW_TEXT.missingDay('2026-08'),
      NOTA_FLOW_TEXT.otherMonth('2026-08'),
      ...(['tempo_esgotado', 'sem_conexao', 'resposta_invalida', 'endereco_invalido', 'nota_diferente', 'nota_nao_encontrada', 'pagina_vazia', 'pagina_nao_reconhecida'] as const).map(sefazReadErrorText),
    ];
    const body = '3326101122233300018165001000012345187654321';
    const text = body + String(accessKeyCheckDigit(body));
    const parsed = parseAccessKey(text);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      for (const [issuerName, totalCents, issuedOn] of [
        [undefined, undefined, undefined],
        ['Mercado Exemplo Ltda', 8_740, '2026-10-06'],
      ] as const) {
        const facts = { ...factsFromKey(parsed.info), ...(issuerName ? { issuerName } : {}), ...(totalCents ? { totalCents } : {}), ...(issuedOn ? { issuedOn } : {}) };
        const draft = receiptDraft(facts, '2026-10-09');
        texts.push(noteReadLine(draft, issuedOn ?? null));
        const gaps = noteGaps(draft, issuedOn ?? null);
        texts.push(...Object.values(gaps).filter((v): v is string => typeof v === 'string'));
        const s = suggestDescription({ issuerName: draft.issuerName, lastTime: { description: 'Mercado do bairro', category: 'Mercado' } });
        texts.push(...(s.legend ? [s.legend] : []), s.placeholder);
      }
    }
    expect(texts.length).toBeGreaterThan(35);
    for (const t of texts) {
      expect(t, t).not.toMatch(FORBIDDEN);
      expect(t, t).not.toMatch(JUDGMENT);
      expect(t, t).not.toMatch(NEUTRAL);
      expect(t, t).not.toMatch(/\d{13,}/);
      expect(t, t).not.toMatch(/\bcvv\b|\bCPF\b|c[oó]digo de verifica/i);
      // Neutro quanto a gênero: nada de "obrigado/a", "bem-vindo", "o usuário" nem tratamento no masculino genérico.
      expect(t, t).not.toMatch(/\bobrigad[oa]\b|\bbem-vind[oa]\b|\bo usu[áa]rio\b|\ba usu[áa]ria\b|\bcliente\b/i);
    }
    // A privacidade da nota é dita em NOTA_TEXT.privacy (único texto que cita CPF).
    expect(NOTA_TEXT.privacy).toMatch(/Não guardamos CPF/);
    expect(NOTA_FLOW_TEXT.cameraIntro).toBe('O Clarevo usa a câmera só para ler o código da nota. Nenhuma foto é guardada.');
    for (const file of ['sefaz-page.ts', 'nota-flow.ts']) {
      const source = readFileSync(join(CORE_SRC, file), 'utf8');
      expect(source, file).not.toMatch(FORBIDDEN);
      expect(source, file).not.toMatch(JUDGMENT);
    }
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
  it('temas de Aprender: o catálogo do core (e lib/topics.ts enquanto existir)', () => {
    // Os temas moraram em lib/topics.ts até o Ciclo A5; agora vêm do core (learn/topics) e passam também pelas listas
    // de "textos de Aprender" abaixo. Enquanto lib/topics.ts existir (troca por lib/learn.ts), ele segue conferido.
    const libTopics = join(APP_SRC, 'lib', 'topics.ts');
    if (existsSync(libTopics)) expect(readFileSync(libTopics, 'utf8')).not.toMatch(FORBIDDEN);
    // O catálogo certo, com os temas do Ciclo A: a conferência não passa por estar vazia.
    for (const slug of ['gasto-fixo', 'estimativa', 'quitar-antes']) expect(TOPICS.map((t) => t.slug)).toContain(slug);
    for (const t of TOPICS) for (const text of topicFieldTexts(t)) expect(text, `${t.slug}: ${text}`).not.toMatch(FORBIDDEN);
  });

  it('telas e componentes', { timeout: 30_000 }, () => {
    const files = sourceFiles(APP_SRC);
    expect(files.length).toBeGreaterThan(30);
    const bad = files.filter((f) => FORBIDDEN.test(readFileSync(f, 'utf8'))).map((f) => f.slice(APP_SRC.length));
    expect(bad).toEqual([]);
  });
});

/**
 * Textos de Aprender (spec3 §3.6, R10, e §3.11): FORBIDDEN com a expressão vetada ampliada, LEARN_FORBIDDEN e as
 * palavras de julgamento em todos os campos de todos os temas (inclusive rascunhos e palavras-chave), nas seções e
 * em LEARN_UI_TEXT. Fontes ficam fora (o nome de uma instituição citada como fonte pode aparecer). Em sem-registro e
 * voltei-depois, também as listas do retorno (cobrança e contagem de dias sem anotar).
 */
const FORBIDDEN_EXPANDED = /\bf(az|azer|azendo|a[cç]a|ar[aá]|ez|aria)\s+sentido/i;

const LEARN_FORBIDDEN = new RegExp(
  [
    'poupan[cç]a',
    'previd[eê]ncia',
    'deb[eê]nture',
    'fundos? (de|imobili)',
    'cripto\\w*',
    'bitcoin',
    'consignado',
    'portabilidade',
    'endividad\\w*',
    'estour\\w*',
    '\\bruim\\b',
    'vil[aã]o',
    'culpa',
    'usu[aá]ri[oa]s?',
    'bem-vind[oa]s?',
    'preocupad[oa]s?',
    // Bancos, plataformas e empresas de dados de crédito.
    'nubank',
    'ita[uú]',
    'bradesco',
    'santander',
    'banco do brasil',
    'caixa econ[oô]mica',
    'picpay',
    'mercado pago',
    '\\bxp\\b',
    'btg',
    '\\bc6\\b',
    '\\binter\\b',
    'serasa',
    'boa vista',
    '\\bquod\\b',
    '\\bspc\\b',
  ].join('|'),
  'i',
);

/** Termos aceitos só em um tema (P-024): a referência da Serasa em renda comprometida (Ciclo B). */
const LEARN_FORBIDDEN_EXCEPTIONS: Record<string, string[]> = { 'renda-comprometida': ['serasa'] };

/** Listas do retorno (A4, spec3 §2.6, teste 8): cobrança e contagem de dias sem anotar. */
const COLLECTION = /\b(sumiu|sumid\w*|abandon\w*|atrasad\w*|esquec\w*|deveria|culpa|bagun\w*|pend[eê]nci\w*)\b/i;
const ABSENCE = /aus[eê]nci|sem usar|\d+\s*dias?\b(?!\.$)|\bvoc[eê] (n[aã]o )?(anotou|usou) (nada|o app)/i;

/** Todos os campos de texto de um tema, menos as fontes. */
function topicFieldTexts(t: Topic): string[] {
  return [
    t.title,
    t.subtitle ?? '',
    t.question ?? '',
    t.short,
    ...t.paragraphs,
    t.example ?? '',
    t.calculation ?? '',
    t.hypotheses ?? '',
    ...t.facts.map((f) => f.text),
    ...t.keywords,
    ...(t.aliases ?? []),
    ...(t.pending ?? []),
  ].filter((x) => x !== '');
}

function learnForbiddenMatch(text: string, slug: string | null): string | null {
  const allowed = slug ? (LEARN_FORBIDDEN_EXCEPTIONS[slug] ?? []) : [];
  const re = new RegExp(LEARN_FORBIDDEN.source, 'gi');
  for (const m of text.matchAll(re)) if (!allowed.some((a) => m[0].toLowerCase().startsWith(a))) return m[0];
  return null;
}

describe('textos de Aprender', () => {
  it('as listas reprovam o que devem, inclusive variações montadas em tempo de execução, e aceitam os avisos', () => {
    const verbs = ['faz', 'fazer', 'fazendo', 'faça', 'faca', 'fará', 'fara', 'fez', 'faria'];
    for (const v of verbs) expect(FORBIDDEN_EXPANDED.test([v, 'sentido'].join(' ')), v).toBe(true);
    expect(FORBIDDEN_EXPANDED.test(['faz', 'todo o', 'sentido'].join(' '))).toBe(false);
    for (const bad of ['poupança', 'Previdência', 'fundo imobiliário', 'fundos de renda', 'criptomoedas', 'consignado', 'endividado', 'estourou', 'ruim', 'vilão', 'culpa', 'usuária', 'bem-vindo', 'preocupada', 'Nubank', 'Itaú', 'Caixa Econômica', 'XP', 'C6', 'Inter', 'Serasa', 'Boa Vista', 'SPC'])
      expect(learnForbiddenMatch(bad, null), bad).not.toBeNull();
    for (const ok of ['Fundo Garantidor de Créditos', 'superendividamento', 'interesse', 'internet', 'Lei Geral de Proteção de Dados', LEARN_UI_TEXT.footer, LEARN_UI_TEXT.disclaimer])
      expect(learnForbiddenMatch(ok, null), ok).toBeNull();
    expect(learnForbiddenMatch('referência da Serasa', 'renda-comprometida')).toBeNull();
    expect(learnForbiddenMatch('referência da Serasa', 'score-credito')).toBe('Serasa');
  });

  it('todos os campos de todos os temas (sem as fontes)', () => {
    const texts = TOPICS.flatMap((t) => topicFieldTexts(t).map((text) => ({ slug: t.slug, text })));
    expect(texts.length).toBeGreaterThan(300);
    const bad = texts.filter(
      ({ slug, text }) => FORBIDDEN.test(text) || FORBIDDEN_EXPANDED.test(text) || JUDGMENT.test(text) || learnForbiddenMatch(text, slug) !== null,
    );
    expect(bad).toEqual([]);
  });

  it('seções e LEARN_UI_TEXT (strings e funções com entradas de exemplo)', () => {
    const texts = [...learnUiTextSamples(), ...LEARN_SECTIONS.flatMap((s) => [s.title, s.description])];
    expect(texts.length).toBeGreaterThan(45);
    for (const text of texts) {
      expect(text, text).not.toMatch(FORBIDDEN);
      expect(text, text).not.toMatch(FORBIDDEN_EXPANDED);
      expect(text, text).not.toMatch(JUDGMENT);
      expect(learnForbiddenMatch(text, null), text).toBeNull();
    }
  });

  it('sem-registro e voltei-depois: sem cobrança e sem contar dias sem anotar', () => {
    for (const slug of ['sem-registro', 'voltei-depois'])
      for (const text of topicFieldTexts(TOPICS.find((t) => t.slug === slug)!)) {
        expect(text, text).not.toMatch(COLLECTION);
        expect(text, text).not.toMatch(ABSENCE);
      }
  });

  it('textos do retorno (A4): FORBIDDEN, cobrança e contagem de dias', () => {
    const texts = returnTextSamples();
    expect(texts.length).toBeGreaterThan(40);
    for (const text of texts) {
      expect(text, text).not.toMatch(FORBIDDEN);
      expect(text, text).not.toMatch(FORBIDDEN_EXPANDED);
      expect(text, text).not.toMatch(COLLECTION);
      expect(text, text).not.toMatch(ABSENCE);
    }
    // Sem revisão ativa, conta paga em outro aparelho, valor estimado no diálogo "Não houve" e lacunas da conta do ano no
    // detalhe: todos varridos.
    for (const text of [
      RETURN_TEXT.noActiveReview,
      RETURN_TEXT.paidElsewhere,
      RETURN_TEXT.whyNoBill,
      RETURN_TEXT.registerParts,
      RETURN_TEXT.registerMonth,
      RETURN_TEXT.annualGap('2027', [6, 7, 8, 9, 10]),
      RETURN_TEXT.annualGapOld('2025', [1, 2, 3]),
      RETURN_TEXT.registerPartsA11y('2027'),
      RETURN_TEXT.rowAmountLine({ description: 'Luz', amountCents: 18_000, amountIsEstimate: true }),
    ])
      expect(texts, text).toContain(text);
  });
});

/**
 * Navegação (D-039): textos do seletor de Contas a pagar, do Resumo, de Metas compacta e do grupo "No app" da busca de
 * Aprender, com o índice de telas inteiro (título, legenda e palavras de busca). Linguagem neutra de gênero, sem produto
 * financeiro, sem travessões e sem a expressão proibida.
 */
describe('textos da navegação (D-039)', () => {
  const GENDERED = /\b(o|a)s? usuári[oa]s?\b|\bobrigad[oa]s?\b/i;

  it('textos fixos e montados', () => {
    const texts: string[] = [
      ...staticStrings(BAR_TEXT),
      ...staticStrings(SUMMARY_NAV_TEXT),
      ...staticStrings(GOALS_NAV_TEXT),
      ...staticStrings(PAYABLES_NAV_TEXT),
      ...staticStrings(APP_SEARCH_TEXT),
      PAYABLES_NAV_TEXT.previous('2026-09'),
      PAYABLES_NAV_TEXT.next('2026-11'),
      PAYABLES_NAV_TEXT.backToCurrent('2026-10'),
      APP_SEARCH_TEXT.countFor(1, 'boleto'),
      APP_SEARCH_TEXT.countFor(3, ' cartão '),
    ];
    expect(texts.length).toBeGreaterThan(12);
    for (const text of texts) {
      expect(text, text).not.toMatch(FORBIDDEN);
      expect(text, text).not.toMatch(JUDGMENT);
      expect(text, text).not.toMatch(GENDERED);
    }
  });

  it('o índice de telas do app inteiro', () => {
    expect(APP_SCREENS.length).toBeGreaterThan(15);
    for (const screen of APP_SCREENS) {
      for (const text of [screen.title, screen.caption, ...screen.keywords]) {
        expect(text, `${screen.id}: ${text}`).not.toMatch(FORBIDDEN);
        expect(text, `${screen.id}: ${text}`).not.toMatch(GENDERED);
      }
      expect(screen.title, screen.id).not.toMatch(JUDGMENT);
    }
    // Palavras de busca em todas as formas: nenhuma busca comum devolve produto ou recomendação.
    for (const query of ['nota fiscal', 'boleto', 'lembrete', 'categoria', 'simular', 'cartão']) expect(searchAppScreens(query).length, query).toBeGreaterThan(0);
  });

  it('arquivo-fonte navigation.ts', () => {
    const text = readFileSync(join(CORE_SRC, 'navigation.ts'), 'utf8');
    expect(text).not.toMatch(FORBIDDEN);
  });
});

/**
 * Ajustes de 10/10/2026 (D-042): forma de pagamento da nota, faturas do mês nos cartões e contas do ano explicadas. pt-BR, neutro
 * quanto a gênero, sem travessões, sem a expressão vetada e sem tom de alerta nem julgamento.
 */
describe('textos dos ajustes de 10/10/2026 (D-042)', () => {
  const GENDERED_D042 = /\bobrigad[oa]s?\b|\bbem-vind[oa]s?\b|\bo usu[áa]rio\b|\ba usu[áa]ria\b|\bcliente\b/i;
  const ALERT_D042 = /aten[cç][aã]o|cuidado|alerta|perigo|urgente|erro grave|\batrasad|\bvencid[oa]s? h[aá]/i;

  const check = (texts: string[]) => {
    expect(texts.length).toBeGreaterThan(10);
    for (const t of texts) {
      expect(t, t).not.toMatch(FORBIDDEN);
      expect(t, t).not.toMatch(JUDGMENT);
      expect(t, t).not.toMatch(NEUTRAL);
      expect(t, t).not.toMatch(GENDERED_D042);
      expect(t, t).not.toMatch(ALERT_D042);
      expect(t, t).not.toMatch(/\d{13,}/);
    }
  };

  it('forma de pagamento da nota: rótulos, avisos e a linha "Nota lida" com cada forma', () => {
    const texts = [
      ...staticStrings(NOTA_PAYMENT_TEXT),
      ...PAYMENT_FORMS.map((f) => PAYMENT_FORM_LABEL[f]),
      ...PAYMENT_FORMS.map((f) => NOTA_PAYMENT_TEXT.fromNote(f)),
      NOTA_FLOW_TEXT.phoneReads,
      NOTA_FLOW_TEXT.cameraCloser,
      NOTA_FLOW_TEXT.cameraAim,
    ];
    const body = '3326101122233300018165001000012345187654321';
    const parsed = parseAccessKey(body + String(accessKeyCheckDigit(body)));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      for (const payments of [[], ...PAYMENT_FORMS.map((f) => [f]), ['dinheiro', 'credito']] as const) {
        const facts = { ...factsFromKey(parsed.info), issuerName: 'Mercado Exemplo', totalCents: 8_740, issuedOn: '2026-10-06', payments: [...payments] };
        texts.push(noteReadLine(receiptDraft(facts, '2026-10-09'), '2026-10-06'));
      }
    }
    check(texts);
    // O pedido de Enzo, palavra por palavra.
    expect(NOTA_PAYMENT_TEXT.creditNoCard).toBe('A nota diz cartão de crédito. Cadastre o cartão para anotar a compra na fatura.');
    expect(NOTA_PAYMENT_TEXT.multiple).toBe('Pagamento em mais de uma forma');
    expect(NOTA_FLOW_TEXT.cameraCloser).toBe('Aproxime até o QR ocupar a moldura.');
    expect(NOTA_FLOW_TEXT.phoneReads).toBe('No celular, o Clarevo lê o valor e a data na página da Sefaz.');
  });

  it('faturas do mês nos cartões: título, regra, ligação com a renda comprometida e próximas faturas', () => {
    const texts = [
      ...staticStrings(CARD_MONTH_TEXT),
      CARD_MONTH_TEXT.title('2026-10'),
      CARD_MONTH_TEXT.title('2026-12'),
      CARD_MONTH_TEXT.none('2026-10'),
      CARD_MONTH_TEXT.percent('52,5%'),
      CARD_MONTH_TEXT.percent('menos de 0,1%'),
      CARD_MONTH_TEXT.upcoming([
        { month: '2026-12', cents: 120_000 },
        { month: '2027-01', cents: 90_000 },
      ]),
    ];
    check(texts);
    expect(CARD_MONTH_TEXT.percent('12,3%')).toBe('12,3% da sua renda de referência');
    expect(CARD_MONTH_TEXT.noReference).toBe('Informe sua renda para ver quanto isso representa.');
    expect(CARD_MONTH_TEXT.inCommitted).toBe('Já entra na sua renda comprometida, no grupo Faturas de cartão.');
  });

  it('contas do ano explicadas: cadastro, exemplos, lista, detalhe e informar o valor', () => {
    const texts = [
      ...staticStrings(ANNUAL_HELP_TEXT),
      ANNUAL_HELP_TEXT.informOnlyYear('2027'),
      ANNUAL_HELP_TEXT.informOnlyYear('2026/2027'),
      ANNUAL_HELP_TEXT.informOnlyYear('2026 a 2027'),
    ];
    check(texts);
  });

  it('arquivos-fonte novos', () => {
    for (const file of ['nota-pagamento.ts', 'cards-month.ts', 'annual-help.ts']) {
      const source = readFileSync(join(CORE_SRC, file), 'utf8');
      expect(source, file).not.toMatch(FORBIDDEN);
      expect(source, file).not.toMatch(JUDGMENT);
    }
  });
});

/**
 * "Antes de financiar" (D-044): português do Brasil, linguagem neutra de gênero, sem travessões longos, sem a expressão
 * vetada e sem as palavras que dizem o que a pessoa deve fazer ou qual caminho é o certo. Vale para o resultado, o juntar antes,
 * a entrada maior, as hipóteses, os avisos, os rótulos, as dicas, as mensagens de erro e o próprio arquivo-fonte.
 */
const ANTES_VETOED =
  /\b(melhor(es)?|pior(es)?|dever[ií]\w*|recomendamos|invista\w*|aplique em|renegoci\w*|portabilidade|consignad\w*|consórcio|vale a pena|ruim|cuidado|desperd\w*|cortes?|atrasad[oa]s?|estour\w*|caixinha|saldo devedor)\b|faz(er|endo)?\s+sentido|[–—]/i;
const GENDERED = /\b(obrigad|bem-vind|sozinh|pront|cadastrad|conectad|convidad|atento|cansad|sozinh)[oa]s?\b|\(a\)|\(o\)|\bo\/a\b|\bvocê (é|está|ficou) \w+[oa]\b/i;

describe('textos de "Antes de financiar" (D-044)', () => {
  it('as listas reprovam o que deve e aceitam os avisos obrigatórios', () => {
    const proibida = ['faz', 'sentido'].join(' ');
    for (const bad of ['É a melhor opção', 'a pior', 'Você deveria juntar', 'recomendamos', 'Invista', 'aplique em', 'vale a pena', 'a — b', 'a – b', proibida, 'consórcio'])
      expect(ANTES_VETOED.test(bad), bad).toBe(true);
    for (const bad of ['Obrigado', 'bem-vinda', 'você está pronto', 'o(a) cliente']) expect(GENDERED.test(bad), bad).toBe(true);
    for (const ok of [CALC_DISCLAIMER, ANTES_ESTIMATE_TEXT, 'Financiando: você usa o bem agora e paga R$ 1,00 de juros.', 'Seu comprometido iria de 52,5% para 66,7% enquanto durar o financiamento.']) {
      expect(ANTES_VETOED.test(ok), ok).toBe(false);
      expect(GENDERED.test(ok), ok).toBe(false);
    }
  });

  it('resultado, juntar antes, entrada maior, hipóteses e avisos de várias combinações', () => {
    const texts = antesTexts();
    expect(texts.length).toBeGreaterThan(200);
    for (const text of texts) {
      expect(text, text).not.toMatch(ANTES_VETOED);
      expect(text, text).not.toMatch(GENDERED);
      expect(text, text).not.toMatch(FORBIDDEN);
      expect(text, text).not.toMatch(JUDGMENT);
    }
  });

  it('rótulos, dicas, opções, mensagens de erro e textos fixos', () => {
    const texts = [
      ...Object.values(ANTES_TEXT),
      ANTES_ESTIMATE_TEXT,
      CALC_UI_TEXT.links.financiar,
      calculatorBySlug('antes-de-financiar')!.title,
      calculatorBySlug('antes-de-financiar')!.subtitle,
      calcRowA11yLabel(calculatorBySlug('antes-de-financiar')!.title, calculatorBySlug('antes-de-financiar')!.subtitle),
    ];
    for (const [name, spec] of Object.entries(calcFields('antes-de-financiar'))) {
      texts.push(spec.label, ...(spec.hint ? [spec.hint] : []), ...(spec.options ?? []).map((o) => o.label));
      for (const code of Object.keys(CALC_ERROR_TEXT) as CalcErrorCode[]) texts.push(calcErrorText('antes-de-financiar', name, code));
    }
    expect(texts.length).toBeGreaterThan(40);
    for (const text of texts) {
      expect(text, text).not.toMatch(ANTES_VETOED);
      expect(text, text).not.toMatch(GENDERED);
      expect(text, text).not.toMatch(FORBIDDEN);
      expect(text, text).not.toMatch(NEUTRAL);
    }
  });

  it('a busca "No app" e o arquivo-fonte do core também passam', () => {
    const screen = APP_SCREENS.find((s) => s.id === 'antes-de-financiar')!;
    for (const text of [screen.title, screen.caption, ...screen.keywords]) {
      expect(text, text).not.toMatch(ANTES_VETOED);
      expect(text, text).not.toMatch(FORBIDDEN);
    }
    const source = readFileSync(join(CORE_SRC, 'calculators', 'antes-de-financiar.ts'), 'utf8');
    expect(source).not.toMatch(ANTES_VETOED);
    expect(source).not.toMatch(FORBIDDEN);
    // Nenhuma taxa padrão no código: a taxa do financiamento e o rendimento são sempre digitados.
    expect(source).not.toMatch(/default:\s*['"]?\d/);
  });
});

import {
  BUDGET_CATEGORIES,
  BUDGET_ERROR_TEXT,
  BUDGET_TEXT,
  LIMIT_ERROR_TEXT,
  LIMIT_TEXT,
  budgetCaption,
  budgetCrossing,
  limitCrossing,
  limitNotesFor,
  limitStatus,
  summarizeBudget,
} from '../src';

/**
 * Orçamento por categoria e limite pessoal (D-041): sem cor que julgue nem julgamento. Além das palavras de D-035 e do Ciclo B,
 * nenhum texto usa "estourou", "estouro", "excedeu", "gastou demais", "controle-se", "cuidado" ou "alerta". Linguagem neutra de
 * gênero, em português do Brasil, sem travessões longos e sem a expressão proibida.
 */
describe('textos do orçamento e do limite (D-041)', () => {
  const VETOED = /estour|\bexcedeu\b|\bexcedid|gastou demais|controle-se|\bcuidado|\balerta|perigo|\bculpa|\bgastão|\bgastona/i;
  const GENDERED = /\b(o|a)s? usuári[oa]s?\b|\bobrigad[oa]s?\b|\bbem-vind[oa]s?\b|\bpreocupad[oa]s?\b|\bendividad[oa]s?\b|\bgastador/i;
  const check = (texts: string[]) => {
    expect(texts.length).toBeGreaterThan(0);
    for (const text of texts) {
      expect(text, text).not.toMatch(FORBIDDEN);
      expect(text, text).not.toMatch(JUDGMENT);
      expect(text, text).not.toMatch(NEUTRAL);
      expect(text, text).not.toMatch(VETOED);
      expect(text, text).not.toMatch(GENDERED);
      expect(text, text).not.toMatch(/\bfaz(er|endo)?\s+sentido\b/i);
    }
  };

  it('a lista reprova o que deve e aceita as frases do enunciado', () => {
    for (const bad of ['Mercado estourou o orçamento', 'o orçamento foi excedido', 'Você excedeu', 'gastou demais', 'controle-se', 'Cuidado!', 'Alerta de gasto', 'Estouro do mês'])
      expect(VETOED.test(bad) || NEUTRAL.test(bad), bad).toBe(true);
    for (const ok of [
      'Mercado chegou a 85% do orçamento de outubro.',
      'Mercado passou do orçamento de outubro em R$ 12,30.',
      'Novembro passou 3,5 pontos do limite de 30% que você escolheu.',
      'Com esta conta, novembro chega a 32,0% da renda, acima do limite de 30% que você escolheu.',
    ]) {
      expect(VETOED.test(ok) || NEUTRAL.test(ok) || JUDGMENT.test(ok), ok).toBe(false);
    }
  });

  it('BUDGET_TEXT, LIMIT_TEXT e as mensagens de erro', () => {
    check([...staticStrings(BUDGET_TEXT), ...staticStrings(LIMIT_TEXT), ...Object.values(BUDGET_ERROR_TEXT), ...Object.values(LIMIT_ERROR_TEXT)]);
  });

  it('textos montados do orçamento e do formulário', () => {
    const T = BUDGET_TEXT;
    const texts: string[] = [
      T.total(600_000, 310_000),
      T.amounts(41_230, 120_000),
      T.left(78_770),
      T.over(1_230),
      T.budgeted(120_000),
      T.budgetedA11y('Mercado, R$ 412,30, 23,4% do pago', 120_000),
      T.defineButton('Mercado'),
      T.changeButton('Mercado'),
      T.monthPick('2026-10'),
      T.form.title('Educação'),
      T.form.intro('Saúde'),
      T.form.removeFrom('2026-11'),
      T.form.removeTitle('Mercado', '2026-11'),
      T.form.restore(100_000, '2026-09'),
      T.form.restoreTitle(100_000, '2026-11'),
      T.form.saved('Mercado', '2026-10'),
      T.form.removed('Lazer', '2026-11'),
      T.form.deleted('Moradia'),
      T.form.historyRow('2026-10', 180_000),
      T.form.historyRow('2026-11', null),
      T.form.existing('2026-10'),
      T.form.monthPrev('2026-09'),
      T.form.monthNext('2026-11'),
      ...[0, 79, 80, 85, 99, 100].map((p) => T.crossedNear('Mercado', p, 'outubro')),
      T.crossedOver('Mercado', 'outubro', 1_230),
      T.crossedOver('Lazer', 'dezembro de 2025', 1),
      T.crossedOverHidden('Educação', 'outubro'),
    ];
    check(texts);
  });

  it('o resumo do mês e a legenda de Movimentos, em todos os níveis', () => {
    const line = (category: string, budgetCents: number | null, usedCents: number) => ({
      category,
      budgetId: budgetCents === null ? null : 'x',
      budgetVersion: budgetCents === null ? null : 1,
      budgetFrom: budgetCents === null ? null : '2026-10',
      budgetCents,
      usedCents,
    });
    const texts: string[] = [];
    for (const used of [0, 1, 7_999, 8_000, 9_999, 10_000, 10_001, 31_230, 1_000_000]) {
      const s = summarizeBudget({ month: '2026-10', lines: BUDGET_CATEGORIES.map((c) => (c === 'Mercado' ? line(c, 10_000, used) : line(c, null, 5))) });
      texts.push(budgetCaption(s), s.totalLine ?? '', ...s.rows.flatMap((r) => [r.amountLine, r.balanceLine, r.percentText, r.a11yLabel]));
    }
    texts.push(budgetCaption(summarizeBudget({ month: '2026-10', lines: BUDGET_CATEGORIES.map((c) => line(c, null, 0)) })));
    check(texts.filter(Boolean));
  });

  it('o aviso dentro do app, em todos os cruzamentos, com e sem valores, em outro ano', () => {
    const texts: string[] = [];
    const l = (usedCents: number) => ({ category: 'Mercado', usedCents, budgetCents: 10_000 });
    for (const before of [0, 5_000, 7_999, 8_500, 10_000, 12_000])
      for (const after of [0, 7_999, 8_000, 9_999, 10_000, 10_001, 25_000])
        for (const hide of [false, true]) {
          for (const month of ['2026-10', '2025-12']) {
            const text = budgetCrossing(l(before), l(after), month, DEMO_TODAY, hide);
            if (text) texts.push(text);
          }
        }
    expect(texts.length).toBeGreaterThan(10);
    // Valores ocultos: nunca um valor em reais.
    for (const t of texts.filter((x) => x.includes('R$'))) expect(t).toMatch(/em R\$ \d/);
    expect(budgetCrossing(l(5_000), l(25_000), '2026-10', DEMO_TODAY, true)).not.toContain('R$');
    check(texts);
  });

  it('as frases do limite pessoal, de 0% a 120% da renda, em dois anos e nos dois limites', () => {
    const texts: string[] = [];
    for (const percent of [10, 30, 60, 100])
      for (let permille = 0; permille <= 1200; permille += 5)
        for (const month of ['2026-10', '2027-01']) {
          const s = limitStatus(month, permille, permille === 0 ? 0 : 100_000, percent, DEMO_TODAY);
          if (s) texts.push(s.line, ...(s.note ? [s.note] : []));
        }
    expect(texts.length).toBeGreaterThan(500);
    check(texts);
    const months = [
      { month: '2026-11', committedPermille: 730, committedCents: 438_000 },
      { month: '2027-02', committedPermille: 1_200, committedCents: 720_000 },
    ];
    check(Object.values(limitNotesFor(months, [{ fromMonth: '2026-10', percent: 60 }], DEMO_TODAY)));
    const crossed = limitCrossing([{ month: '2026-11', committedPermille: 280, committedCents: 1 }], [{ month: '2026-11', committedPermille: 320, committedCents: 1 }], [{ fromMonth: '2026-10', percent: 30 }], DEMO_TODAY);
    expect(crossed).toBe('Com esta conta, novembro chega a 32,0% da renda, acima do limite de 30% que você escolheu.');
    check([crossed!]);
    const F = LIMIT_TEXT.form;
    check([
      F.removeFrom('2026-11'),
      F.removeTitle('2026-11'),
      F.restore(30, '2026-09'),
      F.restoreTitle(30, '2026-11'),
      F.saved(40, '2026-10'),
      F.removed('2026-11'),
      F.endedHere('2026-11'),
      F.existing('2026-10'),
    ]);
  });

  it('o índice de busca tem a tela do orçamento', () => {
    const screen = APP_SCREENS.find((s) => s.id === 'orcamento')!;
    expect(screen.href).toBe('/orcamento');
    check([screen.title, screen.caption, ...screen.keywords]);
    const renda = APP_SCREENS.find((s) => s.id === 'renda-comprometida')!;
    check([renda.title, renda.caption, ...renda.keywords]);
  });

  it('arquivo-fonte budget.ts', () => {
    const text = readFileSync(join(CORE_SRC, 'budget.ts'), 'utf8');
    expect(text).not.toMatch(FORBIDDEN);
    expect(text).not.toMatch(JUDGMENT);
    expect(text).not.toMatch(VETOED);
  });
});

describe('textos das contas de origem (D-043)', () => {
  const GENDERED = /\b(o|a)s? usuári[oa]s?\b|\bobrigad[oa]s?\b|\bbem-vind[oa]s?\b|\bpreocupad[oa]s?\b|\bendividad[oa]s?\b|\bcadastrad[oa]\b|\bbem-vind/i;
  const check = (texts: string[]) => {
    expect(texts.length).toBeGreaterThan(0);
    for (const text of texts) {
      expect(text, text).not.toMatch(FORBIDDEN);
      expect(text, text).not.toMatch(JUDGMENT);
      expect(text, text).not.toMatch(GENDERED);
      expect(text, text).not.toMatch(/\bfaz(er|endo)?\s+sentido\b/i);
      // Nada de travessão longo ou curto (a lista FORBIDDEN já cobre; aqui também o hífen solto entre espaços).
      expect(text, text).not.toMatch(/[\u2013\u2014]/);
    }
  };

  it('ACCOUNTS_TEXT, ACCOUNT_ERROR_TEXT e os rótulos', () => {
    check([...staticStrings(ACCOUNTS_TEXT), ...Object.values(ACCOUNT_ERROR_TEXT), ...Object.values(ACCOUNT_KIND_LABEL)]);
  });

  it('textos montados, em todas as combinações', () => {
    const texts: string[] = [];
    for (const kind of ['banco', 'dinheiro', 'outra'] as const)
      for (const isDefault of [true, false])
        for (const status of ['ativa', 'arquivada'] as const)
          texts.push(ACCOUNTS_TEXT.rowCaption(kind, isDefault, status), ACCOUNTS_TEXT.rowA11y('Carteira', kind, isDefault, status));
    for (const label of [ACCOUNTS_TEXT.out, ACCOUNTS_TEXT.into, ACCOUNTS_TEXT.to]) texts.push(ACCOUNTS_TEXT.single(label, 'Conta principal'));
    texts.push(ACCOUNTS_TEXT.leavingFrom('Carteira'), ACCOUNTS_TEXT.archivedName('Antiga'), ACCOUNTS_TEXT.fromNote('Carteira'));
    for (const code of Object.keys(ACCOUNT_ERROR_TEXT)) texts.push(accountErrorText(code));
    texts.push(accountErrorText('desconhecido'));
    for (const draft of [
      { name: '', kind: null },
      { name: 'x'.repeat(41), kind: 'banco' as const },
      { name: 'Carteira', kind: null },
    ]) {
      const v = validateAccountDraft(draft, [{ id: 'a', name: 'Carteira' }]);
      if (!v.ok) texts.push(...Object.values(v.errors));
    }
    const dup = validateAccountDraft({ name: 'carteira', kind: 'banco' }, [{ id: 'a', name: 'Carteira' }]);
    if (!dup.ok) texts.push(...Object.values(dup.errors));
    check(texts);
  });

  it('o aviso de que é só a origem informada: sem saldo, sem produto e sem recomendação', () => {
    expect(ACCOUNTS_TEXT.intro).toContain('É só a origem informada');
    expect(ACCOUNTS_TEXT.intro).toContain('não guarda saldo nem movimenta dinheiro');
    // Nenhum banco, produto ou oferta nos textos: os exemplos são genéricos.
    const all = [...staticStrings(ACCOUNTS_TEXT), ...Object.values(ACCOUNT_ERROR_TEXT)].join(' ');
    expect(all).not.toMatch(/nubank|ita[uú]|bradesco|santander|caixa econ|picpay|mercado pago|\bxp\b|btg|\bc6\b|\binter\b|poupan[cç]a|investiment/i);
  });

  it('arquivo-fonte accounts.ts', () => {
    const text = readFileSync(join(CORE_SRC, 'accounts.ts'), 'utf8');
    expect(text).not.toMatch(FORBIDDEN);
    expect(text).not.toMatch(JUDGMENT);
  });
});

describe('textos de Buscar em Movimentações (D-045)', () => {
  const GENDERED = /\b(o|a)s? usuári[oa]s?\b|\bobrigad[oa]s?\b|\bbem-vind[oa]s?\b|\bpreocupad[oa]s?\b|\bendividad[oa]s?\b|\bcadastrad[oa]\b/i;
  const check = (texts: string[]) => {
    expect(texts.length).toBeGreaterThan(0);
    for (const text of texts) {
      expect(text, text).not.toMatch(FORBIDDEN);
      expect(text, text).not.toMatch(JUDGMENT);
      expect(text, text).not.toMatch(GENDERED);
      expect(text, text).not.toMatch(/\bfaz(er|endo)?\s+sentido\b/i);
      expect(text, text).not.toMatch(/[–—]/);
      // Nenhum banco, produto ou oferta, e nenhuma palavra de julgamento sobre o gasto.
      expect(text, text).not.toMatch(/nubank|ita[uú]\b|bradesco|santander|caixa econ|picpay|\bxp\b|btg|poupan[cç]a|investiment|\bexcessiv|\bdemais\b|\bgastou muito\b|\bcerto\b|\berrado\b/i);
    }
  };

  it('SEARCH_TEXT inteiro (rótulos, avisos e mensagens fixas)', () => {
    check(staticStrings(SEARCH_TEXT));
  });

  it('textos montados, em todas as combinações', () => {
    const texts: string[] = [];
    for (const n of [0, 1, 2, 12, 1000]) {
      texts.push(SEARCH_TEXT.expenses(n, 193240), SEARCH_TEXT.incomes(n, 600000), SEARCH_TEXT.cardsSummary(n, 230000), SEARCH_TEXT.moreFilters(n));
      texts.push(SEARCH_TEXT.expenses(n, 193240, true), SEARCH_TEXT.incomes(n, 600000, true), SEARCH_TEXT.cardsSummary(n, 230000, true));
    }
    texts.push(SEARCH_TEXT.average(16103), SEARCH_TEXT.shownOf(100, 250), SEARCH_TEXT.showMore(100));
    for (const n of [1, 3, 48]) {
      const caption = SEARCH_TEXT.purchaseCaption('2026-10-05', 'Cartão Exemplo', n);
      texts.push(caption, SEARCH_TEXT.purchaseA11y('Notebook', caption, 'R$ 1.500,00'));
    }
    texts.push(SEARCH_TEXT.purchaseCaption('2026-10-05', null, 1));
    for (const draft of [{ min: 'abc' }, { max: '1,234' }, { min: '50', max: '20' }]) {
      const r = searchFromDraft({ ...DEFAULT_SEARCH_DRAFT, ...draft });
      if (!r.ok) texts.push(...Object.values(r.errors));
    }
    check(texts);
  });

  it('o resumo diz o que a especificação pede e deixa claro que as compras no cartão não somam em Pago', () => {
    expect(SEARCH_TEXT.expenses(12, 193240)).toBe('12 gastos · R$ 1.932,40 no período');
    expect(SEARCH_TEXT.average(16103)).toBe('média de R$ 161,03 por mês com gasto');
    expect(SEARCH_TEXT.expenses(12, 193240, true)).toBe('12 gastos · R$ 1.932,40 nos 1.000 registros mais recentes');
    expect(SEARCH_TEXT.truncated).toBe('A busca olhou só os 1.000 registros mais recentes do período. Escolha um período menor ou use os filtros.');
    expect(SEARCH_TEXT.cardsNote).toContain('só sai quando a fatura é paga');
    expect(SEARCH_TEXT.cardsNote).toContain('não estão somadas em Pago');
    expect(SEARCH_TEXT.summaryCardsNote).toContain('não incluem as compras no cartão');
    expect(SEARCH_TEXT.intro).toContain('Nada do que você busca é guardado');
    expect(SEARCH_PAGE).toBe(100);
  });

  it('os rótulos de período e tipo cobrem tudo e são curtos', () => {
    for (const p of SEARCH_PERIODS) expect(SEARCH_TEXT.periods[p].length, p).toBeGreaterThan(2);
    expect(Object.keys(SEARCH_TEXT.kinds)).toEqual(['todos', 'despesa', 'receita']);
    expect(SEARCH_TEXT.kinds.despesa).toBe('Gastos');
    expect(SEARCH_TEXT.kinds.receita).toBe('Recebimentos');
  });

  it('a tela de busca no índice "No app" e os arquivos-fonte passam', () => {
    const screen = APP_SCREENS.find((s) => s.id === 'buscar-movimentos')!;
    expect(screen.href).toBe('/movimentacoes/buscar');
    check([screen.title, screen.caption, ...screen.keywords]);
    const source = readFileSync(join(CORE_SRC, 'search.ts'), 'utf8');
    expect(source).not.toMatch(FORBIDDEN);
    expect(source).not.toMatch(JUDGMENT);
  });
});

describe('textos das assinaturas (D-046)', () => {
  const GENDERED = /\b(o|a)s? usuári[oa]s?\b|\bobrigad[oa]s?\b|\bbem-vind[oa]s?\b|\bpreocupad[oa]s?\b|\bendividad[oa]s?\b|\bcadastrad[oa]\b/i;
  // Nenhuma marca de serviço, nenhum verbo de ordem sobre cancelar, nenhum julgamento sobre a assinatura.
  const BRANDS =
    /netflix|spotify|amazon|prime video|disney|globoplay|hbo|youtube|apple|google|deezer|paramount|smart ?fit|bluefit|duolingo|\bclaro\b|\bvivo\b|\btim\b|\boi\b|nubank|ita[uú]\b|bradesco|santander/i;
  const ORDERS = /\bcancel(e|ar|amento)\b|\bcancele\b|\bdesperd[ií]c|\bcortes?\b|\bcortar\b|vale a pena|\bsupérfluo|\bgastando demais\b|\bdemais\b|\bexcessiv|\binútil\b|\bdeveria\b/i;
  const check = (texts: string[]) => {
    expect(texts.length).toBeGreaterThan(0);
    for (const text of texts) {
      expect(text, text).not.toMatch(FORBIDDEN);
      expect(text, text).not.toMatch(JUDGMENT);
      expect(text, text).not.toMatch(GENDERED);
      expect(text, text).not.toMatch(BRANDS);
      expect(text, text).not.toMatch(ORDERS);
      expect(text, text).not.toMatch(/\bfaz(er|endo)?\s+sentido\b/i);
      expect(text, text).not.toMatch(/[–—]/);
    }
  };
  const functions = [
    SUBSCRIPTION_TEXT.groupEstimated(9900),
    SUBSCRIPTION_TEXT.totals(13890, 166680),
    SUBSCRIPTION_TEXT.totals(100, 1200),
    SUBSCRIPTION_TEXT.perYear(47880),
    SUBSCRIPTION_TEXT.perMonth(3990),
    SUBSCRIPTION_TEXT.detailYear(47880),
    SUBSCRIPTION_TEXT.keepsCount(0, 1),
    SUBSCRIPTION_TEXT.keepsCount(2, 3),
    SUBSCRIPTION_TEXT.lastReview(null),
    SUBSCRIPTION_TEXT.lastReview('2026-10-07'),
    subscriptionCount(0),
    subscriptionCount(1),
    subscriptionCount(7),
  ];

  it('SUBSCRIPTION_TEXT inteiro (rótulos, avisos e mensagens fixas) e os textos montados', () => {
    check([...staticStrings(SUBSCRIPTION_TEXT), ...functions]);
  });

  it('SUBSCRIPTION_ERROR_TEXT e o texto de cada código', () => {
    check([...Object.values(SUBSCRIPTION_ERROR_TEXT), subscriptionErrorText('assinatura_so_gasto_fixo'), subscriptionErrorText('desconhecido')]);
  });

  it('a reprovação da lista pega o que ela deve', () => {
    for (const bad of ['Cancele já', 'um corte de gastos', 'isso é um desperdício', 'não vale a pena', 'Netflix', 'Assinaturas — todas']) {
      const caught = [FORBIDDEN, JUDGMENT, BRANDS, ORDERS].some((re) => re.test(bad));
      expect(caught, bad).toBe(true);
    }
    // Os textos da própria tela passam, inclusive "Encerrar a partir de…" (encerrar não é cancelar) e "Continua".
    for (const ok of ['Encerrar a partir de…', 'Continua', 'Revisar assinaturas', 'Vale olhar de tempos em tempos se cada uma ainda é usada.']) {
      expect([FORBIDDEN, JUDGMENT, BRANDS, ORDERS].some((re) => re.test(ok)), ok).toBe(false);
    }
  });

  it('o que a tela promete e o que ela não promete', () => {
    expect(SUBSCRIPTION_TEXT.reviewIntro).toBe('Vale olhar de tempos em tempos se cada uma ainda é usada.');
    expect(SUBSCRIPTION_TEXT.reviewNote).toContain('só tira a assinatura do Clarevo');
    expect(SUBSCRIPTION_TEXT.reviewNote).toContain('encerrar também com quem oferece o serviço');
    expect(SUBSCRIPTION_TEXT.reviewFooter).toBe('O Clarevo guarda só a data da revisão.');
    expect(SUBSCRIPTION_TEXT.reminderLaterHint).toContain('só neste aparelho');
    expect(SUBSCRIPTION_TEXT.keepsHint).toContain('não é guardado');
  });

  it('a tela no índice "No app" e o arquivo-fonte passam', () => {
    const screen = APP_SCREENS.find((s) => s.id === 'assinaturas')!;
    expect(screen.href).toBe('/gastos-fixos/assinaturas');
    check([screen.title, screen.caption, ...screen.keywords]);
    for (const q of ['assinatura', 'assinaturas', 'streaming', 'academia', 'plano de celular', 'clube']) {
      expect(searchAppScreens(q).map((x) => x.id), q).toContain('assinaturas');
    }
    // "assinatura" achava Gastos fixos e parcelamentos (o índice de antes) e continua achando.
    expect(searchAppScreens('assinatura').map((x) => x.id)).toContain('gastos-fixos');
    const source = readFileSync(join(CORE_SRC, 'subscriptions.ts'), 'utf8');
    expect(source).not.toMatch(FORBIDDEN);
    expect(source).not.toMatch(JUDGMENT);
    expect(source).not.toMatch(BRANDS);
  });

  it('a demonstração: as descrições de exemplo passam pela mesma lista', async () => {
    const repo = await createDemoRepository();
    const ctx = (await repo.getSpace())!.personalContextId;
    const names = (await repo.listSeries(ctx)).filter((x) => x.subscription).map((x) => x.terms[0]!.description);
    expect(names).toEqual(['Streaming (exemplo)', 'Academia (exemplo)']);
    check(names);
  });
});

describe('textos de Exportar meus dados (D-047)', () => {
  const GENDERED = /\b(o|a)s? usuári[oa]s?\b|\bobrigad[oa]s?\b|\bbem-vind[oa]s?\b|\bpreocupad[oa]s?\b|\bendividad[oa]s?\b|\bcadastrad[oa]\b/i;
  // Nenhum banco, produto ou oferta; a LGPD aparece só como referência, sem parecer jurídico nem promessa.
  const BRAND_OR_PROMISE = /nubank|ita[uú]\b|bradesco|santander|caixa econ|picpay|\bxp\b|btg|poupan[cç]a|investiment|garantid|conforme a lei|em conformidade|certificad/i;
  const check = (texts: string[]) => {
    expect(texts.length).toBeGreaterThan(0);
    for (const text of texts) {
      expect(text, text).not.toMatch(FORBIDDEN);
      expect(text, text).not.toMatch(JUDGMENT);
      expect(text, text).not.toMatch(GENDERED);
      expect(text, text).not.toMatch(BRAND_OR_PROMISE);
      expect(text, text).not.toMatch(/\bfaz(er|endo)?\s+sentido\b/i);
      expect(text, text).not.toMatch(/[–—]/);
    }
  };

  it('EXPORT_TEXT inteiro (rótulos, avisos e mensagens fixas)', () => {
    check(staticStrings(EXPORT_TEXT));
  });

  it('textos montados, em todas as combinações', () => {
    const texts: string[] = [];
    for (const [r, p] of [[0, 0], [1, 0], [2, 0], [1, 1], [124, 3], [20000, 1]] as const) texts.push(EXPORT_TEXT.readyCounts(r, p));
    for (const file of ['lancamentos', 'compras', 'resumo'] as const) for (const native of [true, false]) texts.push(EXPORT_TEXT.fileButton(file, native));
    texts.push(EXPORT_TEXT.readyPeriod(EXPORT_TEXT.periods['12m']), EXPORT_TEXT.pdf.docTitle('2026-10-11'), EXPORT_TEXT.pdf.generated('2026-10-11'));
    texts.push(EXPORT_TEXT.pdf.period('Últimos 12 meses', 'de novembro de 2025 a outubro de 2026'), EXPORT_TEXT.pdf.purchasesTotal(1, 150_000), EXPORT_TEXT.pdf.purchasesTotal(3, 230_000));
    for (const p of EXPORT_PERIODS) texts.push(EXPORT_TEXT.periods[p]);
    for (const f of EXPORT_FORMATS) texts.push(EXPORT_TEXT.formats[f], EXPORT_TEXT.formatHints[f]);
    check(texts);
  });

  it('os avisos que a especificação pede estão no texto', () => {
    expect(EXPORT_TEXT.valuesNote).toBe('O arquivo mostra os valores, mesmo com Ocultar valores ligado.');
    expect(EXPORT_TEXT.portability).toContain('art. 18, V, da LGPD');
    expect(EXPORT_TEXT.portability).toContain('não é parecer jurídico');
    expect(EXPORT_TEXT.intro).toContain('montado neste aparelho');
    expect(EXPORT_TEXT.intro).toContain('não guarda cópia');
    // No Android a cópia temporária fica até a próxima exportação ou até a tela abrir (o app de destino lê o arquivo depois).
    expect(EXPORT_TEXT.readyHint.native).toContain('não guarda cópia');
    expect(EXPORT_TEXT.readyHint.native).toContain('próxima exportação ou quando esta tela é aberta');
    expect(EXPORT_TEXT.fileDone.native).toContain('próxima exportação ou quando esta tela é aberta');
    expect(EXPORT_TEXT.fileDone.native).not.toContain('foi apagada');
    expect(EXPORT_TEXT.notIncluded).toContain('chave da nota fiscal');
    expect(EXPORT_TEXT.notIncluded).toContain('só o final aparece');
    expect(EXPORT_TEXT.contentCsv).toContain('segundo arquivo');
    expect(EXPORT_TEXT.formats).toEqual({ csv: 'Planilha (CSV)', pdf: 'Resumo em PDF' });
    expect(Object.values(EXPORT_TEXT.periods)).toEqual(['Este mês', 'Últimos 3 meses', 'Últimos 6 meses', 'Últimos 12 meses', 'Este ano', 'Ano passado', 'Tudo']);
    expect(EXPORT_TEXT.tooMany).toContain('Escolha um período menor');
  });

  it('a tela no índice "No app", o arquivo-fonte e o HTML e os CSV da demonstração passam', async () => {
    const screen = APP_SCREENS.find((s) => s.id === 'exportar')!;
    expect(screen.href).toBe('/conta/exportar');
    check([screen.title, screen.caption, ...screen.keywords]);
    for (const q of ['exportar', 'planilha', 'pdf', 'backup', 'baixar']) expect(searchAppScreens(q).map((x) => x.id), q).toContain('exportar');
    const source = readFileSync(join(CORE_SRC, 'export.ts'), 'utf8');
    expect(source).not.toMatch(FORBIDDEN);
    expect(source).not.toMatch(JUDGMENT);

    const repo = await createDemoRepository();
    const ctx = (await repo.getSpace())!.personalContextId;
    const load = await loadExportSource(repo, ctx, '12m', DEMO_TODAY, { withInvoices: true });
    if (!load.ok) throw new Error('esperava ok');
    const pdf = buildExportFiles(load.source, 'pdf').files[0]!.content;
    // O texto do PDF (sem a folha de estilo nem as marcas) segue as mesmas regras.
    const plain = pdf.replace(/<style>[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ');
    check(plain.split(/\s{2,}/).filter((t) => t.trim() !== ''));
    for (const file of buildExportFiles(load.source, 'csv').files) expect(file.content).not.toMatch(/[–—]/);
  });
});

describe('textos de importar extrato ou fatura (D-048)', () => {
  const GENDERED = /\b(o|a)s? usuári[oa]s?\b|\bobrigad[oa]s?\b|\bbem-vind[oa]s?\b|\bpreocupad[oa]s?\b|\bendividad[oa]s?\b|\bcadastrad[oa]\b|\(a\)|\(o\)/i;
  // Nenhuma marca de banco, de cartão ou de serviço na interface (as regras de categoria também não citam marca).
  const BRANDS = new RegExp(
    `(?<![\\p{L}\\d])(?:${[
      'netflix', 'spotify', 'amazon', 'disney', 'globoplay', 'youtube', 'apple', 'google', 'nubank', 'itaú', 'itau', 'bradesco', 'santander',
      'inter', 'c6', 'caixa econômica', 'banco do brasil', 'bb', 'sicredi', 'sicoob', 'btg', 'neon', 'picpay', 'mercado pago', 'mercado livre',
      'ifood', 'uber', 'pix', 'visa', 'mastercard', 'elo', 'hipercard', 'amex', 'serasa', 'oi', 'vivo', 'tim', 'claro',
    ].join('|')})(?![\\p{L}\\d])`,
    'iu',
  );
  const check = (texts: string[]) => {
    expect(texts.length).toBeGreaterThan(0);
    for (const text of texts) {
      expect(text, text).not.toMatch(FORBIDDEN);
      expect(text, text).not.toMatch(JUDGMENT);
      expect(text, text).not.toMatch(GENDERED);
      expect(text, text).not.toMatch(BRANDS);
      expect(text, text).not.toMatch(/\bfaz(er|endo)?\s+sentido\b/i);
      expect(text, text).not.toMatch(/[–—]/);
    }
  };
  const functions = [
    IMPORT_TEXT.fileRead('extrato.ofx'),
    IMPORT_TEXT.columnOption(1, ''),
    IMPORT_TEXT.columnOption(2, '01/10/2026'),
    IMPORT_TEXT.columnOption(3, 'Uma descrição bem comprida que passa do corte'),
    IMPORT_TEXT.counts(1, 0),
    IMPORT_TEXT.counts(23, 18),
    IMPORT_TEXT.ignoredLines(1),
    IMPORT_TEXT.ignoredLines(4),
    IMPORT_TEXT.lineInclude('Padaria', 'R$ 45,90', '02/10/2026'),
    IMPORT_TEXT.importButton(0),
    IMPORT_TEXT.importButton(1),
    IMPORT_TEXT.importButton(18),
    IMPORT_TEXT.importing(500, 1200),
    IMPORT_TEXT.partial(500, 1200),
    IMPORT_TEXT.partial(1, 1),
    importedSummary(18, 4),
    importedSummary(1, 1),
    importedSummary(18, 0),
    importedSummary(0, 4),
    importedSummary(0, 0),
    importSaveErrorText('fatura_paga', { description: 'Padaria São João', amount: 'R$ 45,90', date: '02/10/2026' }),
    importSaveErrorText('fatura_paga', { description: '', amount: 'R$ ••••', date: '02/10/2026' }),
    importSaveErrorText('fatura_paga'),
    importSaveErrorText('inexistente'),
    reviewLineA11y('Padaria', 4590, '2026-10-02', 'Saída', 'Já anotado'),
  ];

  it('IMPORT_TEXT inteiro (rótulos, avisos e mensagens fixas) e os textos montados', () => {
    check([...staticStrings(IMPORT_TEXT), ...functions]);
  });

  it('erros de leitura e de gravação, um por código', () => {
    check([...Object.values(IMPORT_ERROR_TEXT), ...Object.values(IMPORT_SAVE_ERROR_TEXT)]);
    expect(Object.keys(IMPORT_ERROR_TEXT).sort()).toEqual(
      ['arquivo_grande', 'arquivo_vazio', 'csv_invalido', 'formato_desconhecido', 'linhas_demais', 'moeda_diferente', 'ofx_invalido', 'sem_lancamentos'].sort(),
    );
  });

  it('a lista pega o que deve e aceita os textos da tela', () => {
    for (const bad of ['Nubank', 'Importar do Itaú', 'Pix recebido', 'a \u2014 b', 'Cuidado', 'o usuário', 'Faça sentido'.replace('Faça', 'Faz').replace('Faz sentido', ['faz', 'sentido'].join(' '))]) {
      const caught = [FORBIDDEN, JUDGMENT, GENDERED, BRANDS].some((re) => re.test(bad));
      expect(caught, bad).toBe(true);
    }
    for (const ok of [IMPORT_TEXT.rowTitle, IMPORT_TEXT.rowCaption, IMPORT_TEXT.labels.ja_anotado, IMPORT_TEXT.labels.parcela, IMPORT_TEXT.labels.pagamento_fatura, IMPORT_TEXT.labels.transferencia]) {
      expect([FORBIDDEN, JUDGMENT, GENDERED, BRANDS].some((re) => re.test(ok)), ok).toBe(false);
    }
  });

  it('o que a tela promete e o que ela não promete', () => {
    expect(IMPORT_TEXT.rowTitle).toBe('Importar extrato ou fatura');
    expect(IMPORT_TEXT.rowCaption).toBe('Arquivo OFX ou planilha do banco');
    expect(IMPORT_TEXT.labels.ja_anotado).toBe('Já anotado');
    expect(IMPORT_TEXT.labels.pagamento_fatura).toBe('Parece pagamento de fatura');
    expect(IMPORT_TEXT.labels.transferencia).toBe('Parece transferência');
    expect(IMPORT_TEXT.labels.parcela).toBe('Parece parcela');
    expect(IMPORT_TEXT.labelHints.parcela).toBe('Compra parcelada: anote uma vez em Anotar gasto, com o número de parcelas.');
    expect(IMPORT_TEXT.reading).toBe('Lendo o arquivo…');
    expect(importSaveErrorText('fatura_paga', { description: 'Padaria', amount: 'R$ 45,90', date: '02/10/2026' })).toBe(
      `${IMPORT_SAVE_ERROR_TEXT.fatura_paga} Linha: Padaria, R$ 45,90, 02/10/2026.`,
    );
    expect(importSaveErrorText('fatura_paga')).toBe(IMPORT_SAVE_ERROR_TEXT.fatura_paga);
    expect(failedItemIndex('item=3', 0)).toBe(2);
    expect(failedItemIndex('item=1', 2)).toBe(1000);
    expect(failedItemIndex('item=500', 1)).toBe(999);
    expect(failedItemIndex('item=0', 0)).toBeNull();
    expect(failedItemIndex('outro', 0)).toBeNull();
    expect(failedItemIndex(undefined, 0)).toBeNull();
    expect(IMPORT_TEXT.selectAll).toBe('Selecionar tudo');
    expect(IMPORT_TEXT.seeInMovements).toBe('Ver em Movimentos');
    expect(IMPORT_TEXT.balanceIgnored).toContain('saldo');
    expect(IMPORT_TEXT.balanceIgnored).toContain('ignorado');
    expect(IMPORT_TEXT.intro).toContain('não é guardado');
    expect(IMPORT_TEXT.limits).toBe('Até 5 MB e 5.000 linhas.');
    expect(IMPORT_TEXT.destinationAccount).toBe('Conta');
    expect(IMPORT_TEXT.destinationCard).toBe('Cartão de crédito');
    expect(IMPORT_TEXT.cardPurchaseNote).toContain('não somam em Pago');
    expect(importedSummary(18, 4)).toBe('18 lançamentos importados, 4 já estavam anotados.');
  });

  it('a tela no índice "No app" acha por importar, extrato, ofx, banco, fatura e planilha; o pagamento da fatura continua em Cartões', () => {
    const screen = APP_SCREENS.find((s) => s.id === 'importar-extrato')!;
    expect(screen.href).toBe('/importar');
    expect(screen.title).toBe(IMPORT_TEXT.rowTitle);
    check([screen.title, screen.caption, ...screen.keywords]);
    for (const q of ['importar', 'extrato', 'ofx', 'banco', 'fatura', 'planilha']) {
      expect(searchAppScreens(q).map((x) => x.id), q).toContain('importar-extrato');
    }
    expect(searchAppScreens('fatura')[0]!.id).toBe('cartoes');
  });

  it('os arquivos-fonte novos passam', () => {
    for (const name of ['importar/textos.ts', 'importar/categorias.ts', 'importar/revisao.ts', 'importar/dedupe.ts']) {
      const source = readFileSync(join(CORE_SRC, name), 'utf8');
      expect(source, name).not.toMatch(FORBIDDEN);
      expect(source, name).not.toMatch(JUDGMENT);
    }
    // As regras de categoria não citam marca nenhuma.
    expect(readFileSync(join(CORE_SRC, 'importar/categorias.ts'), 'utf8')).not.toMatch(BRANDS);
  });
});

describe('textos do guia, da ajuda no lugar, do tour e do manual (D-049)', () => {
  // Nada de adjetivo ou substantivo que marque o gênero de quem lê: "você está pronto", "o usuário", "obrigado", "(a)".
  const GENDERED = /\b(o|a)s? usuári[oa]s?\b|\bobrigad[oa]s?\b|\bbem-vind[oa]s?\b|\bsozinh[oa]s?\b|\bpreocupad[oa]s?\b|\bendividad[oa]s?\b|\bcliente\b|\(a\)|\(o\)|\bo\/a\b|\bvocê (é|está|ficou|estiver|fica) (pront|atent|cansad|convidad|conectad|cadastrad|sozinh|preocupad|satisfeit|segur|ciente)[oa]s?\b/i;
  // "Pix" não está na lista: é o nome do arranjo de pagamentos e é o assunto do passo sobre o comprovante (D-051), como no teste dos
  // textos do comprovante. Nenhum banco, cartão ou serviço pode ser citado.
  const BRANDS = new RegExp(
    `(?<![\\p{L}\\d])(?:${[
      'netflix', 'spotify', 'amazon', 'disney', 'globoplay', 'youtube', 'apple', 'google', 'nubank', 'itaú', 'itau', 'bradesco', 'santander',
      'inter', 'c6', 'caixa econômica', 'banco do brasil', 'bb', 'sicredi', 'sicoob', 'btg', 'neon', 'picpay', 'mercado pago', 'mercado livre',
      'ifood', 'uber', 'visa', 'mastercard', 'elo', 'hipercard', 'amex', 'serasa', 'oi', 'vivo', 'tim', 'claro',
    ].join('|')})(?![\\p{L}\\d])`,
    'iu',
  );
  // Sem produto financeiro nem recomendação: o guia só mostra onde fica e como usar uma função.
  const PRODUCTS = /poupan[cç]a|previd[eê]ncia|deb[eê]nture|fundos? (de|imobili)|cripto\w*|bitcoin|consignad\w*|portabilidade|cons[óo]rcio|\bcdb\b|\blci\b|\blca\b|tesouro|renda fixa|a[cç][õo]es da bolsa|\bmelhor(es)?\b|\bpior(es)?\b|dever[ií]a\w*|renegoci\w*/i;
  // Português do Brasil: nenhum texto com palavra de interface em inglês, e cada frase tem as palavras de ligação do português.
  const ENGLISH = /\b(the|and|with|your|click|tap|please|settings|button|home|screen|back)\b/i;
  const PORTUGUESE = /\b(de|do|da|dos|das|para|em|que|com|você|o|a|os|as|um|uma|no|na|nos|nas|e|ou)\b/i;
  const ALERT = /aten[cç][aã]o|cuidado|alerta|perigo|urgente|erro grave|\batrasad|\bvencid[oa]s? h[aá]|\bdispon[ií]vel|\bsobra\b|\balt[oa]s?\b|estour/i;

  const check = (texts: string[]) => {
    expect(texts.length).toBeGreaterThan(0);
    for (const text of texts) {
      expect(text, text).not.toMatch(FORBIDDEN);
      expect(text, text).not.toMatch(JUDGMENT);
      expect(text, text).not.toMatch(NEUTRAL);
      expect(text, text).not.toMatch(GENDERED);
      expect(text, text).not.toMatch(BRANDS);
      expect(text, text).not.toMatch(PRODUCTS);
      expect(text, text).not.toMatch(ALERT);
      expect(text, text).not.toMatch(ENGLISH);
      expect(text, text).not.toMatch(/\bfaz(er|endo)?\s+sentido\b/i);
      expect(text, text).not.toMatch(/[–—]/);
    }
  };

  const guideFunctions = [
    GUIDE_TEXT.open('Cartões'),
    GUIDE_TEXT.stepA11y(2, 'Toque em "Salvar gasto".'),
    GUIDE_TEXT.whereA11y(['Movimentos', 'Organizar', 'Cartões']),
    GUIDE_TEXT.rowA11y('Resumo do mês', 'Mostra o que você recebeu.'),
    GUIDE_TEXT.rowA11y('Buscar em Movimentos?', 'Acha um gasto.'),
    GUIDE_TEXT.searchRowA11y('Cartões e faturas', 'Cadastra seus cartões.'),
    GUIDE_TEXT.countFor(1, 'boleto'),
    GUIDE_TEXT.countFor(4, ' cartão '),
    HELP_TEXT.sheetLabel('Cartões e faturas'),
    TOUR_TEXT.progress(1, 5),
    TOUR_TEXT.announce(2, 5, 'Anotar um gasto'),
    MANUAL_TEXT.figureAlt('Cartões e faturas'),
  ];

  it('a lista pega o que deve e aceita os textos do guia', () => {
    const proibida = ['faz', 'sentido'].join(' ');
    for (const bad of ['Nubank', 'o usuário', 'Invista já', proibida, 'a \u2014 b', 'a \u2013 b', 'Cuidado', 'a melhor opção', 'Click here', 'Pague com o Mercado Pago', 'obrigado', 'Atenção aqui', 'Você está pronto', 'Você ficou atento']) {
      const caught = [FORBIDDEN, JUDGMENT, NEUTRAL, GENDERED, BRANDS, PRODUCTS, ALERT, ENGLISH].some((re) => re.test(bad));
      expect(caught, bad).toBe(true);
    }
    for (const ok of [GUIDE_TEXT.intro, HELP_TEXT.button, TOUR_TEXT.skip, TOUR_CARDS[0]!.body, 'Toque em "Anotar gasto", logo abaixo do cabeçalho do Resumo.']) {
      expect([FORBIDDEN, JUDGMENT, NEUTRAL, GENDERED, BRANDS, PRODUCTS, ALERT, ENGLISH].some((re) => re.test(ok)), ok).toBe(false);
    }
  });

  it('GUIDE_TEXT, HELP_TEXT, TOUR_TEXT e MANUAL_TEXT inteiros e os textos montados', () => {
    check([...staticStrings(GUIDE_TEXT), ...staticStrings(HELP_TEXT), ...staticStrings(TOUR_TEXT), ...staticStrings(MANUAL_TEXT), ...guideFunctions]);
    expect(GUIDE_TEXT.cardTitle).toBe('Como usar o Clarevo');
    expect(GUIDE_TEXT.tourAgain).toBe('Ver o tour de novo');
    expect(GUIDE_TEXT.purposeTitle).toBe('Para que serve');
    expect(GUIDE_TEXT.whereTitle).toBe('Onde fica');
    expect(GUIDE_TEXT.stepsTitle).toBe('Como usar');
    expect(MANUAL_TEXT.demoBand).toBe('Dados fictícios de demonstração');
    // O nome acessível do botão "?" e dos botões do tour.
    expect(HELP_TEXT.button).toBe('Como usar esta tela');
    expect(TOUR_TEXT.skip).toBe('Pular');
  });

  it('os cinco grupos e os cinco cartões do tour', () => {
    check(GUIDE_GROUPS.flatMap((g) => [g.title, g.caption]));
    check(TOUR_CARDS.flatMap((c) => [c.title, c.body]));
    for (const c of TOUR_CARDS) {
      expect(c.body, c.id).toMatch(/[.]$/);
      expect(c.body, c.id).toMatch(PORTUGUESE);
    }
  });

  it('cada entrada do catálogo: título, para que serve, onde fica, passos, palavras de busca e listas', () => {
    const texts = GUIDE_ENTRIES.flatMap((e) => [
      e.title,
      e.purpose,
      guideSummary(e),
      guideWhere(e.where),
      ...e.where,
      ...(e.alsoWhere ?? []).flatMap((p) => [guideWhere(p), ...p]),
      ...e.steps,
      e.screenName,
      GUIDE_TEXT.open(e.screenName),
      ...e.keywords,
      ...(e.lines ?? []).flatMap((l) => [l.title, l.caption]),
    ]);
    expect(texts.length).toBeGreaterThan(400);
    check(texts);
    for (const e of GUIDE_ENTRIES) {
      expect(e.purpose, e.id).toMatch(/[.]$/);
      expect(e.purpose, e.id).toMatch(PORTUGUESE);
      for (const step of e.steps) {
        // Cada passo é uma frase completa, começa em maiúscula (ou com o nome de uma tela entre aspas) e termina em ponto.
        expect(step, `${e.id}: ${step}`).toMatch(/^[A-ZÁÉÍÓÚÂÊÔÃÕÇ"]/);
        expect(step, `${e.id}: ${step}`).toMatch(/[.]$/);
        expect(step, `${e.id}: ${step}`).toMatch(PORTUGUESE);
      }
    }
  });

  it('dinheiro e privacidade: o guia não traz o valor de ninguém nem dado pessoal, só os limites do próprio app', () => {
    const all = GUIDE_ENTRIES.flatMap((e) => [e.purpose, ...e.steps]).join(' ');
    // Os únicos valores em reais citados são os limites do app e o formato de exemplo dos valores ocultos.
    const amounts = [...all.matchAll(/R\$ ?(?:\d{1,3}(?:\.\d{3})*,\d{2}|•+)/g)].map((m) => m[0]);
    expect([...new Set(amounts)].sort()).toEqual(['R$ 100,00', 'R$ ••••'].sort());
    expect(all).not.toMatch(/\d{3}\.\d{3}\.\d{3}-\d{2}/);
    expect(all).not.toMatch(/@[a-z0-9-]+\.[a-z]/i);
  });

  it('os arquivos-fonte novos do guia passam', () => {
    for (const name of ['guide/catalog.ts', 'guide/text.ts', 'guide/search.ts', 'guide/tour.ts', 'guide/types.ts']) {
      const source = readFileSync(join(CORE_SRC, name), 'utf8');
      expect(source, name).not.toMatch(FORBIDDEN);
      expect(source, name).not.toMatch(JUDGMENT);
    }
  });
});

describe('textos do comprovante de Pix e de pagamento (D-051)', () => {
  const GENDERED = /\b(o|a)s? usuári[oa]s?\b|\bobrigad[oa]s?\b|\bbem-vind[oa]s?\b|\bpreocupad[oa]s?\b|\bendividad[oa]s?\b|\bcadastrad[oa]\b|\(a\)|\(o\)/i;
  // Nenhuma marca de banco, de cartão ou de serviço na interface. "Pix" é o nome do arranjo de pagamentos e é o assunto da tela.
  const BRANDS = new RegExp(
    `(?<![\\p{L}\\d])(?:${[
      'netflix', 'spotify', 'amazon', 'disney', 'globoplay', 'youtube', 'apple', 'google', 'nubank', 'itaú', 'itau', 'bradesco', 'santander',
      'inter', 'c6', 'caixa econômica', 'banco do brasil', 'bb', 'sicredi', 'sicoob', 'btg', 'neon', 'picpay', 'mercado pago', 'mercado livre',
      'ifood', 'uber', 'visa', 'mastercard', 'elo', 'hipercard', 'amex', 'serasa', 'oi', 'vivo', 'tim', 'claro', 'whatsapp', 'pagseguro',
    ].join('|')})(?![\\p{L}\\d])`,
    'iu',
  );
  const check = (texts: string[]) => {
    expect(texts.length).toBeGreaterThan(0);
    for (const text of texts) {
      expect(text, text).not.toMatch(FORBIDDEN);
      expect(text, text).not.toMatch(JUDGMENT);
      expect(text, text).not.toMatch(GENDERED);
      expect(text, text).not.toMatch(BRANDS);
      expect(text, text).not.toMatch(/\bfaz(er|endo)?\s+sentido\b/i);
      expect(text, text).not.toMatch(/[–—]/);
    }
  };
  const reading = (over: Partial<ComprovanteReading> = {}): ComprovanteReading => ({
    kind: 'pix', direction: 'saida', directionGuessed: false, amountCents: 8500, occurredOn: '2026-10-05', time: '14:32', counterpart: 'Maria Souza', message: 'Almoço', ...over,
  });
  const KINDS: ComprovanteKind[] = ['pix', 'ted', 'boleto', 'debito', 'outro'];
  const DIRECTIONS: (ComprovanteDirection | null)[] = ['saida', 'entrada', null];

  it('COMPROVANTE_TEXT inteiro (opção, avisos, lacunas e erros) passa nas regras, sem número nem dado pessoal', () => {
    const fixed = staticStrings(COMPROVANTE_TEXT);
    check(fixed);
    for (const text of fixed) expect(text, text).not.toMatch(/\d|@/);
  });

  it('textos montados, em todas as combinações de tipo e direção', () => {
    const texts: string[] = [COMPROVANTE_TEXT.looksNoted('2026-10-05', 'Padaria', 8500), COMPROVANTE_TEXT.looksNoted('2026-10-05', 'Pix para Maria', 1)];
    for (const kind of KINDS) {
      for (const direction of DIRECTIONS) {
        texts.push(comprovanteKindLabel(kind, direction), comprovanteKindPhrase(kind, direction));
        const base = reading({ kind, direction });
        for (const over of [{}, { amountCents: null }, { occurredOn: null, time: null }, { occurredOn: '2027-01-01' }, { counterpart: null, message: null }, { directionGuessed: true }] as const) {
          const draft = comprovanteDraft({ ...base, ...over }, '2026-10-07');
          texts.push(comprovanteReadLine(draft), ...Object.values(comprovanteGaps(draft)).filter((t): t is string => t !== null));
          for (const screen of ['despesa', 'receita'] as const) {
            const mismatch = comprovanteMismatch(draft, screen);
            if (mismatch) texts.push(mismatch.text, mismatch.action);
            const sug = suggestComprovanteDescription(draft, null, screen);
            texts.push(sug.description, sug.placeholder, ...(sug.legend ? [sug.legend] : []));
          }
        }
      }
    }
    for (const code of ['texto_vazio', 'nota_fiscal', 'nao_e_comprovante'] as const) texts.push(comprovanteErrorText(code));
    check(texts.filter((t) => t !== ''));
  });

  it('o que a tela promete: lê no aparelho, não guarda o arquivo nem documento, chave Pix, conta ou códigos', () => {
    for (const text of [COMPROVANTE_TEXT.sheetPrivacy, COMPROVANTE_TEXT.privacy]) {
      expect(text).toContain('aqui no aparelho');
      expect(text).toContain('não');
      for (const word of ['CPF', 'CNPJ', 'chave Pix', 'conta', 'códigos']) expect(text, word).toContain(word);
    }
    expect(COMPROVANTE_TEXT.option).toBe('Ler comprovante de Pix ou pagamento (PDF)');
    expect(COMPROVANTE_TEXT.lineHint).toBe('Comprovante em PDF, lido aqui no aparelho');
    expect(COMPROVANTE_TEXT.filled).toBe('Preenchemos o que o comprovante informa. Confira e toque em Salvar.');
    expect(COMPROVANTE_TEXT.looksNotedHint).toBe('Pode ser o mesmo lançamento. Se for outro, é só salvar.');
    expect(COMPROVANTE_TEXT.looksNoted('2026-10-05', 'Padaria', 8500)).toBe('Parece já anotado em 05/10/2026: Padaria, R$ 85,00.');
    expect(COMPROVANTE_TEXT.switchToIncome).toBe('Trocar para Registrar recebimento');
    expect(COMPROVANTE_TEXT.switchToExpense).toBe('Trocar para Anotar gasto');
    expect(COMPROVANTE_TEXT.errors.nota_fiscal).toContain('Escanear nota fiscal');
    expect(COMPROVANTE_TEXT.errors.texto_vazio).toContain('foto');
  });

  it('cada mensagem de erro e de lacuna é uma frase completa, que termina em ponto e diz o que fazer', () => {
    for (const text of [...Object.values(COMPROVANTE_TEXT.errors), ...Object.values(COMPROVANTE_TEXT.pdf), COMPROVANTE_TEXT.missingAmount, COMPROVANTE_TEXT.missingDay, COMPROVANTE_TEXT.futureDay, COMPROVANTE_TEXT.missingName, COMPROVANTE_TEXT.directionGuessed]) {
      expect(text, text).toMatch(/^[A-ZÁÉÍÓÚÂÊÔÃÕÇ]/);
      expect(text, text).toMatch(/[.]$/);
    }
  });

  it('as regras novas do core não trazem marca de banco, termo de produto financeiro nem expressão vetada nos arquivos-fonte', () => {
    for (const name of ['comprovante/tipos.ts', 'comprovante/texto.ts', 'comprovante/leitor.ts', 'comprovante/fluxo.ts', 'comprovante/index.ts']) {
      const source = readFileSync(join(CORE_SRC, name), 'utf8');
      expect(source, name).not.toMatch(FORBIDDEN);
      expect(source, name).not.toMatch(JUDGMENT);
      expect(source, name).not.toMatch(BRANDS);
    }
  });
});

describe('textos de "já tinha sido salvo" (revisão do D-050, CL-03 e CL-19)', () => {
  const GENDERED = /\b(o|a)s? usuári[oa]s?\b|\bobrigad[oa]s?\b|\bbem-vind[oa]s?\b|\bpreocupad[oa]s?\b|\bendividad[oa]s?\b|\bcadastrad[oa]\b|\(a\)|\(o\)/i;
  const texts = Object.values(SAVED_BEFORE_TEXT).flatMap((t) => [t.message, t.view, ...(t.another ? [t.another] : [])]);

  it('passam nas regras de texto do produto: sem produto financeiro, julgamento, gênero marcado, travessão nem a expressão proibida', () => {
    expect(texts.length).toBeGreaterThan(30);
    for (const text of texts) {
      expect(text, text).not.toMatch(FORBIDDEN);
      expect(text, text).not.toMatch(JUDGMENT);
      expect(text, text).not.toMatch(GENDERED);
      expect(text, text).not.toMatch(FORBIDDEN_EXPANDED);
      expect(text, text).not.toMatch(/[–—]/);
      expect(text, text).not.toMatch(/\d|@/);
    }
  });

  it('cada formulário tem a sua pergunta, que termina em interrogação, ou o aviso sem pergunta onde um segundo igual não é possível', () => {
    for (const [kind, t] of Object.entries(SAVED_BEFORE_TEXT)) {
      if (t.another) {
        expect(t.message, kind).toMatch(/\?$/);
        expect(t.another, kind).toMatch(/^(Anotar|Criar|Cadastrar|Registrar) (outr[oa]) igual$/);
      } else {
        expect(t.message, kind).toMatch(/\.$/);
      }
      expect(t.view, kind).toMatch(/^Ver /);
    }
  });
});

describe('textos do widget e de "Seu mês em 30 segundos" (D-052)', () => {
  const GENDERED = /\b(o|a)s? usuári[oa]s?\b|\bobrigad[oa]s?\b|\bbem-vind[oa]s?\b|\bpreocupad[oa]s?\b|\bendividad[oa]s?\b|\bcadastrad[oa]\b|\(a\)|\(o\)|\bo\/a\b|\bvocê (é|está|ficou) \w+[oa]\b/i;
  // Sem julgamento nem celebração: o mês é um fato, nunca uma nota. "Alto" e "acima" só no sentido de fato ("acima do orçamento" é do orçamento).
  const VETOED = /\bdemais\b|\balt[oa]s?\b|\bruim\b|cuidado|estour|gastou|gastão|gastona|exagero|\bculpa|\bperigo|\balerta|\bdeveria\b|\bprecisa(m)? (gastar|cortar)|\bcort(ar|e)\b|\bsupérfluo|parab[eé]ns|\bvoc[eê] conseguiu|incr[ií]vel|arrasou|\bvale a pena\b|\bsaldo disponível\b/i;
  const BRANDS = /\b(nubank|ita[uú]|bradesco|santander|c6|sicredi|sicoob|btg|neon|picpay|mercado pago|visa|mastercard|hipercard|amex|serasa)\b/i;
  const check = (texts: string[]) => {
    expect(texts.length).toBeGreaterThan(0);
    for (const text of texts) {
      expect(text, text).not.toMatch(FORBIDDEN);
      expect(text, text).not.toMatch(FORBIDDEN_EXPANDED);
      expect(text, text).not.toMatch(JUDGMENT);
      expect(text, text).not.toMatch(VETOED);
      expect(text, text).not.toMatch(GENDERED);
      expect(text, text).not.toMatch(BRANDS);
      expect(text, text).not.toMatch(/[–—]/);
    }
  };

  /** Os cartões de outubro, de setembro e de um mês vazio, mais variações montadas à mão. */
  async function sampleTexts(): Promise<string[]> {
    return (await sampleParts()).texts;
  }

  async function sampleParts(): Promise<{ texts: string[]; details: string[] }> {
    const repo = await createDemoRepository();
    const ctx = (await repo.getSpace())!.personalContextId;
    const goals = await repo.listGoals(ctx);
    const inputOf = async (month: string, today = DEMO_TODAY): Promise<SeuMesInput> => {
      const [y, m] = month.split('-').map(Number);
      const previous = m === 1 ? `${y! - 1}-12` : `${y}-${String(m! - 1).padStart(2, '0')}`;
      const read = async (mo: string) => {
        const summary = summarizeMonth(await repo.listRecords(ctx, mo), ctx, mo);
        return { summary, breakdown: categoryBreakdown(summary.composition.paid, await loadInvoicesOfRecords(repo, summary.composition.paid, today)) };
      };
      const cur = await read(month);
      return {
        month,
        today,
        summary: cur.summary,
        breakdown: cur.breakdown,
        previousBreakdown: (await read(previous)).breakdown,
        toPay: summarizeToPay(await repo.listCommitments(ctx, month), ctx, month, today),
        budget: summarizeBudget(await repo.getMonthBudget(ctx, month)),
        goals: { count: goals.length, savedInMonthCents: savedInMonth(await repo.listGoalMovementsInMonth(ctx, month), month), plannedCents: plannedForGoals(goals) },
      };
    };
    const views = [
      buildSeuMes(await inputOf('2026-10')),
      buildSeuMes(await inputOf('2026-09')),
      buildSeuMes(await inputOf('2026-01')),
    ];
    const october = await inputOf('2026-10');
    views.push(
      buildSeuMes({ ...october, summary: { ...october.summary, receivedCents: 100_000, paidCents: 130_000, differenceCents: -30_000 } }),
      buildSeuMes({ ...october, goals: { count: 1, savedInMonthCents: -20_000, plannedCents: 0 } }),
      buildSeuMes({ ...october, budget: { ...october.budget!, rows: october.budget!.rows.map((r) => ({ ...r, level: 0 as const })) } }),
      buildSeuMes({ ...october, month: '2027-01', today: '2027-01-10' }),
    );
    const texts: string[] = [];
    const details: string[] = [];
    for (const view of views) {
      if (view.empty) texts.push(view.empty.title, view.empty.body, view.empty.action.label);
      for (const card of view.cards) {
        texts.push(card.title, ...(card.intro ? [card.intro] : []), ...card.notes, ...(card.action ? [card.action.label] : []));
        for (const row of card.rows) {
          texts.push(row.label, ...(row.value ? [row.value] : []), ...row.details, seuMesRowA11y(row));
          details.push(...row.details);
        }
      }
    }
    return { texts, details };
  }

  it('SEU_MES_TEXT e WIDGET_TEXT inteiros (as frases fixas) passam nas regras', () => {
    check(staticStrings(SEU_MES_TEXT));
    check(staticStrings(WIDGET_TEXT));
  });

  it('as frases montadas de Seu mês, em todos os cartões e estados, passam nas regras', async () => {
    const texts = await sampleTexts();
    expect(texts.length).toBeGreaterThan(80);
    check([
      ...texts,
      SEU_MES_TEXT.progress(2, 5),
      SEU_MES_TEXT.announce(2, 5, 'Para onde foi'),
      SEU_MES_TEXT.cards.leftOpen('2026-09', '2026-10'),
      SEU_MES_TEXT.cards.leftOpen('2025-12', '2026-01'),
      SEU_MES_TEXT.where.more(15_000, 'setembro'),
      SEU_MES_TEXT.where.less(8_000, 'dezembro de 2025'),
      SEU_MES_TEXT.where.same('setembro'),
      SEU_MES_TEXT.where.none('setembro'),
      SEU_MES_TEXT.where.others(1),
      SEU_MES_TEXT.where.others(4),
      SEU_MES_TEXT.due.overdue(1),
      SEU_MES_TEXT.due.overdue(3),
      SEU_MES_TEXT.due.more(1),
      SEU_MES_TEXT.due.more(4),
      SEU_MES_TEXT.budget.more(1),
      SEU_MES_TEXT.budget.more(3),
      SEU_MES_TEXT.goals.saved('2026-10', '2026-10'),
      SEU_MES_TEXT.goals.withdrawn('2025-12', '2026-01'),
      SEU_MES_TEXT.entered.nothingYet('2026-10'),
      SEU_MES_TEXT.entered.nothingNoted('2026-09'),
      SEU_MES_TEXT.empty.titleCurrent('2026-10'),
      SEU_MES_TEXT.empty.titlePast('2026-09'),
    ]);
  });

  it('a comparação com o mês anterior é só um fato: "a mais", "a menos", "igual" ou "nada pago", sem julgar', async () => {
    const texts = (await sampleParts()).details.filter((t) => /que em |Igual a |Nada pago/.test(t));
    expect(texts.length).toBeGreaterThan(2);
    for (const text of texts) expect(text, text).toMatch(/^(R\$ [\d.]+,\d{2} a (mais|menos) que em|Igual a|Nada pago nesta categoria em) [a-zç]+( de \d{4})?$/);
    expect(SEU_MES_TEXT.where.more(15_000, 'setembro')).toBe('R$ 150,00 a mais que em setembro');
  });

  it('o conteúdo do widget, em todos os estados, com e sem valores, passa nas regras', async () => {
    const repo = await createDemoRepository();
    const ctx = (await repo.getSpace())!.personalContextId;
    const toPay = summarizeToPay(await repo.listCommitments(ctx, '2026-10'), ctx, '2026-10', DEMO_TODAY);
    const empty = summarizeToPay([], ctx, '2026-10', DEMO_TODAY);
    const texts: string[] = [];
    for (const showValues of [true, false]) {
      for (const demo of [true, false]) {
        for (const [signedIn, list] of [[true, toPay], [true, empty], [true, null], [false, toPay]] as const) {
          const { small, medium } = buildWidgetContent({ today: DEMO_TODAY, signedIn, demo, showValues, toPay: list });
          texts.push(small.label, small.a11y, medium.a11y, ...[medium.title, medium.value, medium.message, medium.overdue, medium.badge, medium.next?.line].filter((t): t is string => t !== null && t !== undefined));
        }
      }
    }
    check(texts);
    // O estado vazio e o sem sessão têm as frases pedidas.
    expect(texts).toContain('Nada em aberto neste mês');
    expect(texts).toContain('Entre no Clarevo para ver');
  });

  it('os arquivos-fonte novos do core passam pelas regras de texto', () => {
    for (const name of ['widget.ts', 'seu-mes.ts']) {
      const source = readFileSync(join(CORE_SRC, name), 'utf8');
      expect(source, name).not.toMatch(FORBIDDEN);
      expect(source, name).not.toMatch(JUDGMENT);
      expect(source, name).not.toMatch(BRANDS);
    }
  });
});

import { SEASONAL_CALENDAR, SEASONAL_TEXT, seasonalCard, seasonalTextSamples } from '../src';

/**
 * Conteúdo de época (Ciclo K2, D-053): o card "Neste mês" e os quatro temas novos (13º salário, férias, volta às aulas e Imposto
 * de Renda), em português do Brasil, neutros quanto a gênero, sem travessões longos, sem a expressão proibida, sem palavra de
 * julgamento nem de alarme, sem produto financeiro, oferta de crédito, nome de banco ou marca, e sem exclamação.
 */
describe('textos de conteúdo de época (D-053)', () => {
  const EPOCA = ['decimo-terceiro', 'ferias', 'volta-as-aulas', 'imposto-de-renda'];
  const GENDERED = /\b(o|a)s? usuári[oa]s?\b|\bobrigad[oa]s?\b|\bbem-vind[oa]s?\b|\bpreocupad[oa]s?\b|\bendividad[oa]s?\b|\bempregad[oa]s?\b|\btrabalhador(a|es|as)?\b|\bcontribuint[ea]s? (que )?(el[ea]|ele)\b|\bsolteir[oa]s?\b|\bcasad[oa]s?\b|\bmãe\b|\bpai\b/i;
  const ALARM = /\b(cuidado|alerta|perigo|urgente|corra|aproveite|imperd[ií]vel|não perca|perca|irrespons[aá]vel|descuid\w*|péssim\w*|ótim\w*|melhor opção|vale a pena)\b|!/i;
  const PRODUCTS = /empr[eé]stimo|financiamento|consignado|investimento|invista|aplica[cç][aã]o|poupan[cç]a|previd[eê]ncia|tesouro|\bcdb\b|\blci\b|\blca\b|cart[aã]o de cr[eé]dito|cr[eé]dito pessoal|antecip\w+ (do )?13/i;
  const BRANDS = /\b(nubank|ita[uú]|bradesco|santander|c6|sicredi|sicoob|btg|neon|picpay|mercado pago|visa|mastercard|hipercard|amex|serasa|xp)\b/i;

  /** Todo o texto de um tema de época: campos exibidos, palavras de busca e as fontes (título, trecho e instituição). */
  const everything = (slug: string): string[] => {
    const t = TOPICS.find((x) => x.slug === slug)!;
    const sources = t.sources.flatMap((s) => (s.kind === 'clarevo' ? [] : s.kind === 'obra' ? [s.title] : [s.publisher, s.title, s.locator ?? '']));
    return [...topicFieldTexts(t), ...sources].filter((x) => x !== '');
  };

  const check = (texts: string[]) => {
    expect(texts.length).toBeGreaterThan(0);
    for (const text of texts) {
      expect(text, text).not.toMatch(FORBIDDEN);
      expect(text, text).not.toMatch(FORBIDDEN_EXPANDED);
      expect(text, text).not.toMatch(JUDGMENT);
      expect(text, text).not.toMatch(ALARM);
      expect(text, text).not.toMatch(GENDERED);
      expect(text, text).not.toMatch(BRANDS);
      expect(learnForbiddenMatch(text, null), text).toBeNull();
    }
  };

  it('as listas reprovam o que devem e aceitam o texto de época', () => {
    for (const bad of ['Cuidado com o prazo', 'Não perca', 'Aproveite!', 'Peça um empréstimo', 'O trabalhador recebe', 'a empregada', 'investimento']) {
      expect(ALARM.test(bad) || GENDERED.test(bad) || PRODUCTS.test(bad), bad).toBe(true);
    }
    for (const ok of ['Quem trabalha com carteira assinada recebe o 13º salário em duas parcelas.', 'Confira a data oficial do ano no site da Receita.', 'O Clarevo não calcula nem entrega a declaração.']) {
      expect(ALARM.test(ok) || GENDERED.test(ok) || PRODUCTS.test(ok), ok).toBe(false);
    }
  });

  it('o card "Neste mês" e as calculadoras ligadas, em todos os meses', () => {
    const texts = [...seasonalTextSamples(), SEASONAL_TEXT.title, ...SEASONAL_CALENDAR.map((m) => SEASONAL_TEXT.caption(String(m.month)))];
    expect(texts.length).toBeGreaterThan(15);
    check(texts);
    // O título e a legenda não contam nem julgam: "Neste mês" e "Temas para outubro".
    expect(SEASONAL_TEXT.title).toBe('Neste mês');
    expect(SEASONAL_TEXT.caption('outubro')).toBe('Temas para outubro');
  });

  it('as linhas do card: título, subtítulo e legenda de cada tema e calculadora de cada mês', () => {
    for (const m of SEASONAL_CALENDAR) {
      const card = seasonalCard(`2026-${String(m.month).padStart(2, '0')}-10`);
      if (!card) continue;
      check(card.topics.flatMap((t) => [t.title, t.subtitle ?? '', t.short]).filter((x) => x !== ''));
      if (card.calculators.length > 0) check(card.calculators.flatMap((c) => [c.title, c.caption]));
    }
  });

  it.each(EPOCA)('tema %s: campos, palavras de busca e fontes passam nas regras', (slug) => {
    check(everything(slug));
    // Nenhum produto financeiro nem oferta de crédito nos textos exibidos.
    for (const text of topicFieldTexts(TOPICS.find((t) => t.slug === slug)!)) expect(text, text).not.toMatch(PRODUCTS);
  });

  it('o arquivo do calendário e o dos temas passam pelas regras de texto', () => {
    for (const file of [join('learn', 'epoca.ts'), join('learn', 'topics', 'epoca.ts')]) {
      const source = readFileSync(join(CORE_SRC, file), 'utf8');
      expect(source, file).not.toMatch(FORBIDDEN);
      expect(source, file).not.toMatch(FORBIDDEN_EXPANDED);
      expect(source, file).not.toMatch(/[–—]/);
    }
  });

  it('o 13º, as férias e o Imposto de Renda dizem o que o Clarevo não faz: não calcula desconto nem entrega a declaração', () => {
    const decimo = topicFieldTexts(TOPICS.find((t) => t.slug === 'decimo-terceiro')!).join(' ');
    expect(decimo).toContain('O Clarevo não calcula os descontos');
    const ir = topicFieldTexts(TOPICS.find((t) => t.slug === 'imposto-de-renda')!).join(' ');
    expect(ir).toContain('O Clarevo não calcula nem entrega a declaração');
    expect(ir).toContain('Confira a data oficial do ano no site da Receita');
  });
});

import { OVERFLOW_MIN_TENTHS, budgetRow, groupPermilleShares as groupShares, limitAmountCents, overflowBar as overflowOf } from '../src';

/**
 * Decisões de 16/10/2026 (D-054): o estorno no orçamento (E1), o excedente acima de 100% e o aviso de 80% dispensável (CL-10), a
 * legenda do Resumo (CL-05) e o widget com valores ocultos (P-027). Em português do Brasil, neutros quanto a gênero, sem travessões
 * longos, sem a expressão proibida e sem tom de julgamento ("estourou", "excedeu", "alerta").
 */
describe('textos das decisões de 16/10/2026 (D-054)', () => {
  const GENDERED = /\b(o|a)s? usuári[oa]s?\b|\bobrigad[oa]s?\b|\bbem-vind[oa]s?\b|\bpreocupad[oa]s?\b|\bendividad[oa]s?\b|\bcadastrad[oa]\b|\(a\)|\(o\)|\bo\/a\b|\bvocê (é|está|ficou) \w+[oa]\b/i;
  const VETOED = /estour|\bexcedeu\b|\bexcedid|gastou demais|controle-se|\bcuidado|\balerta|perigo|\bculpa|\bgastão|\bgastona|\bdeveria\b|\bprecisa(m)? (gastar|cortar)|\bcort(ar|e)\b/i;
  const check = (texts: string[]) => {
    expect(texts.length).toBeGreaterThan(0);
    for (const text of texts) {
      expect(text, text).not.toMatch(FORBIDDEN);
      expect(text, text).not.toMatch(FORBIDDEN_EXPANDED);
      expect(text, text).not.toMatch(JUDGMENT);
      expect(text, text).not.toMatch(VETOED);
      expect(text, text).not.toMatch(GENDERED);
      expect(text, text).not.toMatch(/[–—]/);
      expect(text, text).not.toMatch(/!/);
    }
  };

  it('o estorno no orçamento: a regra, a sugestão "Editar compra" e a nota do card', () => {
    const R = CARDS_TEXT.refundBudget;
    check([
      R.rule,
      R.editInstead,
      R.editA11y('Tênis de corrida', 80_000, 4),
      R.editA11y('Restaurante', 8_990, 1),
      R.editCaption(80_000, 4),
      R.editCaption(8_990, 1),
      BUDGET_TEXT.refundNote(15_000),
      BUDGET_TEXT.refundNote(1),
    ]);
    // Uma linha neutra: uma frase só, sem quebra de linha, que diz o mês da fatura e que o usado do mês da compra não diminui.
    expect(R.rule).not.toMatch(/\n/);
    expect(R.rule).toContain('mês da fatura em que foi informado');
    expect(R.rule).toContain('o usado do mês da compra no orçamento não diminui');
    expect(R.editInstead).toContain('Editar compra');
    expect(R.editA11y('Tênis', 80_000, 4)).toBe('Editar compra Tênis, R$ 800,00 em 4 vezes');
    expect(R.editA11y('Café', 890, 1)).toBe('Editar compra Café, R$ 8,90');
    expect(R.editCaption(80_000, 4)).toBe('R$ 800,00 em 4x');
    expect(BUDGET_TEXT.refundNote(15_000)).toBe(`Inclui estorno de R$ 150,00. ${R.rule}`);
  });

  it('a frase do estorno é a mesma no orçamento, no formulário e no detalhe do estorno (as telas leem do core, sem texto próprio)', () => {
    const read = (file: string) => readFileSync(join(APP_SRC, file), 'utf8');
    const budgetScreen = read(join('app', 'orcamento', 'index.tsx'));
    const form = read(join('components', 'invoice-entry-form.tsx'));
    const invoice = read(join('app', 'cartoes', '[id]', 'fatura', '[mes]', 'index.tsx'));
    expect(budgetScreen).toContain('BUDGET_TEXT.refundNote(');
    expect(form).toContain('CARDS_TEXT.refundBudget');
    expect(form).toContain('R.rule');
    expect(form).toContain('R.editInstead');
    expect(invoice).toContain('T.refundBudget.rule');
    // Nenhuma tela repete a frase com palavras próprias.
    for (const [name, source] of [['orçamento', budgetScreen], ['formulário', form], ['fatura', invoice]] as const) {
      expect(source, name).not.toContain('o usado do mês da compra');
      expect(source, name).not.toContain('conta no mês da fatura em que foi informado');
    }
  });

  it('acima de 100%: "R$ X acima", "R$ X acima do orçamento" e "R$ X acima do limite", do menor ao maior valor', () => {
    const texts: string[] = [];
    for (const cents of [1, 99, 100, 1_230, 10_000, 780_000, 999_999_999]) {
      texts.push(BUDGET_TEXT.overShort(cents), BUDGET_TEXT.over(cents), LIMIT_TEXT.overShort(cents), LIMIT_TEXT.overA11y(cents));
    }
    check(texts);
    expect(BUDGET_TEXT.overShort(10_000)).toMatch(/^R\$ 100,00 acima$/);
    expect(LIMIT_TEXT.overA11y(78_000)).toBe('R$ 780,00 acima do limite');
    // Cada barra que passa de 100% tem o texto: nunca só o desenho.
    for (const used of [30_001, 31_000, 40_000, 60_000, 900_000]) {
      const row = budgetRow({ category: 'Lazer', budgetId: 'b', budgetVersion: 1, budgetFrom: '2026-10', budgetCents: 30_000, usedCents: used });
      expect(row.stripedTenths, String(used)).toBeGreaterThanOrEqual(OVERFLOW_MIN_TENTHS);
      expect(row.overText, String(used)).toBe(`R$ ${((used - 30_000) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} acima`);
      expect(row.a11yLabel).toContain(`${row.overA11y}.`);
    }
    expect(overflowOf(30_000, 30_000).stripedTenths).toBe(0);
    expect(limitAmountCents(600_000, 60)).toBe(360_000);
  });

  it('o aviso de 80% e o "Dispensar aviso": nomes, dica e o aviso em todos os percentuais de 80 a 99', () => {
    const texts: string[] = [BUDGET_TEXT.dismissNotice, BUDGET_TEXT.dismissNoticeHint];
    for (const p of [80, 84, 99]) texts.push(BUDGET_TEXT.nearNotice(p));
    for (const category of BUDGET_CATEGORIES) for (const month of ['2026-10', '2027-01']) texts.push(BUDGET_TEXT.dismissNoticeA11y(category, month));
    check(texts);
    expect(BUDGET_TEXT.dismissNotice).toBe('Dispensar aviso');
    // O nome acessível contém o texto visível do botão (rótulo no nome).
    expect(BUDGET_TEXT.dismissNoticeA11y('Mercado', '2026-10')).toBe('Dispensar aviso de Mercado em outubro de 2026');
    expect(BUDGET_TEXT.dismissNoticeA11y('Mercado', '2026-10')).toContain(BUDGET_TEXT.dismissNotice);
    expect(BUDGET_TEXT.nearNotice(84)).toBe('Chegou a 84% do orçamento.');
    // O aviso do card diz o mês só na dica (volta no mês seguinte) e nunca vira cobrança.
    expect(BUDGET_TEXT.dismissNoticeHint).toContain('volta no mês seguinte');
  });

  it('a legenda do topo do Resumo, em qualquer data e mês', () => {
    const texts: string[] = [];
    for (const today of ['2026-10-07', '2026-10-31', '2026-12-01', '2027-02-28']) for (const month of ['2026-09', '2026-10', '2026-12', '2027-02']) texts.push(SUMMARY_NAV_TEXT.differenceCaption(month, today));
    check(texts);
    expect(SUMMARY_NAV_TEXT.differenceCaption('2026-10', '2026-10-07')).toBe('Recebido menos pago até 07/10 · não é saldo');
    for (const t of texts) expect(t.endsWith('não é saldo'), t).toBe(true);
  });

  it('a nota de percentuais da renda comprometida segue sem texto novo: os grupos só mudam de número', () => {
    // A tela não ganha frase sobre arredondamento; a soma fecha no total (docs/02). O core mantém a ordem e os rótulos de sempre.
    expect(groupShares({ committedPermille: 730, fixedCents: 268_000, annualCents: 0, installmentCents: 85_000, cardCents: 55_000, otherCents: 30_000 })).toEqual({
      fixos: 447,
      anuais: 0,
      parcelamentos: 142,
      faturas: 91,
      outras: 50,
    });
  });

  it('o widget com valores ocultos: "Próxima conta" e o prazo, sem nome, sem valor e sem data', () => {
    const texts: string[] = [WIDGET_TEXT.medium.nextHidden, WIDGET_TEXT.showValuesCaption, WIDGET_TEXT.explain];
    for (const when of ['2026-10-07', '2026-10-08', '2026-10-10', '2026-10-31']) {
      const toPay = {
        month: '2026-10',
        isCurrentMonth: true,
        items: [{ id: 'a' }],
        toPayCents: 12_345,
        overdueCount: 0,
        nextDue: { id: 'a', description: 'Condomínio', amountCents: 12_345, amountIsEstimate: false, dueOn: when },
      } as never;
      const medium = buildWidgetContent({ today: DEMO_TODAY, signedIn: true, demo: false, showValues: false, toPay }).medium;
      texts.push(medium.next!.line, medium.a11y);
      expect(medium.next!.line, when).toMatch(/^Próxima conta · (hoje|amanhã|em \d+ dias)$/);
      expect(medium.a11y, when).not.toMatch(/Condomínio|\d{1,2}\/\d{2}|\d,\d{2}/);
    }
    check(texts);
  });
});

import {
  EVOLUTION_TEXT,
  EVOLUTION_WINDOWS,
  MONTH_CHECK_TEXT,
  buildEvolutionView,
  buildPhase3View,
  committedEvolutionPoints,
  evolutionMonths,
  evolutionSubtitle,
  phase3Empty,
  phase3Panel,
  savingsEvolutionPoints,
  monthCheckTextSamples,
  evolutionAnnouncement,
  evolutionExplainPlan,
  evolutionExplanation,
  evolutionFetchRange,
  evolutionPanel,
  evolutionVariation,
  paidCategoryParts,
  receivedCategoryParts,
  type EvolutionMetric,
  type FinancialRecord as EvolutionRecord,
  type MonthOverview as EvolutionOverviewRow,
} from '../src';

/**
 * Textos da Evolução (D-057): pt-BR neutro quanto a gênero, sem travessão longo, sem a expressão vetada, sem palavra de julgamento
 * ("gastou demais", "aumentou muito"), sem produto financeiro e sem marca. A variação entre dois meses é só um fato ("a mais", "a menos",
 * "sem diferença"), com as duas datas, e nunca fala em "mês a mês" entre meses que não são vizinhos.
 */
describe('textos da Evolução (D-057)', () => {
  const GENDERED = /\b(o|a)s? usuári[oa]s?\b|\bobrigad[oa]s?\b|\bbem-vind[oa]s?\b|\bpreocupad[oa]s?\b|\bendividad[oa]s?\b|\bcadastrad[oa]\b|\(a\)|\(o\)|\bo\/a\b|\bvocê (é|está|ficou) \w+[oa]\b/i;
  const VETOED =
    /\bdemais\b|\balt[oa]s?\b|\bbaix[oa]s?\b|\bruim\b|cuidado|estour|gastou|gastão|gastona|exagero|\bculpa|\bperigo|\balerta|\bdeveria\b|\bprecisa(m)? (gastar|cortar)|\bcort(ar|e)\b|\bsupérfluo|parab[eé]ns|\bvoc[eê] conseguiu|incr[ií]vel|arrasou|\bvale a pena\b|\bsaldo disponível\b|aumentou|diminuiu|despencou|disparou|\bmuito\b|\bpouco\b|\batípic|\bdescontrol/i;
  const BRANDS = /\b(nubank|ita[uú]|bradesco|santander|c6|sicredi|sicoob|btg|neon|picpay|mercado pago|visa|mastercard|hipercard|amex|serasa)\b/i;
  const check = (texts: string[]) => {
    expect(texts.length).toBeGreaterThan(0);
    for (const text of texts) {
      expect(text, text).not.toMatch(FORBIDDEN);
      expect(text, text).not.toMatch(FORBIDDEN_EXPANDED);
      expect(text, text).not.toMatch(JUDGMENT);
      expect(text, text).not.toMatch(VETOED);
      expect(text, text).not.toMatch(GENDERED);
      expect(text, text).not.toMatch(BRANDS);
      expect(text, text).not.toMatch(/[–—]/);
    }
  };

  const row = (month: string, paidCount: number, paidCents: number, receivedCount = 0, receivedCents = 0): EvolutionOverviewRow => ({ month, receivedCount, receivedCents, paidCount, paidCents });
  /** Seis meses de 2026 (março sem Recebido) com abril em destaque, e outubro como mês atual (em andamento). */
  const overview = [
    row('2026-01', 10, 320_000, 2, 500_000),
    row('2026-02', 11, 340_000, 2, 500_000),
    row('2026-03', 12, 330_000),
    row('2026-04', 13, 780_000, 2, 520_000),
    row('2026-05', 14, 345_000, 2, 500_000),
    row('2026-06', 15, 360_000, 2, 510_000),
    row('2026-10', 3, 90_000, 1, 10_000),
  ];

  /** Um lançamento de teste: o valor do mês dividido em Casa (3/5), Mercado (1/5) e Sem categoria, com um pagamento de fatura entre eles. */
  const record = (id: string, category: string | null, amountCents: number, occurredOn: string, kind: 'despesa' | 'receita'): EvolutionRecord => ({
    id,
    contextId: 'c',
    accountId: 'a',
    kind,
    status: 'realizado',
    amountCents,
    currency: 'BRL',
    occurredOn,
    description: category ? `Lançamento de ${category}` : 'Lançamento sem categoria',
    category,
    commitmentId: null,
    invoice: null,
    receiptKey: null,
    createdBy: 'p',
    version: 1,
    createdAt: `${occurredOn}T00:00:00Z`,
    updatedAt: `${occurredOn}T00:00:00Z`,
  });
  const recordsOf = (month: string, cents: number, kind: 'despesa' | 'receita'): EvolutionRecord[] => {
    if (cents <= 0) return [];
    const casa = Math.floor((cents * 3) / 5);
    const mercado = Math.floor(cents / 5);
    return [record(`${month}-a`, 'Casa', casa, `${month}-05`, kind), record(`${month}-b`, 'Mercado', mercado, `${month}-12`, kind), record(`${month}-c`, null, cents - casa - mercado, `${month}-20`, kind)].filter((r) => r.amountCents > 0);
  };
  /** Os textos de "Entender o que mudou" do mês escolhido: o plano, e a explicação quando há mês de comparação e partes que fecham os totais. */
  function explainTexts(view: ReturnType<typeof buildEvolutionView>, month: string, metric: EvolutionMetric): string[] {
    const plan = evolutionExplainPlan(view, month);
    const texts = [...plan.notices, ...(plan.hint ? [plan.hint] : []), ...(plan.adjacencyText ? [plan.adjacencyText] : []), ...(plan.unavailableText ? [plan.unavailableText] : []), ...(plan.compare ? [plan.compare.label, plan.compare.hint] : [])];
    if (!plan.visible || plan.baseMonth === null) return texts;
    const kind = metric === 'pago' ? 'despesa' : 'receita';
    const parts = (m: string, cents: number) => (metric === 'pago' ? paidCategoryParts(recordsOf(m, cents, kind)) : receivedCategoryParts(recordsOf(m, cents, kind)));
    const e = evolutionExplanation(plan, parts(plan.baseMonth, plan.baseCents), parts(plan.month, plan.cents));
    return [...texts, e.headline, e.categoriesTitle, e.note, ...e.categories.map((c) => c.text), ...(e.othersText ? [e.othersText] : []), ...(e.noChangeText ? [e.noChangeText] : []), ...(e.limitation ? [e.limitation] : []), ...(e.related ? [e.related.title, e.related.intro, ...(e.related.emptyText ? [e.related.emptyText] : []), ...e.related.rows.flatMap((r) => [r.text, r.a11y, ...(r.partialText ? [r.partialText] : [])])] : [])];
  }

  /** Todo texto montado pela tela, em todos os estados e com várias seleções. */
  function samples(): string[] {
    const texts: string[] = [];
    const hiddenSets: string[][] = [[], ['2026-04'], ['2026-02', '2026-04'], ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06']];
    for (const metric of ['recebido', 'pago'] as EvolutionMetric[]) {
      for (const windowMonths of EVOLUTION_WINDOWS) {
        for (const hiddenMonths of hiddenSets) {
          // Março e abril com sinal de lacuna (D04): o aviso entra no nome do ponto, no painel e na tabela.
          const view = buildEvolutionView({ overview, metric, windowMonths, currentMonth: '2026-10', hiddenMonths, gapMonths: ['2026-03', '2026-04'] });
          texts.push(evolutionAnnouncement(view), EVOLUTION_TEXT.custom.banner(view.outCount, view.eligibleCount), EVOLUTION_TEXT.custom.list(view.stats.hiddenMonths, view.outsideMonths));
          texts.push(EVOLUTION_TEXT.chart.span(view.from, view.to), EVOLUTION_TEXT.chart.title(metric), EVOLUTION_TEXT.chart.maxValue(view.maxCents));
          texts.push(EVOLUTION_TEXT.stats.ofMonths(view.stats.visibleCount, view.eligibleCount));
          for (const p of view.points) {
            texts.push(p.name, p.title, p.stateText, p.includedText, ...(p.valueText ? [p.valueText] : []));
            const panel = evolutionPanel(view, p.month);
            texts.push(panel.title, panel.valueCaption, panel.stateText, EVOLUTION_TEXT.panel.seeRecordsHint(p.month), p.stateLabel, ...(panel.notEligibleText ? [panel.notEligibleText] : []));
            texts.push(...(panel.gapText ? [panel.gapText] : []), ...(panel.previousMonth ? [EVOLUTION_TEXT.panel.stepHint(panel.previousMonth)] : []), ...(panel.nextMonth ? [EVOLUTION_TEXT.panel.stepHint(panel.nextMonth)] : []));
            const v = panel.variation;
            texts.push(v.text, ...(v.available ? [...(v.percentText ? [v.percentText] : []), ...(v.skippedText ? [v.skippedText] : [])] : []));
            texts.push(panel.categoriesNote, EVOLUTION_TEXT.panel.categoryShare('12,5%', metric));
            texts.push(...explainTexts(view, p.month, metric));
          }
        }
      }
    }
    // Variações de março para abril, de abril para maio, sem diferença e base zero.
    const pair = (a: number, b: number) =>
      evolutionVariation(buildEvolutionView({ overview: [row('2026-03', 1, a), row('2026-04', 1, b)], metric: 'pago', windowMonths: 3, currentMonth: '2026-05', hiddenMonths: [] }), '2026-04');
    for (const v of [pair(330_000, 780_000), pair(780_000, 330_000), pair(100, 100), pair(0, 5_000), pair(100_000_000, 100_000_001)]) {
      texts.push(v.text, ...(v.available ? [...(v.percentText ? [v.percentText] : []), ...(v.skippedText ? [v.skippedText] : [])] : []));
    }
    texts.push(
      EVOLUTION_TEXT.custom.banner(1, 1),
      EVOLUTION_TEXT.custom.list(['2026-05'], ['2025-11']),
      EVOLUTION_TEXT.custom.list(['2026-05'], ['2025-11', '2026-01', '2026-03']),
      EVOLUTION_TEXT.gap.warning,
      EVOLUTION_TEXT.table.rowHint,
      EVOLUTION_TEXT.custom.scope('pago'),
      EVOLUTION_TEXT.custom.scope('recebido'),
      EVOLUTION_TEXT.states.noRecordsBody('pago'),
      EVOLUTION_TEXT.states.noRecordsBody('recebido'),
      ...([3, 6, 12] as const).flatMap((w) => EVOLUTION_TEXT.states.olderMonths(w) ?? []),
      EVOLUTION_TEXT.panel.noRecords('pago'),
      EVOLUTION_TEXT.panel.noRecords('recebido'),
      EVOLUTION_TEXT.panel.categoryShare('35,9%'),
      EVOLUTION_TEXT.variation.skippedOut(['2026-02', '2026-03', '2026-04']),
      EVOLUTION_TEXT.variation.skippedEmpty(['2026-03']),
      EVOLUTION_TEXT.variation.skippedEmpty(['2026-02', '2026-03']),
      EVOLUTION_TEXT.variation.percentTiny(true, '2026-03'),
      EVOLUTION_TEXT.variation.percentTiny(false, '2026-03'),
      EVOLUTION_TEXT.stats.announce(339_000, 340_000, 5, 6),
      EVOLUTION_TEXT.explain.headline('pago', 450_000, '2026-03', '2026-04'),
      EVOLUTION_TEXT.explain.headline('recebido', -20_000, '2026-02', '2026-04'),
      EVOLUTION_TEXT.explain.headline('pago', 0, '2025-12', '2026-01'),
      EVOLUTION_TEXT.explain.hint('2025-12', '2026-01'),
      EVOLUTION_TEXT.explain.notAdjacent('2026-03', '2026-06', ['2026-04'], ['2026-05']),
      EVOLUTION_TEXT.explain.notAdjacent('2026-01', '2026-05', ['2026-02', '2026-03', '2026-04'], []),
      EVOLUTION_TEXT.explain.gapIn('2026-03'),
      EVOLUTION_TEXT.explain.category('recebido', 'Salário', 0, 520_000, '2026-02', '2026-04'),
      EVOLUTION_TEXT.explain.category('pago', 'Sem categoria', 30_000, 0, '2026-03', '2026-04'),
      EVOLUTION_TEXT.explain.others(10_000),
      EVOLUTION_TEXT.explain.others(-10_000),
      EVOLUTION_TEXT.explain.relatedIntro('Transporte', '2026-04'),
      EVOLUTION_TEXT.explain.relatedEmpty('Casa', '2026-04'),
      EVOLUTION_TEXT.explain.relatedRow('Reparo do carro', '2026-04-22', 440_000),
      EVOLUTION_TEXT.explain.relatedRowA11y('Fatura do cartão', '2026-04-10', 60_000, true),
    );
    return texts;
  }

  it('as frases fixas passam nas regras', () => {
    check(staticStrings(EVOLUTION_TEXT));
    expect(staticStrings(EVOLUTION_TEXT).length).toBeGreaterThan(60);
  });

  it('as frases montadas, em todos os estados, com as duas métricas e as três janelas, passam nas regras', () => {
    const texts = samples();
    expect(texts.length).toBeGreaterThan(400);
    check(texts);
  });

  it('o arquivo-fonte da tela passa pelas regras de texto', () => {
    const source = readFileSync(join(CORE_SRC, 'evolucao-tela.ts'), 'utf8');
    expect(source).not.toMatch(FORBIDDEN);
    expect(source).not.toMatch(JUDGMENT);
    expect(source).not.toMatch(BRANDS);
  });

  it('as frases pedidas pela especificação existem como estão', () => {
    expect(EVOLUTION_TEXT.title).toBe('Evolução');
    expect(EVOLUTION_TEXT.subtitle).toBe('Valores registrados, pela data do pagamento');
    expect(EVOLUTION_TEXT.stats.average).toBe('Média dos meses na comparação');
    expect(EVOLUTION_TEXT.stats.median).toBe('Mediana dos meses na comparação');
    expect(EVOLUTION_TEXT.stats.total).toBe('Total dos meses exibidos');
    expect(EVOLUTION_TEXT.table.show).toBe('Ver valores mês a mês');
    expect(EVOLUTION_TEXT.table.columns.included).toBe('Na comparação?');
    expect(EVOLUTION_TEXT.panel.switchLabel).toBe('Mostrar este mês na comparação');
    expect(EVOLUTION_TEXT.panel.switchCaption).toBe('Tirar da comparação não apaga nem muda nenhum lançamento.');
    expect(EVOLUTION_TEXT.panel.state.com_registros).toBe('Com registros');
    expect(EVOLUTION_TEXT.panel.state.em_andamento).toBe('Mês em andamento');
    expect(EVOLUTION_TEXT.panel.noRecords('pago')).toBe('Sem registros: mês sem anotação não quer dizer mês sem gastos');
    expect(EVOLUTION_TEXT.states.allOutTitle).toBe('Escolha ao menos um mês para comparar');
    expect(EVOLUTION_TEXT.custom.restore).toBe('Restaurar todos');
    expect(EVOLUTION_TEXT.retry).toBe('Tentar de novo');
    expect(EVOLUTION_TEXT.custom.banner(2, 6)).toBe('Comparação personalizada: 2 de 6 meses fora da comparação');
    expect(EVOLUTION_TEXT.legend.excluded).toBe('Fora da comparação');
    expect(evolutionFetchRange('2026-10')).toEqual({ from: '2025-11', to: '2026-10' });
  });

  it('"Entender o que mudou" (fase 2): as frases pedidas existem como estão', () => {
    const E = EVOLUTION_TEXT.explain;
    expect(E.title).toBe('Entender o que mudou');
    expect(E.headline('pago', 450_000, '2026-03', '2026-04')).toBe('O Pago registrado foi R$ 4.500,00 maior em abril que em março.');
    expect(E.headline('pago', -1_000, '2026-03', '2026-04')).toBe('O Pago registrado foi R$ 10,00 menor em abril que em março.');
    expect(E.headline('pago', 0, '2026-03', '2026-04')).toBe('O Pago registrado foi igual em abril e em março.');
    expect(E.notAdjacent('2026-03', '2026-05', ['2026-04'], [])).toBe('(março e maio não são meses vizinhos na comparação: abril está fora)');
    expect(E.category('pago', 'Casa', 120_000, 560_000, '2026-03', '2026-04')).toBe('Casa: R$ 1.200,00 em março, R$ 5.600,00 em abril, R$ 4.400,00 a mais');
    expect(E.others(10_000)).toBe('Outras categorias também mudaram: R$ 100,00 a mais no total.');
    expect(E.others(-10_000)).toBe('Outras categorias também mudaram: R$ 100,00 a menos no total.');
    expect(E.others(-200)).toBe('Outras categorias também mudaram: R$ 2,00 a menos no total.');
    expect(E.inProgress).toBe('Mês em andamento: os valores ainda podem mudar.');
    expect(E.needOtherMonth).toBe('Escolha outro mês na comparação para ver o que mudou.');
    expect(EVOLUTION_TEXT.gap.warning).toBe('Pode faltar algo neste mês: há conta prevista sem registro');
    expect(E.seeCategories).toBe('Ver categorias');
    expect(E.seeRecords).toBe('Ver lançamentos');
    expect(E.compareWithout).toBe('Comparar sem este mês');
  });

  it('a explicação descreve e nunca diz que uma categoria ou um lançamento foi a causa, nem julga', () => {
    const E = EVOLUTION_TEXT.explain;
    // A única linha que fala em causa é o aviso que a nega.
    const { note, ...rest } = E;
    expect(note).toMatch(/Não diz que/);
    for (const text of [...staticStrings(rest), ...samples().filter((t) => /Outras categorias|registrado foi|Compara |Casa:|Mercado:|vizinhos/.test(t))]) {
      expect(text, text).not.toMatch(/\bcaus[ao]|\bculp|\bmotivo|\bresponsáv|\bpor conta d|\bvilã|\bvilão|\bjustifica|\bprova\b|\bexplica por/i);
    }
  });

  it('a variação é um fato com as duas datas: "a mais", "a menos" ou "sem diferença", nunca "mês a mês" nem palavra de julgamento', () => {
    const lines = samples().filter((t) => /^De [a-zç]+ para [a-zç]+: /.test(t));
    expect(lines.length).toBeGreaterThan(10);
    for (const text of lines) expect(text, text).toMatch(/^De [a-zç]+ para [a-zç]+: (R\$ [\d.]+,\d{2} a (mais|menos)|sem diferença)$/);
    for (const text of samples().filter((t) => /% a (mais|menos) que /.test(t))) expect(text, text).toMatch(/^(Menos de )?[\d.,]+% a (mais|menos) que [a-zç]+$|^Menos de 0,1% a (mais|menos) que [a-zç]+$/);
    for (const text of samples().filter((t) => /^De [a-zç]+ para /.test(t))) expect(text, text).not.toMatch(/mês a mês/i);
  });

  it('zero confirmado ("Conferi este mês", D-060): o ponto diz "R$ 0,00, conferido", com as frases de conferir e desfazer, sem julgamento', () => {
    // Março sem Recebido, conferido; julho (fechado, com outubro como mês atual) sem Recebido nem Pago, conferido nos dois.
    const checked = [
      ...overview.map((r) => (r.month === '2026-03' ? { ...r, receivedChecked: true } : r)),
      { ...row('2026-07', 0, 0), receivedChecked: true, paidChecked: true, receivedCheckVersion: 1, paidCheckVersion: 3, cardPurchaseCount: 2 },
      // Agosto: só com compras no cartão e sem conferir (o botão de pagamentos traz o aviso de compras no cartão).
      { ...row('2026-08', 0, 0), cardPurchaseCount: 1 },
    ];
    const texts: string[] = [...monthCheckTextSamples()];
    for (const metric of ['recebido', 'pago'] as EvolutionMetric[]) {
      for (const windowMonths of EVOLUTION_WINDOWS) {
        for (const canWrite of [true, false]) {
          const view = buildEvolutionView({ overview: checked, metric, windowMonths, currentMonth: '2026-10', hiddenMonths: ['2026-04'] });
          texts.push(evolutionAnnouncement(view));
          for (const p of view.points) {
            texts.push(p.name, p.stateText, p.stateLabel, ...(p.valueText ? [p.valueText] : []));
            const check = evolutionPanel(view, p.month, canWrite).check;
            if (check) texts.push(...[check.action, check.actionNote, check.doneText, check.cardNotice, check.undo, check.undoA11y].filter((t): t is string => t !== null));
          }
        }
      }
    }
    texts.push(EVOLUTION_TEXT.legend.zeroConfirmed, EVOLUTION_TEXT.panel.state.zero_confirmado, EVOLUTION_TEXT.participation.zeroConfirmed, EVOLUTION_TEXT.table.zeroConfirmed);
    check(texts);
    // As frases pedidas pela especificação, exatamente.
    // Pago é caixa, pela data do pagamento (D-057 D07): a conferência fala de "pagamentos", não de "gastos".
    expect(MONTH_CHECK_TEXT.action('pagamentos', '2026-03')).toBe('Conferi: não houve pagamentos em março de 2026');
    expect(MONTH_CHECK_TEXT.action('recebimentos', '2026-03')).toBe('Conferi: não houve recebimentos em março de 2026');
    expect(MONTH_CHECK_TEXT.done('pagamentos', '2026-03')).toBe('Você conferiu: não houve pagamentos em março de 2026.');
    expect(MONTH_CHECK_TEXT.done('recebimentos', '2026-03')).toBe('Você conferiu: não houve recebimentos em março de 2026.');
    expect(MONTH_CHECK_TEXT.cardNotice('2026-03')).toBe('Há compras no cartão em março de 2026. Elas entram no Pago quando a fatura é paga.');
    for (const text of monthCheckTextSamples()) expect(text, text).not.toMatch(/não houve gastos|sem gastos em/);
    const zero = buildEvolutionView({ overview: checked, metric: 'recebido', windowMonths: 12, currentMonth: '2026-10', hiddenMonths: [] }).points.find((p) => p.month === '2026-03')!;
    expect(zero.name).toBe('Março de 2026, R$ 0,00, conferido, na comparação');
    expect(zero.stateText).toBe('Você conferiu: não houve recebimentos em março de 2026.');
    const zeroPaid = buildEvolutionView({ overview: checked, metric: 'pago', windowMonths: 12, currentMonth: '2026-10', hiddenMonths: [] }).points.find((p) => p.month === '2026-07')!;
    expect(zeroPaid.name).toContain('R$ 0,00, conferido');
    expect(zeroPaid.stateText).toBe('Você conferiu: não houve pagamentos em julho de 2026.');
    // O aviso de compras no cartão vem junto da conferência de pagamentos (botão ou frase), nunca da de recebimentos.
    const pagoView = buildEvolutionView({ overview: checked, metric: 'pago', windowMonths: 12, currentMonth: '2026-10', hiddenMonths: [] });
    expect(evolutionPanel(pagoView, '2026-07', true).check).toMatchObject({ state: 'conferido', cardNotice: 'Há compras no cartão em julho de 2026. Elas entram no Pago quando a fatura é paga.' });
    expect(evolutionPanel(pagoView, '2026-08', true).check).toMatchObject({ state: 'sem_registros', action: 'Conferi: não houve pagamentos em agosto de 2026', cardNotice: 'Há compras no cartão em agosto de 2026. Elas entram no Pago quando a fatura é paga.' });
    const recebidoView = buildEvolutionView({ overview: checked, metric: 'recebido', windowMonths: 12, currentMonth: '2026-10', hiddenMonths: [] });
    expect(evolutionPanel(recebidoView, '2026-07', true).check!.cardNotice).toBeNull();
    expect(evolutionPanel(recebidoView, '2026-08', true).check!.cardNotice).toBeNull();
    // Mês sem anotação e sem conferência continua dizendo que não é mês sem gastos.
    const unchecked = buildEvolutionView({ overview: [...overview, row('2026-07', 0, 0)], metric: 'pago', windowMonths: 12, currentMonth: '2026-10', hiddenMonths: [] }).points.find((p) => p.month === '2026-07')!;
    expect(unchecked.stateText).toBe('Sem registros: mês sem anotação não quer dizer mês sem gastos');
    for (const text of texts) expect(text, text).not.toMatch(/\bnão gastou|\bsem gastos de verdade|\bcom certeza\b|\bgarant/i);
  });

  it('fase 3 (D-062 item 4): Renda comprometida e Guardado em metas, em todos os estados, janelas e seleções, passam nas regras e dizem só fatos', () => {
    const bill = (id: string, dueOn: string, amountCents: number) =>
      ({ id, contextId: 'c', description: id, amountCents, currency: 'BRL', dueOn, category: null, status: 'aberto', payment: null, series: null, seriesOverride: false, amountIsEstimate: false, invoice: null, createdBy: 'p', version: 1, createdAt: `${dueOn}T00:00:00Z`, updatedAt: `${dueOn}T00:00:00Z` }) as const;
    const ref = (fromMonth: string) => ({ id: `r-${fromMonth}`, contextId: 'c', fromMonth, amountCents: 600_000, varies: false, createdBy: 'p', version: 1, createdAt: `${fromMonth}-01T00:00:00Z`, updatedAt: `${fromMonth}-01T00:00:00Z`, amountChangedAt: null });
    const goal = (createdAt: string, status: 'ativa' | 'concluida' = 'ativa') =>
      ({ id: 'g', contextId: 'c', goalType: 'objetivo', name: 'Viagem', targetCents: 600_000, targetMonth: null, plannedMonthlyCents: null, essentialBaseCents: null, essentialMonths: null, essentialBaseSource: null, status, createdBy: 'p', version: 1, createdAt, updatedAt: createdAt, savedCents: 0, initialCents: 0, depositsCents: 0, withdrawalsCents: 0, incomeCents: 0, appreciationCents: 0, depreciationCents: 0, lastMovementOn: null }) as const;
    const mv = (kind: 'aporte' | 'resgate' | 'rendimento', amountCents: number, occurredOn: string, i: number) =>
      ({ id: `m${i}`, goalId: 'g', contextId: 'c', kind, amountCents, occurredOn, note: null, accountId: null, createdBy: 'p', version: 1, createdAt: `${occurredOn}T00:00:00Z`, updatedAt: `${occurredOn}T00:00:00Z` }) as const;
    const texts: string[] = [];
    for (const windowMonths of EVOLUTION_WINDOWS) {
      const months = evolutionMonths('2026-10', windowMonths);
      const closed = months.filter((m) => m < '2026-10');
      const sets = [
        { refs: [ref('2026-07')], goals: [goal('2026-06-15T12:00:00Z')] },
        { refs: [] as ReturnType<typeof ref>[], goals: [] as ReturnType<typeof goal>[] },
        { refs: [ref('2025-01')], goals: [goal('2026-06-15T12:00:00Z', 'concluida')] },
      ];
      for (const { refs, goals } of sets) {
        const lists = new Map(closed.map((m, i) => [m, i % 3 === 2 ? [] : [bill(`conta-${m}`, `${m}-10`, 150_000 + i * 70_000)]]));
        const moves = new Map(closed.map((m, i) => [m, i % 4 === 0 ? [] : i % 4 === 1 ? [mv('aporte', 40_000, `${m}-05`, i), mv('resgate', 90_000, `${m}-20`, i + 100)] : i % 4 === 2 ? [mv('rendimento', 500, `${m}-28`, i)] : [mv('aporte', 25_000, `${m}-09`, i)]]));
        const views = [
          { metric: 'comprometida' as const, points: committedEvolutionPoints({ months, currentMonth: '2026-10', contextId: 'c', today: '2026-10-07', commitmentsByMonth: lists, refs }) },
          { metric: 'guardado' as const, points: savingsEvolutionPoints({ months, currentMonth: '2026-10', goals, movementsByMonth: moves, timeZone: 'America/Sao_Paulo' }) },
        ];
        for (const { metric, points } of views) {
          for (const hiddenMonths of [[], closed.slice(0, 1), closed.slice(-2), closed, ['2025-01']]) {
            const view = buildPhase3View({ metric, points, windowMonths, currentMonth: '2026-10', hiddenMonths });
            const sub = evolutionSubtitle(metric);
            texts.push(sub.base, ...(sub.note ? [sub.note] : []), evolutionAnnouncement(view), EVOLUTION_TEXT.custom.banner(view.outCount, view.eligibleCount), EVOLUTION_TEXT.custom.list(view.stats.hiddenMonths, view.outsideMonths), EVOLUTION_TEXT.custom.scope(metric));
            texts.push(EVOLUTION_TEXT.chart.span(view.from, view.to), EVOLUTION_TEXT.chart.title(metric), EVOLUTION_TEXT.stats.ofMonths(view.stats.visibleCount, view.eligibleCount));
            if (view.averageText) texts.push(view.averageText);
            if (view.medianText) texts.push(view.medianText);
            if (view.maxCents > 0) texts.push(view.unit === 'permille' ? EVOLUTION_TEXT.chart.maxPercent('52,5%') : EVOLUTION_TEXT.chart.maxValue(view.maxCents));
            for (const p of view.points) {
              texts.push(p.name, p.title, p.stateText, p.stateLabel, p.includedText, ...(p.valueText ? [p.valueText] : []));
              const panel = phase3Panel(view, p.month);
              texts.push(panel.title, panel.valueCaption, panel.stateText, panel.baseText, panel.explainTitle, panel.explainNote, panel.switchCaption, ...(panel.noValueText ? [panel.noValueText] : []), ...(panel.notEligibleText ? [panel.notEligibleText] : []));
              texts.push(...(panel.previousMonth ? [EVOLUTION_TEXT.panel.stepHint(panel.previousMonth)] : []), ...(panel.nextMonth ? [EVOLUTION_TEXT.panel.stepHint(panel.nextMonth)] : []));
            }
            if (view.situation === 'sem_registros') {
              for (const canWrite of [true, false]) {
                const empty = phase3Empty(view, canWrite);
                texts.push(empty.title, empty.body, ...(empty.action ? [empty.action.label] : []));
              }
            }
          }
        }
      }
    }
    texts.push(EVOLUTION_TEXT.table.noteNoTotal, EVOLUTION_TEXT.chart.zeroNote, EVOLUTION_TEXT.legend.noBase, EVOLUTION_TEXT.legend.zeroSaved, EVOLUTION_TEXT.stats.announceText('52,5%', '50,0%', 2, 3));
    expect(texts.length).toBeGreaterThan(900);
    check(texts);
    // As frases pedidas, como estão.
    expect(EVOLUTION_TEXT.phase3.subtitle.comprometida).toBe('Percentual da renda de referência ligado a contas do mês');
    expect(EVOLUTION_TEXT.phase3.subtitle.guardado).toBe('Aportes menos resgates nas metas');
    expect(EVOLUTION_TEXT.phase3.closedOnly).toMatch(/^Só meses já fechados\./);
    expect(EVOLUTION_TEXT.phase3.explainNote).toBe('Disponível para Recebido e Pago');
    // Nada aqui é previsão, e a ausência nunca é afirmada como zero.
    for (const text of texts) {
      expect(text, text).not.toMatch(/\bprevis(ão|to|ta)\b.*\b(serão|vai|irá)\b|\bvocê vai\b|\bsó falta\b/i);
      expect(text, text).not.toMatch(/\bnão guardou\b|\bnão comprometeu\b|\bnão há contas\b|\bsem contas de verdade\b/i);
    }
    // Quem não tem base ou registro nunca vê "0%" nem "R$ 0,00" no lugar do dado.
    const noBase = buildPhase3View({ metric: 'comprometida', points: committedEvolutionPoints({ months: evolutionMonths('2026-10', 6), currentMonth: '2026-10', contextId: 'c', today: '2026-10-07', commitmentsByMonth: new Map(evolutionMonths('2026-10', 6).filter((m) => m < '2026-10').map((m) => [m, []])), refs: [] }), windowMonths: 6, currentMonth: '2026-10', hiddenMonths: [] });
    for (const p of noBase.points) for (const text of [p.name, p.stateText, p.valueText ?? '']) expect(text, text).not.toMatch(/\b0(,0)?%|R\$ 0,00/);
  });
});

import {
  ANALYSES_TEXT,
  ANALYSES_UPCOMING_MONTHS,
  analysesBudgetSummary,
  analysesEvolutionSummary,
  analysesUpcomingSummary,
  categoryBubbles,
  evolutionFetchRange as analysesFetchRange,
  fitBubbleLabel,
  projectCommitted as analysesProject,
  selectedCategoryCard,
  summarizeBudget as analysesSummarizeBudget,
  upcomingCommittedMonths as analysesUpcomingMonths,
  type CategoryShare as AnalysesShare,
} from '../src';

/**
 * Textos de Análises (D-059): pt-BR neutro quanto a gênero, sem travessão longo, sem a expressão vetada, sem palavra de julgamento, sem
 * produto financeiro e sem marca. Só fatos: o percentual e o valor de cada categoria, sem nota, sem cor que julgue e sem "demais".
 */
describe('textos de Análises (D-059)', () => {
  const GENDERED = /\b(o|a)s? usuári[oa]s?\b|\bobrigad[oa]s?\b|\bbem-vind[oa]s?\b|\bpreocupad[oa]s?\b|\bendividad[oa]s?\b|\bcadastrad[oa]\b|\(a\)|\(o\)|\bo\/a\b|\bvocê (é|está|ficou) \w+[oa]\b/i;
  const VETOED =
    /\bdemais\b|\balt[oa]s?\b|\bbaix[oa]s?\b|\bruim\b|cuidado|estour|gastou|gastão|gastona|exagero|\bculpa|\bperigo|\balerta|\bdeveria\b|\bprecisa(m)? (gastar|cortar)|\bcort(ar|e)\b|\bsupérfluo|parab[eé]ns|\bvoc[eê] conseguiu|incr[ií]vel|arrasou|\bvale a pena\b|\bsaldo disponível\b|aumentou|diminuiu|despencou|disparou|\bmuito\b|\bpouco\b|\batípic|\bdescontrol/i;
  const BRANDS = /\b(nubank|ita[uú]|bradesco|santander|c6|sicredi|sicoob|btg|neon|picpay|mercado pago|visa|mastercard|hipercard|amex|serasa)\b/i;
  const check = (texts: string[]) => {
    expect(texts.length).toBeGreaterThan(0);
    for (const text of texts) {
      expect(text, text).not.toMatch(FORBIDDEN);
      expect(text, text).not.toMatch(FORBIDDEN_EXPANDED);
      expect(text, text).not.toMatch(JUDGMENT);
      expect(text, text).not.toMatch(VETOED);
      expect(text, text).not.toMatch(GENDERED);
      expect(text, text).not.toMatch(BRANDS);
      expect(text, text).not.toMatch(/[–—]/);
    }
  };

  const share = (category: string | null, label: string, cents: number, percentText: string): AnalysesShare => ({ category, label, cents, tenths: 0, percentText, a11yLabel: '' });

  /** As frases montadas, em vários meses, contas e estados. */
  async function samples(): Promise<string[]> {
    const texts: string[] = [];
    const T = ANALYSES_TEXT;
    for (const month of ['2026-01', '2026-10', '2025-12']) {
      texts.push(T.categories.title(month), T.categories.empty(month), T.evolution.title(month), T.evolution.outside(month), T.upcoming.title(month), T.budget.title(month), T.budget.none(month));
    }
    for (const n of [1, 2, 3, 12]) texts.push(T.categories.selected.count(n), T.categories.selected.more(n), T.budget.count(n));
    texts.push(
      T.categories.selected.share('23,4%'),
      T.categories.selected.a11y('Mercado', '23,4%', 92_000),
      T.categories.selected.announce('Mercado', '23,4%', 92_000),
      T.categories.selected.rowA11y('Fatura do cartão', '2026-10-10', 60_000, true),
      T.categories.selected.rowA11y('Feira', '2026-10-02', 25_000, false),
      T.categories.barValue(92_000, '23,4%'),
      T.budget.nearest('Lazer', 'R$ 400,00 de R$ 300,00', '133,3%'),
    );
    const bubbles = categoryBubbles(
      [share('Moradia', 'Moradia', 250_000, '64,1%'), share('Mercado', 'Mercado', 140_000, '35,9%'), share(null, 'Sem categoria', 3_000, '0,1%')],
      310,
    );
    for (const b of bubbles.bubbles) texts.push(b.a11yLabel, ...b.lines);
    texts.push(...fitBubbleLabel('Mensalidade da escola de música', '4,0%', 38).lines);
    // A demonstração e o cenário da Evolução: os resumos das três abas e o cartão da categoria.
    for (const scenario of ['padrao', 'evolucao'] as const) {
      const repo = await createDemoRepository({ scenario });
      const ctx = (await repo.getSpace())!.personalContextId;
      const { from, to } = analysesFetchRange('2026-10');
      const overview = await repo.monthsOverview(ctx, from, to);
      for (const hiddenMonths of [[], ['2026-04']]) {
        const view = buildEvolutionView({ overview, metric: 'pago', windowMonths: 12, currentMonth: '2026-10', hiddenMonths, gapMonths: ['2026-03'] });
        for (const p of view.points) {
          const s = analysesEvolutionSummary(view, p.month)!;
          texts.push(s.title, s.stateText, s.variationText, s.basis, ...(s.percentText ? [s.percentText] : []));
        }
      }
      const months = analysesUpcomingMonths('2026-10');
      const [series, due, refs] = await Promise.all([repo.listSeries(ctx), repo.listCommitmentsDueBetween(ctx, months[0]!, months[months.length - 1]!), repo.listIncomeReferences(ctx)]);
      const up = analysesUpcomingSummary(analysesProject(series, due, refs, months, '2026-10-07'), '2026-10');
      texts.push(up.title, up.legend, ...(up.emptyText ? [up.emptyText] : []), ...up.rows.flatMap((r) => [r.text, r.a11y]));
      for (const month of ['2026-09', '2026-10']) {
        const b = analysesBudgetSummary(analysesSummarizeBudget(await repo.getMonthBudget(ctx, month)));
        texts.push(b.title, ...[b.totalLine, b.countText, b.nearestLine, b.emptyText, b.note].filter((x): x is string => x !== null));
      }
      for (const month of ['2026-03', '2026-04', '2026-10']) {
        const paid = summarizeMonth(await repo.listRecords(ctx, month), ctx, month).composition.paid;
        const shares = categoryBreakdown(paid);
        const parts = paidCategoryParts(paid);
        for (const sh of shares) {
          const card = selectedCategoryCard(shares, parts, sh.category === null ? 'sem-categoria' : `c:${sh.category}`)!;
          texts.push(card.title, card.name, card.valueText, card.shareText, card.a11y, card.announce, card.countText, ...(card.moreText ? [card.moreText] : []), ...card.rows.flatMap((r) => [r.a11y, ...(r.partialText ? [r.partialText] : [])]));
        }
      }
    }
    return texts;
  }

  it('as frases fixas passam nas regras', () => {
    check(staticStrings(ANALYSES_TEXT));
    expect(staticStrings(ANALYSES_TEXT).length).toBeGreaterThan(35);
  });

  it('as frases montadas, nos três meses, nas contas da demonstração e nos dois cenários, passam nas regras', async () => {
    const texts = await samples();
    expect(texts.length).toBeGreaterThan(150);
    check(texts);
    expect(ANALYSES_UPCOMING_MONTHS).toBe(3);
  });

  it('o arquivo-fonte das análises passa pelas regras de texto', () => {
    const source = readFileSync(join(CORE_SRC, 'analises.ts'), 'utf8');
    expect(source).not.toMatch(FORBIDDEN);
    expect(source).not.toMatch(JUDGMENT);
    expect(source).not.toMatch(BRANDS);
  });

  it('as frases são fatos, sem nota nem comparação que julgue: o cartão da categoria e o resumo do orçamento só dizem valor, percentual e quanto falta', () => {
    const texts = [
      ANALYSES_TEXT.categories.selected.announce('Lazer', '12,0%', 40_000),
      ANALYSES_TEXT.budget.nearest('Lazer', 'R$ 400,00 de R$ 300,00', '133,3%'),
      ANALYSES_TEXT.categories.hint,
      ANALYSES_TEXT.categories.legend,
      ANALYSES_TEXT.categories.minimumNote,
    ];
    for (const text of texts) expect(text, text).not.toMatch(/\bmelhor\b|\bpior\b|\bexcesso\b|\bdesperd|\bgasto(u)? (a )?mais\b|\bcontrole\b|\bculp/i);
  });
});

/**
 * Aviso de vencimento em sábado, domingo ou feriado nacional (D-060 item 3, `dia-util.ts`): português do Brasil, linguagem neutra
 * de gênero, sem travessão longo, sem a expressão vetada, sem julgamento e, sobretudo, sem prometer que o pagamento no próximo dia
 * útil vale para qualquer cobrança nem que não há encargos. Vale para as frases fixas, para o aviso de cada sábado, domingo e
 * feriado de 2026 a 2030, para o corpo do lembrete e para o arquivo-fonte.
 */
describe('textos do aviso de dia útil (D-060) e do próximo dia útil (D-061)', () => {
  /** Conta a pagar mínima em aberto, para os textos de D-061. */
  const bill = (dueOn: string, over: Partial<DiaUtilCommitment> = {}): DiaUtilCommitment =>
    ({
      id: `c-${dueOn}`, contextId: 'ctx', description: 'Escola', amountCents: 10_000, currency: 'BRL', dueOn, category: 'Moradia', status: 'aberto', payment: null,
      series: null, seriesOverride: false, invoice: null, amountIsEstimate: false, createdBy: 'p', version: 1, createdAt: '2026-10-01T12:00:00Z', updatedAt: '2026-10-01T12:00:00Z', ...over,
    }) as DiaUtilCommitment;
  const PROMISE =
    /\bsem\s+(?:multa|juros|encargos?|custos?|taxas?|cobran[cç]as?)(?![\p{L}])|\bn[aã]o\s+(?:h[aá]|tem|ter[aá]|cobra|cobram|incide|incidem|existe)(?![\p{L}])[^.]*(?<![\p{L}])(?:multa|juros|encargos?)(?![\p{L}])|\bgarant|\bsempre (?:pode|vale)\b|\bpode pagar\b|\bsem problema|\bsem prejuízo|\bnão perde|\bvale para qualquer/iu;
  // "vencida" continua na lista de ordens e julgamento. D-061 só precisa dizer quando a conta "passa a vencida" (e, na conta do ano,
  // que "ficam vencidas" a partir do dia seguinte): só essas duas expressões exatas são liberadas, e qualquer outro uso da palavra,
  // como também ordem, pressa, perda e atraso, segue reprovado (o aviso nunca manda pagar, nem cobra).
  const ORDERS = /\bdeve(ria)?\b|\bpague\b|\bpague já\b|\bnão esqueça|\burgente|\batrasad|\bvencid[oa]s?\b|\bperd[ae]r?\b|\bcuidado|\bpreocup/i;
  const VENCIDA_LIBERADA = /\bpassa a vencida\b|\bficam vencidas\b/gi;
  const check = (texts: string[]) => {
    for (const text of texts) {
      expect(text, text).not.toMatch(FORBIDDEN);
      expect(text, text).not.toMatch(FORBIDDEN_EXPANDED);
      expect(text, text).not.toMatch(JUDGMENT);
      expect(text, text).not.toMatch(NEUTRAL);
      expect(text, text).not.toMatch(GENDERED);
      expect(text, text).not.toMatch(PROMISE);
      expect(text.replace(VENCIDA_LIBERADA, ''), text).not.toMatch(ORDERS);
    }
  };

  /** Sábados, domingos e feriados nacionais de 2026 a 2030: um aviso por dia. */
  const notices = () => {
    const out: NonNullable<ReturnType<typeof dueDayNotice>>[] = [];
    for (let d = '2026-01-01'; d <= '2030-12-31'; d = addDays(d, 1)) {
      // Com a tolerância do próximo dia útil (D-061) e, na conta do ano, sem ela.
      for (const kind of ['conta', 'conta_do_ano'] as const) {
        const n = dueDayNotice(d, kind);
        if (n) out.push(n);
      }
    }
    return out;
  };

  it('as listas reprovam o que deve (promessa de ausência de encargos, ordem e julgamento) e aceitam o texto do aviso', () => {
    for (const bad of [
      'Sem multa no próximo dia útil.',
      'Pagando no próximo dia útil, não há juros.',
      'Não cobra encargos nesse caso.',
      'Pagamento garantido sem encargos.',
      'Você pode pagar sem problema.',
      'Vale para qualquer cobrança.',
    ])
      expect(PROMISE.test(bad), bad).toBe(true);
    for (const bad of ['Você deve pagar antes.', 'Pague já', 'Não esqueça', 'Conta atrasada', 'Cuidado com o vencimento', 'Conta vencida', 'Duas contas vencidas']) expect(ORDERS.test(bad), bad).toBe(true);
    expect(PROMISE.test(DUE_DAY_TEXT.advice)).toBe(false);
    expect(ORDERS.test(DUE_DAY_TEXT.advice)).toBe(false);
    // "vencida" só passa nas duas expressões liberadas; fora delas, o que sobra depois de tirá-las ainda é reprovado.
    const sobra = (text: string) => ORDERS.test(text.replace(VENCIDA_LIBERADA, ''));
    expect(sobra('Só depois desse dia ela passa a vencida.')).toBe(false);
    expect(sobra('Contas do ano ficam vencidas a partir do dia seguinte ao vencimento.')).toBe(false);
    for (const bad of ['Esta conta está vencida.', 'Você tem uma conta vencida.', 'Ela fica vencida amanhã.', 'As contas passam a vencidas.', 'Ela passa a vencida e depois, vencida de novo.']) expect(sobra(bad), bad).toBe(true);
  });

  it('as frases fixas passam nas regras e dizem o que o aviso é e o que não é', () => {
    const fixed = [DUE_DAY_TEXT.advice, DUE_DAY_TEXT.adviceYearBill, DUE_DAY_TEXT.nextBusinessDayTag, DUE_DAY_TEXT.sign, DUE_DAY_TEXT.learnMore, DUE_DAY_TEXT.learnMoreA11y, DUE_DAY_TEXT.learnMoreTitle, ...DUE_DAY_TEXT.learnMoreParagraphs, DUE_DAY_TEXT.source];
    check(fixed);
    const more = DUE_DAY_TEXT.learnMoreParagraphs.join(' ');
    // O "Saiba mais" diz que a data não muda, quais feriados contam (nacionais, de data fixa, em lei federal) e quais não entram.
    expect(more).toContain('não muda a data de vencimento');
    expect(more).toContain('Contam só os feriados nacionais de data fixa definidos em lei federal');
    expect(more).toContain('O dia de eleição cai sempre num domingo, que já é coberto pelo fim de semana.');
    for (const day of ['1º de janeiro', '21 de abril', '1º de maio', '7 de setembro', '12 de outubro', '2 de novembro', '15 de novembro', '20 de novembro', '25 de dezembro']) expect(more, day).toContain(day);
    for (const out of ['Carnaval', 'Sexta-feira Santa', 'Corpus Christi', 'estados e municípios']) expect(more, out).toContain(out);
    expect(more).toContain('confira com quem cobra');
    // A fonte lista as três leis e a data da consulta.
    for (const law of NATIONAL_HOLIDAY_LAWS) expect(DUE_DAY_TEXT.source).toContain(law);
    expect(DUE_DAY_TEXT.source).toContain('19/10/2026');
  });

  it('o aviso de cada sábado, domingo e feriado de 2026 a 2030 passa nas regras, abre com "Vence" e termina com a frase de conferir (D-061: com quem cobra, ou no carnê ou no site do órgão)', () => {
    const list = notices();
    expect(list.length).toBeGreaterThan(1100);
    const texts = list.flatMap((n) => [n.text, n.advice, n.sign, n.signLine, n.signA11y, n.a11y]);
    check(texts);
    const opening = /^Vence (no|na) (domingo|segunda|terça|quarta|quinta|sexta|sábado), \d{2}\/\d{2}\/\d{4}, que não é dia útil( \(feriado nacional: [^)]+\))?\./;
    const weekday = '(domingo|segunda|terça|quarta|quinta|sexta|sábado)';
    for (const n of list) {
      expect(n.text, n.dueOn).toMatch(opening);
      if (n.grace) {
        expect(n.text, n.dueOn).toMatch(new RegExp(`\\. O próximo dia útil é ${weekday}, \\d{2}\\/\\d{2}\\/\\d{4}\\. Só depois desse dia ela passa a vencida\\.$`));
        expect(n.a11y.endsWith('Confira com quem cobra se o pagamento pode ser feito no próximo dia útil.'), n.dueOn).toBe(true);
        expect(n.signLine, n.dueOn).toMatch(/^Não é dia útil · vencimento anotado: [a-zçáéíóú]+, \d{2}\/\d{2}$/);
      } else {
        expect(n.text, n.dueOn).toMatch(/\. Em conta do ano, o Clarevo não usa o próximo dia útil: ela passa a vencida a partir do dia seguinte ao vencimento\.$/);
        expect(n.a11y.endsWith('Impostos podem ter regra diferente. Confira a data no carnê ou no site do órgão.'), n.dueOn).toBe(true);
        expect(n.signLine, n.dueOn).toBe('Não é dia útil · confira a data no carnê ou no site do órgão');
      }
    }
  });

  it('a etiqueta "Vence terça, 13/10 (próximo dia útil)" e os textos que a usam passam nas regras (D-061), em todo dia que não é útil de 2026 a 2030', () => {
    const labels: string[] = [];
    for (let d = '2026-01-01'; d <= '2030-12-31'; d = addDays(d, 1)) {
      const label = nextBusinessDayDueText(d, 'conta', addDays(d, -3));
      if (label) {
        labels.push(label);
        expect(label, d).toMatch(/^Vence (segunda|terça|quarta|quinta|sexta), \d{2}\/\d{2} \(próximo dia útil\)$/);
      }
    }
    expect(labels.length).toBeGreaterThan(550);
    check(labels);
    check([nextBusinessDayDueText('2026-10-11', 'conta', '2026-10-13')!, dueText(bill('2026-10-11'), '2026-10-13'), toPayCaption(summarizeToPay([bill('2026-10-11')], 'ctx', '2026-10', '2026-10-12'), '2026-10-12').main!]);
    expect(dueText(bill('2026-10-11'), '2026-10-13')).toBe('Vence hoje (próximo dia útil)');
  });

  it('o "Saiba mais" de D-061 diz o que a lei diz e o que ela não diz, e nunca promete ausência de encargos', () => {
    const more = DUE_DAY_TEXT.learnMoreParagraphs.join(' ');
    expect(more).toContain('A Lei nº 7.089/1983 proíbe bancos e instituições financeiras de cobrar juros de mora');
    // A palavra da lei é "primeiro dia subsequente" (trecho do art. 1º em DUE_RULE_SOURCES); o "dia útil" vem da leitura do STJ, dita como tal.
    expect(more).toContain('desde que seja quitado no primeiro dia subsequente, que o STJ lê como o primeiro dia útil seguinte');
    expect(more).not.toContain('quando o pagamento é feito no primeiro dia útil seguinte');
    expect(DUE_RULE_SOURCES[0]!.locator).toContain('desde que seja quitado no primeiro dia subsequente');
    expect(more).toContain('A multa e as regras de cada cobrança podem variar');
    expect(more).toContain('é o entendimento do STJ');
    expect(more).toContain('IPVA, IPTU e matrícula');
    expect(more).not.toMatch(/sem (multa|juros|encargos?)|garant|n[aã]o (h[aá]|tem|cobra|cobram) (multa|juros|encargos?)/i);
    // Todo parágrafo e a fonte dizem "a conferir com quem cobra" ou citam a fonte; nenhum cita banco, empresa ou produto.
    expect(more).not.toMatch(/\b(banco do|caixa econ|itaú|bradesco|nubank|santander)\b/i);
  });

  it('os nomes dos feriados passam nas regras', () => {
    const names = [2026, 2027, 2028, 2029, 2030].flatMap((y) => nationalHolidays(y).flatMap((h) => [h.name, h.law]));
    check(names);
  });

  it('o corpo do lembrete, com e sem a frase de dia que não é útil, passa nas regras e não leva valor nem descrição (D-025(3))', () => {
    const bodies = [1, 2, 3, 12].flatMap((n) => [reminderBody(n), reminderBody(n, '2026-10-11'), reminderBody(n, '2026-10-12'), reminderBody(n, '2026-10-13')]);
    check(bodies);
    for (const b of bodies) {
      expect(b, b).toMatch(/^Você tem (1 conta|\d+ contas) com vencimento amanhã(, que não é dia útil)?\.$/);
      expect(b, b).not.toMatch(/R\$|\d{2}\/\d{2}/);
    }
  });

  it('o arquivo-fonte passa pelas regras de texto (os comentários dizem "sem prometer", e isso não é promessa)', () => {
    const source = readFileSync(join(CORE_SRC, 'dia-util.ts'), 'utf8');
    expect(source).not.toMatch(FORBIDDEN);
    expect(source).not.toMatch(FORBIDDEN_EXPANDED);
    expect(source).not.toMatch(JUDGMENT);
    // Aviso fixo na cópia: nenhuma frase que a pessoa vê usa "garantido" nem "sem encargos" (só os comentários do código falam disso).
    const shown = [DUE_DAY_TEXT.advice, ...DUE_DAY_TEXT.learnMoreParagraphs].join(' ');
    expect(shown).not.toMatch(/garant|sem encargos|sem multa/i);
  });
});

import { INCOME_AVERAGE_TEXT, incomeAverage, incomeAverageTextSamples, incomeAverageTexts, type MonthOverview as IncomeOverviewRow } from '../src';

/**
 * Textos de "Calcular pela média" (D-062 item 2, Ciclo V): pt-BR neutro quanto a gênero, sem travessão longo, sem a expressão vetada,
 * sem julgamento sobre a renda ("renda baixa", "instável"), sem prometer o próximo mês e sem produto financeiro. É uma estimativa, e
 * o texto diz isso; o resultado só preenche o campo, e quem grava é a pessoa.
 */
describe('textos de "Calcular pela média" (D-062 item 2)', () => {
  const GENDERED = /\b(o|a)s? usuári[oa]s?\b|\bobrigad[oa]s?\b|\bbem-vind[oa]s?\b|\bpreocupad[oa]s?\b|\bendividad[oa]s?\b|\bcadastrad[oa]\b|\(a\)|\(o\)|\bo\/a\b|\bvocê (é|está|ficou) \w+[oa]\b/i;
  const VETOED =
    /\bdemais\b|\balt[oa]s?\b|\bbaix[oa]s?\b|\bruim\b|cuidado|estour|gastou|exagero|\bculpa|\bperigo|\balerta|\bdeveria\b|parab[eé]ns|incr[ií]vel|\bvale a pena\b|aumentou|diminuiu|despencou|disparou|\bmuito\b|\bpouco\b|\bdescontrol|\binst[aá]vel|\binstabilidade|\bgaranti\w*|\bprevis[aã]o\b|\bcertamente\b|\bcom certeza\b|\bsempre\b/i;
  const BRANDS = /\b(nubank|ita[uú]|bradesco|santander|c6|sicredi|sicoob|btg|neon|picpay|mercado pago|visa|mastercard|hipercard|amex|serasa)\b/i;
  const check = (texts: string[]) => {
    expect(texts.length).toBeGreaterThan(0);
    for (const text of new Set(texts)) {
      expect(text, text).not.toMatch(FORBIDDEN);
      expect(text, text).not.toMatch(FORBIDDEN_EXPANDED);
      expect(text, text).not.toMatch(JUDGMENT);
      expect(text, text).not.toMatch(VETOED);
      expect(text, text).not.toMatch(GENDERED);
      expect(text, text).not.toMatch(BRANDS);
      expect(text, text).not.toMatch(/[–—]/);
    }
  };
  const row = (month: string, receivedCents = 0, over: Partial<IncomeOverviewRow> = {}): IncomeOverviewRow => ({
    month,
    receivedCount: receivedCents > 0 ? 1 : 0,
    receivedCents,
    paidCount: 0,
    paidCents: 0,
    ...over,
  });

  it('todos os textos e os resultados de várias entradas passam nas regras de texto', () => {
    const texts = [...incomeAverageTextSamples()];
    const scenarios: [IncomeOverviewRow[], 3 | 6, string][] = [
      [[], 3, '2026-10'],
      [[], 6, '2026-10'],
      [[row('2026-07', 430_000), row('2026-08', 620_000), row('2026-09', 510_000)], 3, '2026-10'],
      [[row('2026-07', 430_000), row('2026-09', 510_000)], 3, '2026-10'],
      [[row('2026-09', 510_000)], 3, '2026-10'],
      [[row('2026-07', 430_000), row('2026-08', 0, { receivedChecked: true }), row('2026-09', 0, { receivedChecked: true })], 3, '2026-10'],
      [[row('2026-04', 520_000), row('2026-05', 500_000), row('2026-06', 510_000)], 6, '2026-10'],
      [[row('2026-04', 520_000), row('2026-06', 510_000), row('2026-08', 0, { receivedChecked: true })], 6, '2026-10'],
      [[row('2026-10', 400_000), row('2026-11', 500_000), row('2026-12', 600_000)], 3, '2027-01'],
      [[row('2026-12', 500_000), row('2027-01', 600_000)], 3, '2027-02'],
      [[row('2026-08', 0, { receivedChecked: true }), row('2026-09', 100), row('2026-12', 700_000)], 6, '2027-01'],
      // R$ 0,01 e dois meses conferidos como zero: a média arredonda para zero, e a explicação é a de "menor que um centavo".
      [[row('2026-07', 1), row('2026-08', 0, { receivedChecked: true }), row('2026-09', 0, { receivedChecked: true })], 3, '2026-10'],
    ];
    for (const [rows, choice, now] of scenarios) {
      const t = incomeAverageTexts(incomeAverage(rows, choice, now));
      texts.push(...Object.values(t).filter((v): v is string => typeof v === 'string'));
    }
    expect(texts.length).toBeGreaterThan(80);
    check(texts);
  });

  it('as frases pedidas pela especificação, exatamente', () => {
    expect(INCOME_AVERAGE_TEXT.action).toBe('Calcular pela média');
    expect(INCOME_AVERAGE_TEXT.notice).toBe('É uma estimativa feita com o que você anotou. Ajuste se souber que o próximo mês será diferente.');
    const three = incomeAverageTexts(incomeAverage([row('2026-07', 430_000), row('2026-08', 620_000), row('2026-09', 510_000)], 3, '2026-10'));
    expect(three.headline).toBe('Média de julho a setembro: R$ 5.200,00');
    expect(three.count).toContain('3 de 3');
    const two = incomeAverageTexts(incomeAverage([row('2026-07', 430_000), row('2026-08', 620_000)], 3, '2026-10'));
    expect(two.count).toContain('2 de 3, setembro sem registros ficou de fora');
    const none = incomeAverageTexts(incomeAverage([], 3, '2026-10'));
    expect(none.empty).toContain('pelo menos um mês fechado com recebimentos');
  });

  it('o aviso diz que é estimativa e o texto do campo diz que só salva quando a pessoa toca em salvar; nada promete o próximo mês', () => {
    const t = incomeAverageTexts(incomeAverage([row('2026-09', 510_000)], 3, '2026-10'));
    expect(t.notice).toMatch(/estimativa/);
    expect(t.filled).toMatch(/só é salvo quando você toca/);
    for (const text of incomeAverageTextSamples()) expect(text, text).not.toMatch(/vai receber|você receberá|renda (baixa|alta|instável)|próximo mês (vai|será) (de |igual|maior|menor)/i);
  });

  it('o arquivo-fonte passa nas regras de texto', () => {
    const source = readFileSync(join(CORE_SRC, 'renda-media.ts'), 'utf8');
    expect(source).not.toMatch(FORBIDDEN);
    expect(source).not.toMatch(FORBIDDEN_EXPANDED);
    expect(source).not.toMatch(JUDGMENT);
  });
});
