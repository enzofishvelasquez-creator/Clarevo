/// <reference types="node" />
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ANNUAL_SERIES_ERROR_TEXT,
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
