/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  BUDGET_CATEGORIES,
  BUDGET_NOTICE_KEEP,
  BUDGET_TEXT,
  CARDS_TEXT,
  COMMITTED_GROUPS,
  DEMO_TODAY,
  LIMIT_TEXT,
  OVERFLOW_MIN_TENTHS,
  REFUND_EDIT_MAX,
  SUMMARY_NAV_TEXT,
  budgetNoticeKey,
  budgetRow,
  categoryRefunds,
  categoryUsage,
  committedTexts,
  createDemoRepository,
  dismissBudgetNotice,
  groupPermilleShares,
  isBudgetNoticeDismissed,
  isBudgetNoticeKey,
  limitAmountCents,
  limitStatus,
  loadInvoices,
  overflowBar,
  paidInvoiceMonths,
  purchaseBlockedByPaidInvoice,
  refundEditChoices,
  seasonalCard,
  summarizeBudget,
  summarizeCommitted,
  type CardEntry,
  type CommittedSummary,
} from '../src';

/**
 * Decisões de Enzo de 16/10/2026 (D-054), na parte que é regra do core: o estorno no orçamento (E1), o excedente acima de 100% e o
 * aviso de 80% dispensado (CL-10), a legenda do Resumo (CL-05), os percentuais dos grupos pelo maior resto (CL-06). O widget com
 * valores ocultos (P-027) está em `widget.test.ts`; os textos, em `copy.test.ts`.
 */

const purchase = (category: string | null, amountCents: number, installments: number, purchasedOn: string, invoiceMonth = '2099-01') =>
  ({ kind: 'compra', category, amountCents, installments, purchasedOn, invoiceMonth, sourceMonth: null }) as const;
const refund = (category: string | null, amountCents: number, invoiceMonth: string, sourceMonth: string | null = null) =>
  ({ kind: 'estorno', category, amountCents, installments: 1, purchasedOn: null, invoiceMonth, sourceMonth }) as const;

type PurchaseLike = Pick<CardEntry, 'id' | 'kind' | 'description' | 'amountCents' | 'installments' | 'invoiceMonth' | 'purchasedOn'>;
const buy = (id: string, description: string, amountCents: number, installments: number, purchasedOn: string, invoiceMonth: string): PurchaseLike => ({
  id,
  kind: 'compra',
  description,
  amountCents,
  installments,
  invoiceMonth,
  purchasedOn,
});

// ---------------------------------------------------------------------------
// 1. Estorno no orçamento (E1)
// ---------------------------------------------------------------------------

