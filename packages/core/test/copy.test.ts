import { describe, expect, it } from 'vitest';
import {
  COMMITMENT_ERROR_TEXT,
  DEMO_TODAY,
  ERROR_TEXT,
  PAYMENT_ERROR_TEXT,
  SERIES_ERROR_TEXT,
  SERIES_NATURE_LABEL,
  SERIES_NATURE_SHORT,
  affectedByEditFrom,
  affectedByEnd,
  createDemoRepository,
  findSeriesConflicts,
  firstMonthChoices,
  firstMonthRangeText,
  installmentProgress,
  seriesCaption,
  seriesPreview,
  summarizeToPay,
  termHistory,
  toPayCaption,
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
    const texts = [ERROR_TEXT, COMMITMENT_ERROR_TEXT, PAYMENT_ERROR_TEXT, SERIES_ERROR_TEXT, SERIES_NATURE_LABEL, SERIES_NATURE_SHORT].flatMap((o) =>
      Object.values(o),
    );
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
      const n = Math.max(...occurrences.map((c) => c.series!.number));
      const edit = affectedByEditFrom(occurrences, s, n);
      if (edit.ok) texts.push(edit.text);
      const end = affectedByEnd(occurrences, s, s.firstNumber - 1);
      if (end.ok && end.text) texts.push(end.text);
      expect(installmentProgress(s, occurrences, DEMO_TODAY).remainingCents ?? 0).toBeGreaterThanOrEqual(0);
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
});
