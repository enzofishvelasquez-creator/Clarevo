/// <reference types="node" />
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ANNUAL_SERIES_ERROR_TEXT,
  LEARN_SECTIONS,
  LEARN_UI_TEXT,
  TOPICS,
  learnUiTextSamples,
  returnTextSamples,
  type Topic,
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

  it('telas e componentes', () => {
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
  });
});