describe('estorno no orçamento: a regra fica e a tela explica (D-054, E1)', () => {
  it('a regra do core não mudou: o estorno desconta no mês da fatura em que foi informado, e o usado do mês da compra não diminui', () => {
    // Compra de R$ 300,00 em 3x em 10/10/2026 (Lazer): R$ 100,00 em outubro, novembro e dezembro. Estorno total na fatura de novembro.
    const source = { records: [], entries: [purchase('Lazer', 30_000, 3, '2026-10-10', '2026-11'), refund('Lazer', 30_000, '2026-11')] };
    expect(categoryUsage('2026-10', source).Lazer).toBe(10_000);
    expect(categoryUsage('2026-11', source).Lazer).toBe(0);
    expect(categoryUsage('2026-12', source).Lazer).toBe(10_000);
    // Sem o estorno, os mesmos três meses: o estorno não voltou nem uma parcela ao mês da compra.
    const without = { records: [], entries: [purchase('Lazer', 30_000, 3, '2026-10-10', '2026-11')] };
    expect(categoryUsage('2026-10', without).Lazer).toBe(10_000);
    expect(categoryUsage('2026-11', without).Lazer).toBe(10_000);
  });

  it('categoryRefunds mostra, por categoria, o estorno informado numa fatura do mês (e só ele)', () => {
    const entries = [
      refund('Lazer', 30_000, '2026-11'),
      refund('Lazer', 5_000, '2026-11'),
      refund('Mercado', 1_234, '2026-11'),
      refund('Lazer', 9_999, '2026-12'), // outra fatura
      refund('Lazer', 7_000, '2026-11', '2026-10'), // crédito levado (automático): sem categoria própria, nunca conta
      refund(null, 4_000, '2026-11'), // sem categoria
      refund('Fora das seis', 3_000, '2026-11'),
      purchase('Lazer', 30_000, 3, '2026-10-10', '2026-11'),
    ];
    const nov = categoryRefunds('2026-11', entries);
    expect(Object.keys(nov)).toEqual([...BUDGET_CATEGORIES]);
    expect(nov.Lazer).toBe(35_000);
    expect(nov.Mercado).toBe(1_234);
    expect(nov.Moradia).toBe(0);
    expect(categoryRefunds('2026-12', entries).Lazer).toBe(9_999);
    expect(categoryRefunds('2026-10', entries).Lazer).toBe(0);
  });

  it('a frase é uma só: no orçamento, no formulário e no detalhe do estorno', () => {
    const rule = CARDS_TEXT.refundBudget.rule;
    expect(rule).toBe('O estorno conta no mês da fatura em que foi informado e, por isso, o usado do mês da compra no orçamento não diminui.');
    expect(BUDGET_TEXT.refundNote(15_000)).toBe(`Inclui estorno de R$ 150,00. ${rule}`);
    expect(CARDS_TEXT.refundBudget.editInstead).toBe('Se nenhuma fatura da compra foi paga, corrija o valor em Editar compra, em vez de registrar um estorno.');
    expect(CARDS_TEXT.invoice.purchaseEdit).toBe('Editar compra');
  });

  it('refundEditChoices: compras sem nenhuma fatura paga, a primeira fatura no mês do estorno ou antes, as mais recentes primeiro', () => {
    const entries: PurchaseLike[] = [
      buy('a', 'Tênis de corrida', 80_000, 4, '2026-10-05', '2026-11'),
      buy('b', 'Notebook', 150_000, 10, '2026-09-20', '2026-10'),
      buy('c', 'Restaurante', 20_000, 1, '2026-10-06', '2026-11'),
      buy('d', 'Cadeira', 40_000, 2, '2026-09-01', '2026-09'),
      buy('e', 'Presente', 9_000, 1, '2026-11-20', '2026-12'),
    ];
    // Nenhuma fatura paga: tudo com a 1ª fatura até novembro, do mais recente ao mais antigo (Presente é de dezembro e fica de fora).
    expect(refundEditChoices(entries, [], '2026-11').map((c) => c.entryId)).toEqual(['c', 'a', 'b']);
    // Fatura de setembro paga: a Cadeira (setembro e outubro) sai; as outras seguem.
    expect(refundEditChoices(entries, ['2026-09'], '2026-11', 10).map((c) => c.entryId)).toEqual(['c', 'a', 'b']);
    // Fatura de outubro paga: Notebook (1ª parcela em outubro) e Cadeira (2ª parcela em outubro) saem.
    expect(refundEditChoices(entries, ['2026-10'], '2026-11', 10).map((c) => c.entryId)).toEqual(['c', 'a']);
    // Uma parcela adiante paga também tira a compra: o Tênis (novembro a fevereiro) e o Notebook (outubro a julho) têm parcela em janeiro.
    expect(refundEditChoices(entries, ['2027-01'], '2026-11', 10).map((c) => c.entryId)).toEqual(['c', 'd']);
    // Todas as faturas pagas: nenhuma sugestão.
    expect(refundEditChoices(entries, ['2026-09', '2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03', '2027-04', '2027-05', '2027-06'], '2026-11')).toEqual([]);
    // Estorno em outubro: o Tênis e o Restaurante (1ª fatura em novembro) ainda não existiam.
    expect(refundEditChoices(entries, [], '2026-10', 10).map((c) => c.entryId)).toEqual(['b', 'd']);
    expect(refundEditChoices(entries, [], '2026-11', 2)).toHaveLength(2);
    expect(REFUND_EDIT_MAX).toBe(3);
    expect(refundEditChoices(entries, [], '2026-11')[0]).toEqual({ entryId: 'c', description: 'Restaurante', amountCents: 20_000, installments: 1, invoiceMonth: '2026-11' });
  });

  it('refundEditChoices ignora o que não é compra e lê o mesmo conjunto de faturas pagas que o resto do app', () => {
    const notPurchase = { ...buy('x', 'Juros', 1_200, 1, '2026-10-05', '2026-11'), kind: 'encargo' as const };
    expect(refundEditChoices([notPurchase], [], '2026-11')).toEqual([]);
    expect(paidInvoiceMonths([{ month: '2026-10', situation: 'paga' }, { month: '2026-11', situation: 'paga_em_parte' }, { month: '2026-12', situation: 'aberta' }])).toEqual(['2026-10', '2026-11']);
  });

  it('na demonstração: com as faturas reais do cartão, só entram compras sem fatura paga, a mais recente primeiro', async () => {
    const repo = await createDemoRepository();
    const ctx = (await repo.getSpace())!.personalContextId;
    const cards = await repo.listCards(ctx);
    expect(cards).toHaveLength(1);
    const entries = await repo.listCardEntries(cards[0]!.id);
    const invoices = await loadInvoices(repo, cards[0]!, DEMO_TODAY);
    // Nenhuma fatura da demonstração está paga: as três compras (todas com a 1ª fatura em novembro) servem a "Editar compra".
    const paid = paidInvoiceMonths(invoices);
    expect(paid).toEqual([]);
    const choices = refundEditChoices(entries, paid, '2026-11');
    expect(choices.map((c) => c.description)).toEqual(['Restaurante', 'Notebook', 'Tênis de corrida']);
    expect(choices.every((c) => entries.some((e) => e.id === c.entryId && e.kind === 'compra'))).toBe(true);
    expect(choices.every((c) => !purchaseBlockedByPaidInvoice(c.invoiceMonth, c.installments, paid))).toBe(true);
    // Fevereiro de 2027 paga (as mesmas faturas, com essa situação): só o Notebook (10 parcelas) tem parcela ali e sai da sugestão.
    const withFebPaid = invoices.map((i) => (i.month === '2027-02' ? { ...i, situation: 'paga' as const } : i));
    const paidFeb = paidInvoiceMonths(withFebPaid);
    expect(paidFeb).toEqual(['2027-02']);
    const rest = refundEditChoices(entries, paidFeb, '2026-11');
    expect(rest.map((c) => c.description)).toEqual(['Restaurante', 'Tênis de corrida']);
    expect(rest.length).toBeLessThanOrEqual(REFUND_EDIT_MAX);
  });
});

// ---------------------------------------------------------------------------
// 2. Acima de 100% e aviso de 80% dispensável (CL-10)
// ---------------------------------------------------------------------------

describe('acima de 100%: barra cheia com trecho listrado e o texto "R$ X acima" (D-054, CL-10)', () => {
  it('até o limite é a barra de sempre; 100% enche a barra sem listras', () => {
    expect(overflowBar(0, 30_000)).toEqual({ overCents: 0, solidTenths: 0, stripedTenths: 0 });
    expect(overflowBar(23_340, 30_000)).toEqual({ overCents: 0, solidTenths: 778, stripedTenths: 0 });
    expect(overflowBar(30_000, 30_000)).toEqual({ overCents: 0, solidTenths: 1000, stripedTenths: 0 });
  });

  it('acima de 100%: cheia, com o trecho final listrado proporcional ao excedente', () => {
    // R$ 400,00 de R$ 300,00 (133,3%): o excedente é 33,3% do orçamento, então o trecho listrado ocupa 33,3% da barra.
    expect(overflowBar(40_000, 30_000)).toEqual({ overCents: 10_000, solidTenths: 667, stripedTenths: 333 });
    expect(overflowBar(33_000, 30_000)).toEqual({ overCents: 3_000, solidTenths: 900, stripedTenths: 100 });
    // O trecho e o sólido fecham sempre a largura da barra.
    for (const used of [30_001, 31_000, 36_000, 45_000, 59_999, 60_000, 90_000, 9_999_999]) {
      const bar = overflowBar(used, 30_000);
      expect(bar.solidTenths + bar.stripedTenths, String(used)).toBe(1000);
    }
  });

  it('o excedente é limitado à largura: 200% ou mais é toda listrada', () => {
    expect(overflowBar(60_000, 30_000)).toEqual({ overCents: 30_000, solidTenths: 0, stripedTenths: 1000 });
    expect(overflowBar(900_000, 30_000)).toEqual({ overCents: 870_000, solidTenths: 0, stripedTenths: 1000 });
  });

  it('um excedente de poucos centavos ainda aparece (mínimo de 2% da largura)', () => {
    expect(OVERFLOW_MIN_TENTHS).toBe(20);
    expect(overflowBar(30_001, 30_000)).toEqual({ overCents: 1, solidTenths: 980, stripedTenths: 20 });
    expect(overflowBar(100_001, 100_000).stripedTenths).toBe(20);
  });

  it('100% e 133,3% ficam diferentes sem depender de cor, e o texto diz o excedente', () => {
    const line = (usedCents: number) =>
      budgetRow({ category: 'Lazer', budgetId: 'b', budgetVersion: 1, budgetFrom: '2026-10', budgetCents: 30_000, usedCents });
    const full = line(30_000);
    const over = line(40_000);
    expect([full.solidTenths, full.stripedTenths, full.overText, full.overA11y]).toEqual([1000, 0, null, null]);
    expect([over.solidTenths, over.stripedTenths, over.overText, over.overA11y]).toEqual([667, 333, 'R$ 100,00 acima', 'R$ 100,00 acima do orçamento']);
    expect(over.barTenths).toBe(1000);
    expect(over.percentText).toBe('133,3%');
    // O leitor de tela anuncia "R$ X acima do orçamento" (a frase do card, que já existia).
    expect(over.a11yLabel).toBe('Lazer, R$ 400,00 de R$ 300,00, 133,3% do orçamento. R$ 100,00 acima do orçamento.');
    expect(BUDGET_TEXT.overShort(10_000)).toBe('R$ 100,00 acima');
    expect(BUDGET_TEXT.over(10_000)).toBe('R$ 100,00 acima do orçamento');
  });

  it('na demonstração de outubro: Moradia 100% cheia, Mercado 77,8% e Lazer 133,3% com 33,3% listrado; o usado e o orçado não mudam', async () => {
    const repo = await createDemoRepository();
    const ctx = (await repo.getSpace())!.personalContextId;
    const s = summarizeBudget(await repo.getMonthBudget(ctx, '2026-10'));
    expect(s.rows.map((r) => [r.category, r.amountLine, r.percentText, r.solidTenths, r.stripedTenths, r.overText])).toEqual([
      ['Moradia', 'R$ 2.500,00 de R$ 2.500,00', '100,0%', 1000, 0, null],
      ['Mercado', 'R$ 1.400,00 de R$ 1.800,00', '77,8%', 778, 0, null],
      ['Lazer', 'R$ 400,00 de R$ 300,00', '133,3%', 667, 333, 'R$ 100,00 acima'],
    ]);
    expect(s.totalLine).toBe('Orçado R$ 4.600,00 · Usado R$ 4.300,00');
  });

  it('o excedente é calculado em centavos exatos, no valor e no percentual', () => {
    const o = budgetRow({ category: 'Mercado', budgetId: 'b', budgetVersion: 1, budgetFrom: '2026-10', budgetCents: 120_000, usedCents: 133_330 });
    expect([o.overCents, o.overText, o.percentText, o.solidTenths, o.stripedTenths]).toEqual([13_330, 'R$ 133,30 acima', '111,1%', 889, 111]);
  });
});

describe('aviso de 80% no card, que a pessoa pode dispensar (D-054, CL-10)', () => {
  const row = (usedCents: number, budgetCents = 10_000) =>
    budgetRow({ category: 'Mercado', budgetId: 'b', budgetVersion: 1, budgetFrom: '2026-10', budgetCents, usedCents });

  it('aparece de 80% a menos de 100%, com o percentual inteiro para baixo; antes, no valor e depois, não', () => {
    expect([row(7_999).nearPercent, row(7_999).nearNotice]).toEqual([null, null]);
    expect([row(8_000).nearPercent, row(8_000).nearNotice]).toEqual([80, 'Chegou a 80% do orçamento.']);
    expect(row(8_490).nearNotice).toBe('Chegou a 84% do orçamento.');
    expect(row(9_999).nearNotice).toBe('Chegou a 99% do orçamento.');
    expect(row(10_000).nearNotice).toBeNull();
    expect(row(10_001).nearNotice).toBeNull();
  });

  it('a chave é da categoria e do mês: dispensar em outubro não esconde novembro nem outra categoria', () => {
    expect(budgetNoticeKey('2026-10', 'Mercado')).toBe('2026-10|Mercado');
    const dismissed = dismissBudgetNotice([], '2026-10', 'Mercado', DEMO_TODAY);
    expect(dismissed).toEqual(['2026-10|Mercado']);
    expect(isBudgetNoticeDismissed(dismissed, '2026-10', 'Mercado')).toBe(true);
    expect(isBudgetNoticeDismissed(dismissed, '2026-11', 'Mercado')).toBe(false); // volta no mês seguinte
    expect(isBudgetNoticeDismissed(dismissed, '2026-10', 'Lazer')).toBe(false);
  });

  it('dispensar de novo não repete; o que vem do aparelho é conferido; o que é antigo e o excesso saem', () => {
    const once = dismissBudgetNotice([], '2026-10', 'Mercado', DEMO_TODAY);
    expect(dismissBudgetNotice(once, '2026-10', 'Mercado', DEMO_TODAY)).toEqual(once);
    expect(dismissBudgetNotice([...once, 'lixo', '2026-13|Mercado', '2026-10|Outra', 7 as unknown as string], '2026-11', 'Lazer', DEMO_TODAY)).toEqual(['2026-10|Mercado', '2026-11|Lazer']);
    // Mais de 24 meses antes de hoje saem (outubro de 2024 ainda vale; setembro de 2024 não).
    expect(dismissBudgetNotice(['2024-09|Mercado', '2024-10|Mercado'], '2026-10', 'Lazer', DEMO_TODAY)).toEqual(['2024-10|Mercado', '2026-10|Lazer']);
    // No máximo 120, os mais novos.
    const many = Array.from({ length: 150 }, (_, i) => `2026-${String((i % 12) + 1).padStart(2, '0')}|${BUDGET_CATEGORIES[i % 6]}`);
    const kept = dismissBudgetNotice(many, '2026-10', 'Mercado', DEMO_TODAY);
    expect(kept.length).toBeLessThanOrEqual(BUDGET_NOTICE_KEEP);
    expect(kept[kept.length - 1]).toBe('2026-10|Mercado');
    expect(isBudgetNoticeKey('2026-10|Mercado')).toBe(true);
    expect(isBudgetNoticeKey('2026-10|Mercado|x')).toBe(false);
    expect(isBudgetNoticeKey(undefined)).toBe(false);
  });

  it('um mês de mais de 24 meses atrás ainda pode ser dispensado: só as chaves antigas já guardadas saem, a nova fica', () => {
    // Setembro de 2024 está a 25 meses de outubro de 2026: a chave nova não pode ser podada junto com as antigas.
    expect(dismissBudgetNotice([], '2024-09', 'Mercado', '2026-10-07')).toEqual(['2024-09|Mercado']);
    expect(dismissBudgetNotice(['2024-08|Lazer', '2026-10|Lazer'], '2024-09', 'Mercado', '2026-10-07')).toEqual(['2026-10|Lazer', '2024-09|Mercado']);
    // Dispensar de novo a mesma chave antiga não a repete.
    expect(dismissBudgetNotice(['2024-09|Mercado'], '2024-09', 'Mercado', '2026-10-07')).toEqual(['2024-09|Mercado']);
  });
});

describe('acima do limite pessoal: a mesma barra (D-054, CL-10)', () => {
  it('o limite em reais é a renda de referência vezes o percentual, para baixo', () => {
    expect(limitAmountCents(600_000, 60)).toBe(360_000);
    expect(limitAmountCents(333_333, 30)).toBe(99_999);
    expect(limitAmountCents(100, 10)).toBe(10);
  });

  it('novembro da demonstração: R$ 4.380,00 contra 60% de R$ 6.000,00; barra cheia com 21,7% listrado e "R$ 780,00 acima"', () => {
    const status = limitStatus('2026-11', 730, 438_000, 60, DEMO_TODAY, 600_000)!;
    expect(status.kind).toBe('acima');
    expect(status.note).toBe('Novembro passou 13,0 pontos do limite de 60% que você escolheu.');
    expect(status.bar).toEqual({
      overCents: 78_000,
      solidTenths: 783,
      stripedTenths: 217,
      limitCents: 360_000,
      overText: 'R$ 780,00 acima',
      overA11y: 'R$ 780,00 acima do limite',
    });
    expect(LIMIT_TEXT.overShort(78_000)).toBe('R$ 780,00 acima');
    expect(LIMIT_TEXT.overA11y(78_000)).toBe('R$ 780,00 acima do limite');
  });

  it('dentro do limite: a barra vai até o percentual do limite e não tem listras nem texto de excedente', () => {
    const oct = limitStatus('2026-10', 525, 315_000, 60, DEMO_TODAY, 600_000)!;
    expect(oct.kind).toBe('dentro');
    expect(oct.bar).toMatchObject({ solidTenths: 875, stripedTenths: 0, overCents: 0, overText: null, overA11y: null });
    const perto = limitStatus('2026-10', 580, 348_000, 60, DEMO_TODAY, 600_000)!;
    expect(perto.kind).toBe('perto');
    expect(perto.bar).toMatchObject({ solidTenths: 967, stripedTenths: 0, overText: null });
    const exact = limitStatus('2026-10', 600, 360_000, 60, DEMO_TODAY, 600_000)!;
    expect(exact.note).toBe('Outubro está no limite de 60% que você escolheu.');
    expect(exact.bar).toMatchObject({ solidTenths: 1000, stripedTenths: 0, overText: null });
  });

  it('a barra e a frase nunca discordam: centavos acima do limite que o percentual arredonda para o limite não viram "acima"', () => {
    // 600,17 milésimos arredondam para 600 (no limite); a barra fica cheia, sem listras e sem texto de excedente.
    const status = limitStatus('2026-10', 600, 360_100, 60, DEMO_TODAY, 600_000)!;
    expect(status.kind).toBe('perto');
    expect(status.bar).toMatchObject({ solidTenths: 1000, stripedTenths: 0, overText: null });
    // Um milésimo acima do limite: acima, e o excedente nunca é menor que R$ 0,01.
    const above = limitStatus('2026-10', 601, 360_600, 60, DEMO_TODAY, 600_000)!;
    expect(above.kind).toBe('acima');
    expect(above.bar!.overCents).toBe(600);
    expect(above.bar!.overText).toBe('R$ 6,00 acima');
  });

  it('sem a renda de referência na chamada, não há barra (as frases seguem como eram)', () => {
    const status = limitStatus('2026-11', 730, 438_000, 60, DEMO_TODAY)!;
    expect(status.bar).toBeNull();
    expect(status.line).toBe('73,0% de 60% que você escolheu');
    expect(limitStatus('2026-11', null, 0, 60, DEMO_TODAY, 600_000)).toBeNull();
    expect(limitStatus('2026-11', 730, 438_000, null, DEMO_TODAY, 600_000)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 3. Legenda do Resumo (CL-05)
// ---------------------------------------------------------------------------

describe('legenda do Resumo: "Recebido menos pago até DD/MM · não é saldo" (D-054, CL-05)', () => {
  it('no mês de hoje, com a data de hoje da sessão', () => {
    expect(SUMMARY_NAV_TEXT.differenceCaption('2026-10', DEMO_TODAY)).toBe('Recebido menos pago até 07/10 · não é saldo');
    expect(SUMMARY_NAV_TEXT.differenceCaption('2026-11', '2026-11-12')).toBe('Recebido menos pago até 12/11 · não é saldo');
    expect(SUMMARY_NAV_TEXT.differenceCaption('2027-01', '2027-01-03')).toBe('Recebido menos pago até 03/01 · não é saldo');
  });

  it('em outro mês, sem data de hoje (o período é o mês inteiro)', () => {
    expect(SUMMARY_NAV_TEXT.differenceCaption('2026-09', DEMO_TODAY)).toBe('Recebido menos pago no mês · não é saldo');
    expect(SUMMARY_NAV_TEXT.differenceCaption('2026-11', DEMO_TODAY)).toBe('Recebido menos pago no mês · não é saldo');
  });

  it('o leitor de tela lê a mesma legenda, sem o ponto de separação', () => {
    expect(SUMMARY_NAV_TEXT.differenceCaptionA11y('2026-10', DEMO_TODAY)).toBe('Recebido menos pago até 07/10. Não é saldo.');
    expect(SUMMARY_NAV_TEXT.differenceCaptionA11y('2026-09', DEMO_TODAY)).toBe('Recebido menos pago no mês. Não é saldo.');
  });

  it('é curta: cabe em duas linhas de 13 px na faixa azul de 320 px (no máximo 46 caracteres), sem a frase antiga', () => {
    for (const caption of [SUMMARY_NAV_TEXT.differenceCaption('2026-10', '2026-10-31'), SUMMARY_NAV_TEXT.differenceCaption('2026-09', DEMO_TODAY)]) {
      expect(caption.length).toBeLessThanOrEqual(46);
      expect(caption).not.toContain('confirmados');
      expect(caption.endsWith('não é saldo')).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// 4. Percentuais dos grupos da renda comprometida (CL-06)
// ---------------------------------------------------------------------------

describe('renda comprometida: os percentuais dos grupos somam o total pelo maior resto (D-054, CL-06)', () => {
  const parseTenths = (text: string): number => {
    const m = /(\d+),(\d)%/.exec(text);
    return m ? Number(m[1]) * 10 + Number(m[2]) : -1;
  };

  async function demoMonth(month: string): Promise<CommittedSummary> {
    const repo = await createDemoRepository();
    const ctx = (await repo.getSpace())!.personalContextId;
    return summarizeCommitted(await repo.listCommitments(ctx, month), ctx, month, DEMO_TODAY, await repo.listIncomeReferences(ctx), await repo.listSeries(ctx));
  }

  it('novembro da demonstração (docs/12): 73,0% no total e 44,7 + 14,2 + 9,1 + 5,0 nos grupos, não 9,2', async () => {
    const nov = await demoMonth('2026-11');
    expect(nov.committedPermille).toBe(730);
    // Cada grupo arredondado sozinho somaria 73,1 (44,7 + 14,2 + 9,2 + 5,0); o banco só guarda o total e o das dívidas.
    expect([nov.fixedPermille, nov.installmentPermille, nov.cardPermille, nov.otherPermille]).toEqual([447, 142, 92, 50]);
    const shares = groupPermilleShares(nov);
    expect(shares).toEqual({ fixos: 447, anuais: 0, parcelamentos: 142, faturas: 91, outras: 50 });
    const t = committedTexts(nov, 600_000);
    expect(t.highlight).toBe('73,0%');
    expect(t.groups.map((g) => [g.label, g.percentText])).toEqual([
      ['Gastos fixos', '44,7%'],
      ['Parcelamentos', '14,2%'],
      ['Faturas de cartão', '9,1%'],
      ['Outras contas a pagar', '5,0%'],
    ]);
    expect(t.groups.reduce((sum, g) => sum + parseTenths(g.percentText!), 0)).toBe(parseTenths(t.highlight!));
    // A barra de cada grupo usa o mesmo número que o texto.
    expect(t.groups.map((g) => g.permille)).toEqual([447, 142, 91, 50]);
  });

  it('outubro continua como era: 41,7 + 10,8 = 52,5%', async () => {
    const oct = await demoMonth('2026-10');
    const t = committedTexts(oct, 600_000);
    expect(t.highlight).toBe('52,5%');
    expect(t.groups.map((g) => [g.label, g.percentText])).toEqual([
      ['Gastos fixos', '41,7%'],
      ['Parcelamentos', '0,0%'],
      ['Outras contas a pagar', '10,8%'],
    ]);
    expect(t.groups.reduce((sum, g) => sum + parseTenths(g.percentText!), 0)).toBe(525);
  });

  it('o total é o do banco (month_committed): o maior resto só mexe na exibição dos grupos', async () => {
    const nov = await demoMonth('2026-11');
    const before = [nov.committedPermille, nov.debtPermille, nov.committedCents, nov.outsideCents];
    committedTexts(nov, 600_000);
    expect([nov.committedPermille, nov.debtPermille, nov.committedCents, nov.outsideCents]).toEqual(before);
    expect(committedTexts(nov).debt).toBe('Dívidas: R$ 850,00 · 14,2% da renda de referência.');
  });

  it('em qualquer divisão a soma dos grupos é exatamente o total e cada grupo fica a menos de 1,5 milésimo do seu valor exato', () => {
    let seed = 20261016;
    const next = (max: number) => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return Math.floor((seed / 4294967296) * max);
    };
    let checked = 0;
    for (let i = 0; i < 4000; i++) {
      const reference = 100 + next(3_000_000);
      const cents = COMMITTED_GROUPS.map(() => (next(3) === 0 ? 0 : next(Math.max(1, Math.floor(reference / 2)))));
      const committed = cents.reduce((a, b) => a + b, 0);
      const permille = Math.floor((2000 * committed + reference) / (2 * reference));
      const shares = groupPermilleShares({ committedPermille: permille, fixedCents: cents[0]!, annualCents: cents[1]!, installmentCents: cents[2]!, cardCents: cents[3]!, otherCents: cents[4]! });
      const values = COMMITTED_GROUPS.map((g) => shares[g]!);
      expect(values.reduce((a, b) => a + b, 0), `soma ${JSON.stringify({ reference, cents })}`).toBe(permille);
      values.forEach((v, k) => {
        expect(v).toBeGreaterThanOrEqual(0);
        if (cents[k] === 0) expect(v).toBe(0);
        expect(Math.abs(v - (cents[k]! * 1000) / reference), `grupo ${k} ${JSON.stringify({ reference, cents })}`).toBeLessThan(1.5);
      });
      checked++;
    }
    expect(checked).toBe(4000);
  });

  it('sem referência não há percentual por grupo; sem comprometido, tudo zero', () => {
    const none = groupPermilleShares({ committedPermille: null, fixedCents: 1, annualCents: 0, installmentCents: 0, cardCents: 0, otherCents: 0 });
    expect(Object.values(none).every((v) => v === null)).toBe(true);
    const zero = groupPermilleShares({ committedPermille: 0, fixedCents: 0, annualCents: 0, installmentCents: 0, cardCents: 0, otherCents: 0 });
    expect(Object.values(zero).every((v) => v === 0)).toBe(true);
  });

  it('um grupo minúsculo continua dito "menos de 0,1%" e o total fecha', () => {
    // R$ 0,50 de uma renda de R$ 6.000,00 e R$ 1.000,00 em outro grupo: 16,7% no total (1.000,50 → 166,75 → 167 milésimos).
    const s = summarizeCommitted(
      [
        { id: 'a', contextId: 'ctx', description: 'A', amountCents: 100_000, currency: 'BRL', category: null, dueOn: '2026-10-10', status: 'aberto', payment: null, series: { seriesId: 's', kind: 'mensal', nature: 'conta', number: 1 }, seriesOverride: false, amountIsEstimate: false, invoice: null, createdBy: 'p', version: 1, createdAt: '2026-10-01T10:00:00Z', updatedAt: '2026-10-01T10:00:00Z' },
        { id: 'b', contextId: 'ctx', description: 'B', amountCents: 50, currency: 'BRL', category: null, dueOn: '2026-10-11', status: 'aberto', payment: null, series: null, seriesOverride: false, amountIsEstimate: false, invoice: null, createdBy: 'p', version: 1, createdAt: '2026-10-01T10:00:00Z', updatedAt: '2026-10-01T10:00:00Z' },
      ] as never,
      'ctx',
      '2026-10',
      DEMO_TODAY,
      [{ id: 'r', contextId: 'ctx', amountCents: 600_000, fromMonth: '2026-09', varies: false, version: 1 }] as never,
    );
    const t = committedTexts(s);
    expect(s.committedPermille).toBe(167);
    expect(t.highlight).toBe('16,7%');
    expect(t.groups.reduce((sum, g) => sum + g.permille!, 0)).toBe(167);
  });
});

// ---------------------------------------------------------------------------
// 5. "Neste mês" em Metas (P-028)
// ---------------------------------------------------------------------------

describe('"Neste mês" em Metas: o mesmo card de Aprender (D-054, P-028)', () => {
  const APP_SRC = fileURLToPath(new URL('../../../apps/app/src/', import.meta.url));
  const read = (file: string) => readFileSync(`${APP_SRC}${file}`, 'utf8');

  it('o card vem de seasonalCard(hoje): outubro tem 13º salário e Contas que chegam uma vez por ano; agosto e setembro não têm card', () => {
    const oct = seasonalCard('2026-10-07')!;
    expect(oct.topics.map((t) => t.slug)).toEqual(['decimo-terceiro', 'contas-do-ano']);
    expect(seasonalCard('2026-08-10')).toBeNull();
    expect(seasonalCard('2026-09-30')).toBeNull();
  });

  it('Aprender e Metas usam o mesmo componente, e Metas o põe depois do conteúdo principal, antes de "Quem vê estes dados?"', () => {
    const metas = read('app/(tabs)/metas.tsx');
    const aprender = read('app/(tabs)/aprender.tsx');
    const card = read('components/season-card.tsx');
    expect(metas).toContain("import { SeasonCardView } from '@/components/season-card'");
    expect(aprender).toContain("import { SeasonCardView } from '@/components/season-card'");
    expect(metas).toContain('seasonalCard(today)');
    expect(card).toContain('export function SeasonCardView');
    expect(aprender).not.toContain('function SeasonCardView');
    expect(metas).not.toContain('function SeasonCardView');
    expect(metas.indexOf('<ClosedGoals')).toBeLessThan(metas.indexOf('<SeasonCardView'));
    expect(metas.indexOf('<SeasonCardView')).toBeLessThan(metas.indexOf("router.push('/quem-ve')"));
  });

  it('só lê: nem o componente nem a leitura em Metas gravam, enviam ou pedem notificação', () => {
    const card = read('components/season-card.tsx');
    expect(card).not.toMatch(/useMutation|fetch\(|Notification|AsyncStorage|localStorage|updatePrefs/);
    const metas = read('app/(tabs)/metas.tsx');
    expect(metas).not.toMatch(/Notification|AsyncStorage|localStorage/);
  });
});
