import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  CARDS_TEXT,
  COMMITTED_TEXT,
  CARD_CHARGES_CATEGORY,
  CARD_ERROR_TEXT,
  DEMO_TODAY,
  MemoryRepository,
  RepoError,
  addDays,
  buildInvoices,
  cardChargeError,
  cardErrorText,
  cardInputError,
  cardLimitUsed,
  cardPurchaseError,
  cardRefundError,
  cardSummaryTexts,
  cardTitle,
  categoryBreakdown,
  looksLikeCardNumber,
  normalizeCardInput,
  currentInvoiceOf,
  invoiceCanBePaid,
  paidInvoiceMonths,
  purchaseBlockedByPaidInvoice,
  purchaseFirstInvoiceMonth,
  purchasePreview,
  receiptKeyDigest,
  receiptKeyValid,
  invoiceItemOf,
  closesText,
  committedGroupOf,
  committedTexts,
  createDemoRepository,
  creditText,
  distributeInvoicePayment,
  dueTextOf,
  installmentAmounts,
  installmentsNotice,
  invoiceClosingOn,
  invoiceCommitmentDescription,
  invoiceDueOn,
  invoiceFor,
  invoiceLineText,
  invoiceMonthError,
  invoiceMonthLabel,
  invoiceMonthOf,
  invoicePaymentError,
  invoicePeriod,
  invoiceRecordDescription,
  invoiceTexts,
  isInvoiceCommitment,
  isInvoicePayment,
  isRepoError,
  limitUsedText,
  loadInvoices,
  loadInvoicesOfRecords,
  newOperationKey,
  partialPaymentCalcLink,
  partialPaymentText,
  projectCommitted,
  purchaseInstallments,
  purchaseNotice,
  quickPayAction,
  quickPayDraft,
  reminderPlan,
  summarizeCard,
  summarizeCommitted,
  summarizeMonth,
  summarizeToPay,
  upcomingCommittedMonths,
  validateCardChargeDraft,
  validateCardDraft,
  validateCardPurchaseDraft,
  validateCardRefundDraft,
  validateInvoicePaymentDraft,
  type Card,
  type CardInput,
  type Commitment,
  type FinancialRecord,
  type Invoice,
  type RepoErrorCode,
} from '../src';
import { batchEligible, buildReturnReview, rowActions } from '../src';
import { factsFromKey, readReceiptCode, receiptDraft } from '../src';

const TODAY = DEMO_TODAY; // 2026-10-07
const OCT = '2026-10';
const NOV = '2026-11';
const DEC = '2026-12';
const key = () => newOperationKey();

async function expectCode(p: Promise<unknown>, code: RepoErrorCode) {
  let error: unknown = null;
  try {
    await p;
  } catch (e) {
    error = e;
  }
  expect(isRepoError(error, code), `esperava ${code}, veio ${String(error)}`).toBe(true);
}

const NUBANK: CardInput = { name: 'Nubank', lastDigits: '1234', closingDay: 3, dueDay: 10, limitCents: 500_000 };

/** Repositório vazio com o dia ajustável e um cartão (fecha dia 3, vence dia 10). */
async function fresh(day = TODAY, input: CardInput = NUBANK) {
  const clock = { today: day };
  const repo = new MemoryRepository({ actorId: 'pessoa-teste', displayName: 'Pessoa de teste', today: () => clock.today });
  const space = await repo.ensurePersonalSpace('Conta principal');
  const ctx = space.personalContextId;
  const created = await repo.createCard(key(), ctx, input);
  const cardId = created.card.id;
  const invoices = async () => loadInvoices(repo, (await repo.getCard(cardId))!, clock.today);
  const invoice = async (month: string) => invoiceFor((await repo.getCard(cardId))!, await invoices(), month, clock.today);
  const purchase = (description: string, totalCents: number, purchasedOn: string, installments = 1, category: string | null = null) =>
    repo.addCardPurchase(key(), cardId, { description, category, purchasedOn, totalCents, installments });
  const totals = async (month = OCT) => {
    const s = summarizeMonth(await repo.listRecords(ctx, month), ctx, month);
    return [s.receivedCents, s.paidCents, s.differenceCents];
  };
  return { repo, ctx, cardId, clock, invoices, invoice, purchase, totals, accountId: space.accounts[0]!.id };
}

// ---------------------------------------------------------------------------
// 1. Datas da fatura
// ---------------------------------------------------------------------------

describe('datas da fatura', () => {
  it('Cartão Exemplo (fecha dia 3, vence dia 10): fatura de novembro fecha em 03/11, vence em 10/11 e cobre 04/10 a 03/11', () => {
    const card = { closingDay: 3, dueDay: 10 };
    expect(invoiceClosingOn(card, NOV)).toBe('2026-11-03');
    expect(invoiceDueOn(card, NOV)).toBe('2026-11-10');
    expect(invoicePeriod(card, NOV)).toEqual({ startOn: '2026-10-04', endOn: '2026-11-03' });
    expect(invoicePeriod(card, OCT)).toEqual({ startOn: '2026-09-04', endOn: '2026-10-03' });
  });

  it('compra até o dia do fechamento fica na fatura que fecha nele; depois dele vai para a seguinte', () => {
    const card = { closingDay: 3, dueDay: 10 };
    expect(invoiceMonthOf(card, '2026-10-03')).toBe(OCT);
    expect(invoiceMonthOf(card, '2026-10-04')).toBe(NOV);
    expect(invoiceMonthOf(card, '2026-10-05')).toBe(NOV);
    expect(invoiceMonthOf(card, '2026-11-03')).toBe(NOV);
    expect(invoiceMonthOf(card, '2026-11-04')).toBe(DEC);
    expect(invoiceMonthOf(card, '2026-12-31')).toBe('2027-01');
    expect(invoiceMonthOf(card, '2026-01-01')).toBe('2026-01');
  });

  it('fechamento depois do vencimento (fecha dia 25, vence dia 5): o fechamento da fatura é do mês anterior', () => {
    const card = { closingDay: 25, dueDay: 5 };
    expect(invoiceClosingOn(card, NOV)).toBe('2026-10-25');
    expect(invoiceDueOn(card, NOV)).toBe('2026-11-05');
    expect(invoicePeriod(card, NOV)).toEqual({ startOn: '2026-09-26', endOn: '2026-10-25' });
    expect(invoiceMonthOf(card, '2026-10-25')).toBe(NOV);
    expect(invoiceMonthOf(card, '2026-10-26')).toBe(DEC);
    expect(invoiceMonthOf(card, '2026-10-10')).toBe(NOV);
    expect(invoiceClosingOn(card, '2027-01')).toBe('2026-12-25');
  });

  it('vencimento no mesmo dia do fechamento: fecha no mês anterior ("senão M - 1")', () => {
    const card = { closingDay: 10, dueDay: 10 };
    expect(invoiceClosingOn(card, NOV)).toBe('2026-10-10');
    expect(invoiceDueOn(card, NOV)).toBe('2026-11-10');
    expect(invoiceMonthOf(card, '2026-10-10')).toBe(NOV);
    expect(invoiceMonthOf(card, '2026-10-11')).toBe(DEC);
  });

  it('fim de mês: dias 29, 30 e 31 em fevereiro (ano comum e bissexto) e em meses de 30 dias', () => {
    const c31 = { closingDay: 31, dueDay: 5 };
    expect(invoiceClosingOn(c31, '2027-03')).toBe('2027-02-28');
    expect(invoiceClosingOn(c31, '2028-03')).toBe('2028-02-29');
    expect(invoiceClosingOn(c31, '2026-12')).toBe('2026-11-30');
    expect(invoiceClosingOn(c31, '2027-02')).toBe('2027-01-31');
    expect(invoicePeriod(c31, '2027-03')).toEqual({ startOn: '2027-02-01', endOn: '2027-02-28' });
    expect(invoiceMonthOf(c31, '2027-02-28')).toBe('2027-03');
    expect(invoiceMonthOf(c31, '2027-03-01')).toBe('2027-04');
    const d31 = { closingDay: 3, dueDay: 31 };
    expect(invoiceDueOn(d31, '2027-02')).toBe('2027-02-28');
    expect(invoiceDueOn(d31, '2028-02')).toBe('2028-02-29');
    expect(invoiceDueOn(d31, '2026-11')).toBe('2026-11-30');
    const c30 = { closingDay: 30, dueDay: 31 };
    expect(invoiceClosingOn(c30, '2027-02')).toBe('2027-02-28');
    expect(invoiceMonthOf(c30, '2027-02-28')).toBe('2027-02');
    expect(invoiceMonthOf(c30, '2027-03-01')).toBe('2027-03');
    const c29 = { closingDay: 29, dueDay: 8 };
    expect(invoiceClosingOn(c29, '2028-03')).toBe('2028-02-29');
    expect(invoiceClosingOn(c29, '2027-03')).toBe('2027-02-28');
  });

  it('para todo dia de 2026 a 2028 e vários pares de dias, o período da fatura contém a data e os períodos se encaixam', () => {
    const days = [1, 2, 3, 10, 15, 25, 28, 29, 30, 31];
    for (const closingDay of days) {
      for (const dueDay of days) {
        const card = { closingDay, dueDay };
        for (let date = '2026-01-01'; date <= '2028-12-31'; date = addDays(date, 1)) {
          const month = invoiceMonthOf(card, date);
          const { startOn, endOn } = invoicePeriod(card, month);
          if (!(startOn <= date && date <= endOn)) throw new Error(`fora do período: ${closingDay}/${dueDay} ${date} ${month} ${startOn}..${endOn}`);
        }
        // Fechamentos crescem a cada fatura e o vencimento nunca é antes do fechamento.
        for (let month = '2026-01'; month < '2028-12'; month = addMonthsLocal(month, 1)) {
          const next = addMonthsLocal(month, 1);
          if (!(invoiceClosingOn(card, month) < invoiceClosingOn(card, next))) throw new Error(`fechamento não cresce: ${closingDay}/${dueDay} ${month}`);
          if (!(invoiceClosingOn(card, month) <= invoiceDueOn(card, month))) throw new Error(`vence antes de fechar: ${closingDay}/${dueDay} ${month}`);
        }
      }
    }
  });
});

function addMonthsLocal(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const total = y * 12 + (m - 1) + delta;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// 2. Parcelas
// ---------------------------------------------------------------------------

describe('parcelas', () => {
  it('total ÷ n com o resto de centavos na primeira', () => {
    expect(installmentAmounts(10_000, 3)).toEqual([3_334, 3_333, 3_333]);
    expect(installmentAmounts(10_001, 3)).toEqual([3_335, 3_333, 3_333]);
    expect(installmentAmounts(60_000, 3)).toEqual([20_000, 20_000, 20_000]);
    expect(installmentAmounts(100, 48)).toEqual([6, ...Array(47).fill(2)]);
    expect(installmentAmounts(1, 1)).toEqual([1]);
    for (const [total, n] of [[99_999_999, 48], [12_345, 7], [48, 48], [47_999, 48]] as const) {
      const parts = installmentAmounts(total, n);
      expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
      expect(parts.length).toBe(n);
      expect(Math.min(...parts)).toBeGreaterThanOrEqual(Math.floor(total / n));
    }
    expect(() => installmentAmounts(100, 0)).toThrow(RangeError);
    expect(() => installmentAmounts(1.5, 2)).toThrow(RangeError);
  });

  it('a parcela 1 cai na fatura da compra e as outras nas faturas seguintes (virada de ano incluída)', () => {
    const parts = purchaseInstallments({ id: 'c1', amountCents: 60_000, installments: 3, invoiceMonth: NOV });
    expect(parts.map((p) => [p.number, p.count, p.amountCents, p.invoiceMonth])).toEqual([
      [1, 3, 20_000, NOV],
      [2, 3, 20_000, DEC],
      [3, 3, 20_000, '2027-01'],
    ]);
    expect(purchaseInstallments({ id: 'c2', amountCents: 100_000, installments: 1, invoiceMonth: '2027-12' }).map((p) => p.invoiceMonth)).toEqual(['2027-12']);
    const last = purchaseInstallments({ id: 'c3', amountCents: 480_000, installments: 48, invoiceMonth: DEC });
    expect(last[47]!.invoiceMonth).toBe('2030-11');
  });
});

// ---------------------------------------------------------------------------
// 3. Validação
// ---------------------------------------------------------------------------

describe('validação, na ordem do banco', () => {
  const ok: CardInput = { name: 'Nubank', lastDigits: '0042', closingDay: 3, dueDay: 10, limitCents: 500_000 };

  it('cartão: apelido, final, dias e limite', () => {
    expect(cardInputError(ok)).toBeNull();
    expect(cardInputError({ ...ok, lastDigits: null, limitCents: null })).toBeNull();
    expect(cardInputError({ ...ok, name: '' })).toBe('apelido_invalido');
    expect(cardInputError({ ...ok, name: ' Nubank' })).toBe('apelido_invalido');
    expect(cardInputError({ ...ok, name: 'a'.repeat(31) })).toBe('apelido_invalido');
    expect(cardInputError({ ...ok, name: 'a'.repeat(30) })).toBeNull();
    for (const bad of ['123', '12345', '12a4', '', '1234 5678 9012 3456']) expect(cardInputError({ ...ok, lastDigits: bad }), bad).toBe('final_invalido');
    expect(cardInputError({ ...ok, closingDay: 0 })).toBe('dia_de_fechamento_invalido');
    expect(cardInputError({ ...ok, closingDay: 32 })).toBe('dia_de_fechamento_invalido');
    expect(cardInputError({ ...ok, closingDay: 1.5 })).toBe('dia_de_fechamento_invalido');
    expect(cardInputError({ ...ok, dueDay: 0 })).toBe('dia_de_vencimento_invalido');
    expect(cardInputError({ ...ok, dueDay: 31 })).toBeNull();
    expect(cardInputError({ ...ok, limitCents: 99 })).toBe('limite_invalido');
    expect(cardInputError({ ...ok, limitCents: 100 })).toBeNull();
    expect(cardInputError({ ...ok, limitCents: 999_999_999 })).toBeNull();
    expect(cardInputError({ ...ok, limitCents: 1_000_000_000 })).toBe('limite_invalido');
    // Ordem: o primeiro erro.
    expect(cardInputError({ name: '', lastDigits: 'x', closingDay: 0, dueDay: 0, limitCents: 1 })).toBe('apelido_invalido');
    expect(cardInputError({ ...ok, lastDigits: 'x', closingDay: 0 })).toBe('final_invalido');
    expect(cardInputError({ ...ok, closingDay: 0, dueDay: 0 })).toBe('dia_de_fechamento_invalido');
  });

  const purchase = { description: 'Tênis', category: 'Lazer', purchasedOn: '2026-10-05', totalCents: 60_000, installments: 3 };

  it('compra: valor, descrição, categoria, parcelas e data', () => {
    expect(cardPurchaseError(purchase, TODAY)).toBeNull();
    expect(cardPurchaseError({ ...purchase, totalCents: 0 }, TODAY)).toBe('valor_invalido');
    expect(cardPurchaseError({ ...purchase, totalCents: 1_000_000_000 }, TODAY)).toBe('valor_acima_do_limite');
    expect(cardPurchaseError({ ...purchase, description: '' }, TODAY)).toBe('descricao_obrigatoria');
    expect(cardPurchaseError({ ...purchase, description: 'x'.repeat(81) }, TODAY)).toBe('descricao_longa');
    expect(cardPurchaseError({ ...purchase, category: 'x'.repeat(41) }, TODAY)).toBe('categoria_invalida');
    expect(cardPurchaseError({ ...purchase, installments: 0 }, TODAY)).toBe('parcelas_invalidas');
    expect(cardPurchaseError({ ...purchase, installments: 49 }, TODAY)).toBe('parcelas_invalidas');
    expect(cardPurchaseError({ ...purchase, installments: 48 }, TODAY)).toBeNull();
    // Cada parcela precisa de pelo menos 1 centavo.
    expect(cardPurchaseError({ ...purchase, totalCents: 47, installments: 48 }, TODAY)).toBe('parcelas_invalidas');
    expect(cardPurchaseError({ ...purchase, totalCents: 48, installments: 48 }, TODAY)).toBeNull();
    expect(cardPurchaseError({ ...purchase, purchasedOn: '2026-02-31' }, TODAY)).toBe('data_invalida');
    expect(cardPurchaseError({ ...purchase, purchasedOn: '' }, TODAY)).toBe('data_invalida');
    expect(cardPurchaseError({ ...purchase, purchasedOn: '2022-09-30' }, TODAY)).toBe('data_invalida');
    expect(cardPurchaseError({ ...purchase, purchasedOn: '2022-10-01' }, TODAY)).toBeNull();
    // A data só é conferida no intervalo quando é nova (checkRange); na edição sem mudar a data, não.
    expect(cardPurchaseError({ ...purchase, purchasedOn: '2022-09-30' }, TODAY, false)).toBeNull();
    expect(cardPurchaseError({ ...purchase, purchasedOn: '2026-10-08' }, TODAY)).toBe('data_futura');
    expect(cardPurchaseError({ ...purchase, purchasedOn: TODAY }, TODAY)).toBeNull();
    // Ordem de clarevo_validate_purchase: valor, descrição, categoria, parcelas e por último a data (inválida ou antiga, futura).
    expect(cardPurchaseError({ ...purchase, totalCents: 0, description: '' }, TODAY)).toBe('valor_invalido');
    expect(cardPurchaseError({ ...purchase, description: '', installments: 0 }, TODAY)).toBe('descricao_obrigatoria');
    expect(cardPurchaseError({ ...purchase, installments: 0, purchasedOn: '2026-10-08' }, TODAY)).toBe('parcelas_invalidas');
    expect(cardPurchaseError({ ...purchase, purchasedOn: '2026-10-08' }, TODAY)).toBe('data_futura');
    expect(cardPurchaseError({ ...purchase, purchasedOn: '2020-01-01' }, TODAY)).toBe('data_invalida');
  });

  it('encargo, estorno, mês da fatura e pagamento', () => {
    expect(cardChargeError({ chargeType: 'juros', amountCents: 1_200, invoiceMonth: NOV }, TODAY)).toBeNull();
    for (const t of ['juros', 'multa', 'iof', 'anuidade', 'tarifa'] as const) expect(cardChargeError({ chargeType: t, amountCents: 1, invoiceMonth: NOV }, TODAY)).toBeNull();
    expect(cardChargeError({ chargeType: 'cashback' as never, amountCents: 100, invoiceMonth: NOV }, TODAY)).toBe('tipo_de_encargo_invalido');
    expect(cardChargeError({ chargeType: 'juros', amountCents: 0, invoiceMonth: NOV }, TODAY)).toBe('valor_invalido');
    expect(cardChargeError({ chargeType: 'juros', amountCents: 1_000_000_000, invoiceMonth: NOV }, TODAY)).toBe('valor_acima_do_limite');
    expect(cardChargeError({ chargeType: 'juros', amountCents: 100, invoiceMonth: '2026-13' }, TODAY)).toBe('mes_invalido');
    // Tipo e valor vêm antes da fatura.
    expect(cardChargeError({ chargeType: 'x' as never, amountCents: 0, invoiceMonth: '2026-13' }, TODAY)).toBe('tipo_de_encargo_invalido');
    expect(cardChargeError({ chargeType: 'juros', amountCents: 0, invoiceMonth: '2026-13' }, TODAY)).toBe('valor_invalido');
    expect(invoiceMonthError('2022-10', TODAY)).toBeNull();
    expect(invoiceMonthError('2022-09', TODAY)).toBe('mes_invalido');
    expect(invoiceMonthError('2030-10', TODAY)).toBeNull();
    expect(invoiceMonthError('2030-11', TODAY)).toBe('mes_invalido');
    expect(invoiceMonthError('2022-09', TODAY, false)).toBeNull();
    const refund = { description: 'Estorno do tênis', category: 'Lazer', amountCents: 5_000, invoiceMonth: NOV };
    expect(cardRefundError(refund, TODAY)).toBeNull();
    expect(cardRefundError({ ...refund, amountCents: 0 }, TODAY)).toBe('valor_invalido');
    expect(cardRefundError({ ...refund, description: '' }, TODAY)).toBe('descricao_obrigatoria');
    expect(cardRefundError({ ...refund, invoiceMonth: '' }, TODAY)).toBe('mes_invalido');
    expect(cardRefundError({ ...refund, invoiceMonth: '2031-01', amountCents: 0 }, TODAY)).toBe('valor_invalido');
    expect(cardRefundError({ ...refund, invoiceMonth: '2031-01' }, TODAY)).toBe('mes_invalido');
    const pay = { amountCents: 30_000, totalCents: 53_000, paidOn: '2026-11-08' };
    expect(invoicePaymentError(pay, '2026-11-08')).toBeNull();
    expect(invoicePaymentError({ ...pay, amountCents: 53_000 }, '2026-11-08')).toBeNull();
    expect(invoicePaymentError({ ...pay, amountCents: 0 }, '2026-11-08')).toBe('valor_invalido');
    expect(invoicePaymentError({ ...pay, amountCents: 1 }, '2026-11-08')).toBeNull();
    expect(invoicePaymentError({ ...pay, amountCents: 53_001 }, '2026-11-08')).toBe('valor_acima_da_fatura');
    expect(invoicePaymentError({ ...pay, paidOn: '2026-11-09' }, '2026-11-08')).toBe('data_futura');
    expect(invoicePaymentError({ ...pay, paidOn: '2025-11-08' }, '2026-11-08')).toBeNull();
    expect(invoicePaymentError({ ...pay, paidOn: '2025-11-07' }, '2026-11-08')).toBe('data_invalida');
    expect(invoicePaymentError({ ...pay, paidOn: '2026-02-30' }, '2026-11-08')).toBe('data_invalida');
    // Valor antes de data.
    expect(invoicePaymentError({ ...pay, amountCents: 60_000, paidOn: '2027-01-01' }, '2026-11-08')).toBe('valor_acima_da_fatura');
    expect(invoicePaymentError({ ...pay, amountCents: 0, paidOn: '2027-01-01' }, '2026-11-08')).toBe('valor_invalido');
  });

  it('formulários digitados: cartão, compra, pagamento, encargo e estorno', () => {
    const card = validateCardDraft({ name: ' Nubank ', lastDigits: '0042', closingDay: '3', dueDay: '10', limitText: '5.000,00' });
    expect(card).toEqual({ ok: true, input: { name: 'Nubank', lastDigits: '0042', closingDay: 3, dueDay: 10, limitCents: 500_000 } });
    expect(validateCardDraft({ name: 'Mercado', lastDigits: '', closingDay: '25', dueDay: '5', limitText: '' })).toEqual({
      ok: true,
      input: { name: 'Mercado', lastDigits: null, closingDay: 25, dueDay: 5, limitCents: null },
    });
    const bad = validateCardDraft({ name: '', lastDigits: '1234 5678 9012 3456', closingDay: '0', dueDay: 'x', limitText: '0,50' });
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.code).toBe('apelido_invalido');
      expect(Object.keys(bad.errors)).toEqual(['name', 'lastDigits', 'closingDay', 'dueDay', 'limitText']);
      expect(bad.errors.lastDigits).toBe(CARD_ERROR_TEXT.final_invalido);
    }
    const p = validateCardPurchaseDraft({ description: ' Tênis ', amountText: '600,00', dateText: '05/10/2026', category: 'Lazer', installmentsText: '3' }, TODAY);
    expect(p).toEqual({ ok: true, input: { description: 'Tênis', category: 'Lazer', purchasedOn: '2026-10-05', totalCents: 60_000, installments: 3 } });
    const one = validateCardPurchaseDraft({ description: 'Pão', amountText: '8,50', dateText: '07/10/2026', category: null, installmentsText: '' }, TODAY);
    expect(one.ok && one.input.installments).toBe(1);
    const badP = validateCardPurchaseDraft({ description: 'Pão', amountText: '8,50', dateText: '08/10/2026', category: null, installmentsText: '49' }, TODAY);
    expect(badP.ok).toBe(false);
    if (!badP.ok) expect([badP.code, Object.keys(badP.errors)]).toEqual(['parcelas_invalidas', ['installmentsText']]);
    const future = validateCardPurchaseDraft({ description: 'Pão', amountText: '8,50', dateText: '08/10/2026', category: null, installmentsText: '1' }, TODAY);
    expect(future.ok === false && [future.code, Object.keys(future.errors)]).toEqual(['data_futura', ['dateText']]);
    const old = validateCardPurchaseDraft({ description: 'Pão', amountText: '8,50', dateText: '06/09/2022', category: null, installmentsText: '1' }, TODAY);
    expect(old.ok === false && old.code).toBe('data_invalida');
    const invoice = { totalCents: 53_000, periodStartOn: '2026-10-04' };
    expect(validateInvoicePaymentDraft({ mode: 'total', amountText: '', dateText: '08/11/2026' }, invoice, '2026-11-08')).toEqual({
      ok: true,
      amountCents: 53_000,
      paidOn: '2026-11-08',
      partial: false,
    });
    expect(validateInvoicePaymentDraft({ mode: 'outro', amountText: '300,00', dateText: '08/11/2026' }, invoice, '2026-11-08')).toEqual({
      ok: true,
      amountCents: 30_000,
      paidOn: '2026-11-08',
      partial: true,
    });
    const over = validateInvoicePaymentDraft({ mode: 'outro', amountText: '530,01', dateText: '08/11/2026' }, invoice, '2026-11-08');
    expect(over.ok === false && over.code).toBe('valor_acima_da_fatura');
    const late = validateInvoicePaymentDraft({ mode: 'outro', amountText: '10,00', dateText: '09/11/2026' }, invoice, '2026-11-08');
    expect(late.ok === false && late.code).toBe('data_futura');
    expect(validateCardChargeDraft({ chargeType: 'juros', amountText: '12,00' }, NOV, TODAY)).toEqual({
      ok: true,
      input: { chargeType: 'juros', amountCents: 1_200, invoiceMonth: NOV },
    });
    const noType = validateCardChargeDraft({ chargeType: null, amountText: '12,00' }, NOV, TODAY);
    expect(noType.ok === false && noType.code).toBe('tipo_de_encargo_invalido');
    expect(validateCardRefundDraft({ description: ' Estorno ', amountText: '50,00', category: 'Lazer' }, NOV, TODAY)).toEqual({
      ok: true,
      input: { description: 'Estorno', category: 'Lazer', amountCents: 5_000, invoiceMonth: NOV },
    });
    const noDesc = validateCardRefundDraft({ description: ' ', amountText: '50,00', category: null }, NOV, TODAY);
    expect(noDesc.ok === false && noDesc.code).toBe('descricao_obrigatoria');
  });
});

// ---------------------------------------------------------------------------
// 4. Composição, total, situação e limite
// ---------------------------------------------------------------------------

describe('fatura: composição, total e situação', () => {
  it('Cartão Exemplo da demonstração: novembro 550,00 (aberta e estimada), dezembro e janeiro 350,00, fevereiro a agosto 150,00; limite usado 2.300,00', async () => {
    const repo = await createDemoRepository();
    const ctx = (await repo.getSpace())!.personalContextId;
    const [card] = await repo.listCards(ctx);
    expect(card).toMatchObject({ name: 'Cartão Exemplo', lastDigits: '1234', closingDay: 3, dueDay: 10, limitCents: 500_000, status: 'ativo' });
    expect(cardTitle(card!)).toBe('Cartão Exemplo · final 1234');
    const invoices = await loadInvoices(repo, card!, DEMO_TODAY);
    expect(invoices.map((i) => [i.month, i.totalCents, i.situation])).toEqual([
      ['2026-11', 55_000, 'aberta'],
      ['2026-12', 35_000, 'aberta'],
      ['2027-01', 35_000, 'aberta'],
      ['2027-02', 15_000, 'aberta'],
      ['2027-03', 15_000, 'aberta'],
      ['2027-04', 15_000, 'aberta'],
      ['2027-05', 15_000, 'aberta'],
      ['2027-06', 15_000, 'aberta'],
      ['2027-07', 15_000, 'aberta'],
      ['2027-08', 15_000, 'aberta'],
    ]);
    const nov = invoices[0]!;
    expect([nov.closingOn, nov.dueOn, nov.periodStartOn, nov.periodEndOn, nov.estimated, nov.isFuture]).toEqual(['2026-11-03', '2026-11-10', '2026-10-04', '2026-11-03', true, false]);
    expect(nov.lines.map((l) => invoiceLineText(l))).toEqual([
      'Tênis de corrida · parcela 1 de 3 · R$ 200,00',
      'Notebook · parcela 1 de 10 · R$ 150,00',
      'Restaurante · R$ 200,00',
    ]);
    expect(nov.mix).toEqual([
      { category: 'Lazer', charges: false, cents: 40_000 },
      { category: 'Educação', charges: false, cents: 15_000 },
    ]);
    expect(cardLimitUsed(invoices)).toBe(230_000);
    const summary = summarizeCard(card!, invoices, DEMO_TODAY);
    expect([summary.current.month, summary.limitUsedCents, summary.limitLeftCents, summary.closedUnpaid.length]).toEqual([NOV, 230_000, 270_000, 0]);
    expect(limitUsedText(summary.limitUsedCents, card!.limitCents)).toBe('Limite usado: R$ 2.300,00 de R$ 5.000,00');
    expect(limitUsedText(230_000, null)).toBe('Limite usado: R$ 2.300,00');
    const texts = cardSummaryTexts(summary, DEMO_TODAY);
    expect(texts).toMatchObject({
      title: 'Cartão Exemplo · final 1234',
      invoiceLine: 'Fatura de novembro · R$ 550,00 · Aberta',
      closes: 'Fecha em 03/11',
      due: 'Vence em 10/11',
      limit: 'Limite usado: R$ 2.300,00 de R$ 5.000,00',
      closed: [],
      archived: null,
    });
    const it = invoiceTexts(nov, DEMO_TODAY);
    expect(it).toMatchObject({ title: 'Fatura de novembro', situation: 'Aberta', total: 'R$ 550,00', estimated: CARDS_TEXT.estimatedNote, period: 'Período: 04/10 a 03/11' });
    expect(it.a11yLabel).toBe('Fatura de novembro, aberta, R$ 550,00. Fecha em 03/11. Vence em 10/11.');
  });

  it('as contas a pagar das faturas existem, com o valor da fatura, estimadas enquanto abertas', async () => {
    const repo = await createDemoRepository();
    const ctx = (await repo.getSpace())!.personalContextId;
    const [card] = await repo.listCards(ctx);
    const bills = await repo.listInvoiceCommitments(card!.id);
    expect(bills.map((c) => [c.description, c.dueOn, c.amountCents, c.amountIsEstimate, c.status, c.invoice!.month])).toEqual([
      ['Fatura Cartão Exemplo', '2026-11-10', 55_000, true, 'aberto', '2026-11'],
      ['Fatura Cartão Exemplo', '2026-12-10', 35_000, true, 'aberto', '2026-12'],
      ['Fatura Cartão Exemplo', '2027-01-10', 35_000, true, 'aberto', '2027-01'],
      ...['2027-02', '2027-03', '2027-04', '2027-05', '2027-06', '2027-07', '2027-08'].map(
        (m) => ['Fatura Cartão Exemplo', `${m}-10`, 15_000, true, 'aberto', m] as const,
      ),
    ]);
    expect(bills.every((c) => c.invoice!.cardId === card!.id && c.category === null && c.series === null && c.payment === null)).toBe(true);
    expect(bills.every(isInvoiceCommitment)).toBe(true);
    expect(invoiceCommitmentDescription('Nubank')).toBe('Fatura Nubank');
    repo.checkInvariants();
  });

  it('situação: aberta até o dia do fechamento (inclusive), fechada depois; "estimado" some com o fechamento', async () => {
    const f = await fresh('2026-10-07');
    await f.purchase('Tênis', 60_000, '2026-10-05', 3, 'Lazer');
    f.clock.today = '2026-11-03';
    expect((await f.invoice(NOV)).situation).toBe('aberta');
    let bill = (await f.repo.listInvoiceCommitments(f.cardId))[0]!;
    expect(bill.amountIsEstimate).toBe(true);
    expect(closesText('2026-11-03', f.clock.today)).toBe('Fecha hoje');
    f.clock.today = '2026-11-04';
    expect((await f.invoice(NOV)).situation).toBe('fechada');
    // O dia do fechamento passa sem gravação: a leitura já calcula "estimado" na hora (falso), como a visão do banco. A marca
    // gravada fica velha e nada a lê; abrir o app (sincronizar) não mexe na conta da fatura nem na versão dela.
    bill = (await f.repo.listInvoiceCommitments(f.cardId))[0]!;
    expect([bill.amountIsEstimate, bill.amountCents, bill.status, bill.version]).toEqual([false, 20_000, 'aberto', 1]);
    expect((await f.repo.listInvoiceItems(f.cardId)).find((i) => i.month === NOV)).toMatchObject({ status: 'fechada', amountIsEstimate: false });
    expect((await f.repo.listCommitments(f.ctx, NOV)).find((c) => c.invoice)!.amountIsEstimate).toBe(false);
    await f.repo.syncSeriesOccurrences(f.ctx);
    bill = (await f.repo.listInvoiceCommitments(f.cardId))[0]!;
    expect([bill.amountIsEstimate, bill.amountCents, bill.status, bill.version]).toEqual([false, 20_000, 'aberto', 1]);
    await f.repo.syncSeriesOccurrences(f.ctx);
    expect((await f.repo.listInvoiceCommitments(f.cardId))[0]!.version).toBe(1);
    // O valor muda com um novo lançamento mesmo depois do fechamento.
    await f.repo.addCardCharge(key(), f.cardId, { chargeType: 'anuidade', amountCents: 3_000, invoiceMonth: NOV });
    expect((await f.repo.listInvoiceCommitments(f.cardId))[0]!.amountCents).toBe(23_000);
    expect((await f.repo.listInvoiceCommitments(f.cardId))[1]!.amountIsEstimate).toBe(true);
    expect(closesText('2026-11-03', f.clock.today)).toBe('Fechou em 03/11');
    expect(dueTextOf('2026-11-10', f.clock.today)).toBe('Vence em 10/11');
    expect(dueTextOf('2026-11-10', '2026-11-10')).toBe('Vence hoje');
    expect(dueTextOf('2026-11-10', '2026-11-11')).toBe('Venceu em 10/11');
    const summary = summarizeCard((await f.repo.getCard(f.cardId))!, await f.invoices(), f.clock.today);
    expect(summary.closedUnpaid.map((i) => i.month)).toEqual([NOV]);
    expect(cardSummaryTexts(summary, f.clock.today).closed).toEqual(['Fatura fechada de novembro: R$ 230,00. Vence em 10/11']);
    f.repo.checkInvariants();
  });

  it('total = parcelas + encargos + saldo anterior - estornos; fatura vazia para o mês atual de um cartão novo', async () => {
    const f = await fresh();
    const empty = await f.invoice(NOV);
    expect([empty.lines.length, empty.totalCents, empty.situation, empty.commitmentId]).toEqual([0, 0, 'aberta', null]);
    expect(invoiceTexts(empty, TODAY).empty).toBe(CARDS_TEXT.invoiceEmpty);
    await f.purchase('Tênis', 60_000, '2026-10-05', 3, 'Lazer');
    await f.purchase('Mercado', 12_345, '2026-10-06', 1, 'Mercado');
    await f.repo.addCardCharge(key(), f.cardId, { chargeType: 'juros', amountCents: 1_234, invoiceMonth: NOV });
    await f.repo.addCardRefund(key(), f.cardId, { description: 'Devolução', category: 'Mercado', amountCents: 2_000, invoiceMonth: NOV });
    const nov = await f.invoice(NOV);
    expect([nov.installmentsCents, nov.chargesCents, nov.balanceCents, nov.refundsCents, nov.creditInCents]).toEqual([32_345, 1_234, 0, 2_000, 0]);
    expect([nov.rawCents, nov.totalCents, nov.creditOutCents]).toEqual([31_579, 31_579, 0]);
    expect(nov.lines.map(invoiceLineText)).toEqual([
      'Tênis · parcela 1 de 3 · R$ 200,00',
      'Mercado · R$ 123,45',
      'Juros · R$ 12,34',
      'Devolução · − R$ 20,00',
    ]);
    expect((await f.repo.listInvoiceCommitments(f.cardId))[0]!.amountCents).toBe(31_579);
  });

  it('total negativo: crédito levado para a fatura seguinte como estorno, sem conta a pagar na fatura sem total', async () => {
    const f = await fresh();
    await f.purchase('Camiseta', 10_000, '2026-10-05', 1, 'Lazer'); // novembro
    await f.purchase('Fone', 20_000, '2026-10-06', 2, 'Lazer'); // novembro 100,00 e dezembro 100,00
    expect((await f.invoice(NOV)).totalCents).toBe(20_000);
    await f.repo.addCardRefund(key(), f.cardId, { description: 'Devolução geral', category: 'Lazer', amountCents: 23_000, invoiceMonth: NOV });
    const nov = await f.invoice(NOV);
    expect([nov.rawCents, nov.totalCents, nov.creditOutCents, nov.commitmentId]).toEqual([-3_000, 0, 3_000, null]);
    expect(invoiceTexts(nov, TODAY).credit).toBe('Crédito de R$ 30,00 para a próxima fatura');
    expect(creditText(3_000)).toBe('Crédito de R$ 30,00 para a próxima fatura');
    const dec = await f.invoice(DEC);
    expect(dec.creditInCents).toBe(3_000);
    expect(dec.lines.map(invoiceLineText)).toEqual(['Crédito da fatura anterior · − R$ 30,00', 'Fone · parcela 2 de 2 · R$ 100,00']);
    expect([dec.totalCents, dec.creditOutCents]).toEqual([7_000, 0]);
    const bills = await f.repo.listInvoiceCommitments(f.cardId);
    expect(bills.map((c) => [c.invoice!.month, c.amountCents])).toEqual([[DEC, 7_000]]);
    // O estorno automático é um lançamento gravado, com a fatura de origem, que a pessoa não edita nem exclui.
    const auto = (await f.repo.listCardEntries(f.cardId)).find((e) => e.kind === 'estorno' && e.sourceMonth !== null)!;
    expect(auto).toMatchObject({ invoiceMonth: DEC, sourceMonth: NOV, amountCents: 3_000, description: null, category: null, version: 1 });
    await expectCode(f.repo.deleteCardEntry(key(), auto.id, auto.version), 'lancamento_automatico');
    await expectCode(
      f.repo.updateCardEntry(key(), auto.id, auto.version, { kind: 'estorno', description: 'x', category: null, amountCents: 100, invoiceMonth: DEC }),
      'lancamento_automatico',
    );
    f.repo.checkInvariants();
  });

  it('crédito em cadeia: um estorno grande passa por duas faturas e desaparece quando o estorno é excluído', async () => {
    const f = await fresh();
    await f.purchase('Notebook', 45_000, '2026-10-05', 3, 'Educação'); // novembro, dezembro e janeiro: 150,00 cada
    const refund = await f.repo.addCardRefund(key(), f.cardId, { description: 'Devolução', category: 'Educação', amountCents: 40_000, invoiceMonth: NOV });
    const [nov, dec, jan] = [await f.invoice(NOV), await f.invoice(DEC), await f.invoice('2027-01')];
    expect([nov.rawCents, nov.totalCents, nov.creditOutCents]).toEqual([-25_000, 0, 25_000]);
    expect([dec.creditInCents, dec.rawCents, dec.totalCents, dec.creditOutCents]).toEqual([25_000, -10_000, 0, 10_000]);
    expect([jan.creditInCents, jan.rawCents, jan.totalCents, jan.creditOutCents]).toEqual([10_000, 5_000, 5_000, 0]);
    expect((await f.repo.listInvoiceCommitments(f.cardId)).map((c) => [c.invoice!.month, c.amountCents])).toEqual([['2027-01', 5_000]]);
    const autos = (await f.repo.listCardEntries(f.cardId)).filter((e) => e.sourceMonth !== null);
    expect(autos.map((e) => [e.sourceMonth, e.invoiceMonth, e.amountCents])).toEqual([
      [NOV, DEC, 25_000],
      [DEC, '2027-01', 10_000],
    ]);
    expect(dec.lines.map(invoiceLineText)).toEqual(['Crédito da fatura anterior · − R$ 250,00', 'Notebook · parcela 2 de 3 · R$ 150,00']);
    // Mudar o estorno ajusta a cadeia (versão + 1 nos estornos automáticos); excluir tira tudo.
    await f.repo.updateCardEntry(key(), refund.entry!.id, 1, { kind: 'estorno', description: 'Devolução', category: 'Educação', amountCents: 20_000, invoiceMonth: NOV });
    expect((await f.repo.listInvoiceCommitments(f.cardId)).map((c) => [c.invoice!.month, c.amountCents])).toEqual([
      [DEC, 10_000],
      ['2027-01', 15_000],
    ]);
    const afterEdit = (await f.repo.listCardEntries(f.cardId)).filter((e) => e.sourceMonth !== null);
    expect(afterEdit.map((e) => [e.sourceMonth, e.amountCents, e.version])).toEqual([[NOV, 5_000, 2]]);
    await f.repo.deleteCardEntry(key(), refund.entry!.id, 2);
    expect((await f.repo.listCardEntries(f.cardId)).filter((e) => e.sourceMonth !== null)).toEqual([]);
    expect((await f.repo.listInvoiceCommitments(f.cardId)).map((c) => [c.invoice!.month, c.amountCents])).toEqual([
      [NOV, 15_000],
      [DEC, 15_000],
      ['2027-01', 15_000],
    ]);
    f.repo.checkInvariants();
  });

  it('o crédito levado não muda com mudanças na fatura anterior se a seguinte já foi paga (fatura_seguinte_paga)', async () => {
    const f = await fresh();
    await f.purchase('Fone', 20_000, '2026-10-06', 2, 'Lazer'); // novembro 100, dezembro 100
    const refund = await f.repo.addCardRefund(key(), f.cardId, { description: 'Devolução', category: 'Lazer', amountCents: 13_000, invoiceMonth: NOV });
    expect((await f.invoice(DEC)).totalCents).toBe(7_000);
    f.clock.today = '2026-12-09';
    const dec = await f.invoice(DEC);
    await f.repo.payInvoice(key(), f.cardId, DEC, dec.commitmentVersion!, 7_000, '2026-12-09');
    // O estorno automático de dezembro não pode desaparecer com dezembro já paga.
    await expectCode(f.repo.deleteCardEntry(key(), refund.entry!.id, refund.entry!.version), 'fatura_seguinte_paga');
    await expectCode(f.repo.updateCardEntry(key(), refund.entry!.id, 1, { kind: 'estorno', description: 'x', category: null, amountCents: 12_000, invoiceMonth: NOV }), 'fatura_seguinte_paga');
    expect((await f.invoice(DEC)).situation).toBe('paga');
    f.repo.checkInvariants();
  });
});

// ---------------------------------------------------------------------------
// 5. Pagamento da fatura, parcial e Por categoria
// ---------------------------------------------------------------------------

/** Cartão com a sequência de aceite E: novembro 530,00 (Lazer 350, Educação 150, anuidade 30), dezembro 350,00. */
async function sequence() {
  const f = await fresh('2026-10-07');
  await f.purchase('Tênis de corrida', 60_000, '2026-10-05', 3, 'Lazer');
  await f.purchase('Notebook', 150_000, '2026-10-05', 10, 'Educação');
  await f.purchase('Restaurante', 20_000, '2026-10-06', 1, 'Lazer');
  f.clock.today = '2026-11-04';
  await f.repo.addCardCharge(key(), f.cardId, { chargeType: 'anuidade', amountCents: 3_000, invoiceMonth: NOV });
  await f.repo.addCardRefund(key(), f.cardId, { description: 'Estorno do restaurante', category: 'Lazer', amountCents: 5_000, invoiceMonth: NOV });
  return f;
}

describe('pagar a fatura', () => {
  it('pagamento total: UM gasto na data do pagamento, conta paga, nada em Pago antes disso', async () => {
    const f = await fresh('2026-10-07');
    await f.purchase('Tênis de corrida', 60_000, '2026-10-05', 3, 'Lazer');
    await f.purchase('Restaurante', 20_000, '2026-10-06', 1, 'Lazer');
    // Compras no cartão nunca entram em Pago.
    expect(await f.totals(OCT)).toEqual([0, 0, 0]);
    expect(await f.totals(NOV)).toEqual([0, 0, 0]);
    expect(await f.repo.listRecords(f.ctx, OCT)).toEqual([]);
    f.clock.today = '2026-11-08';
    const nov = await f.invoice(NOV);
    // A conta nasceu com a 1ª compra (versão 1) e subiu com a 2ª.
    expect([nov.totalCents, nov.situation, nov.commitmentVersion]).toEqual([40_000, 'fechada', 2]);
    const key1 = key();
    const paid = await f.repo.payInvoice(key1, f.cardId, NOV, nov.commitmentVersion!, 40_000, '2026-11-08');
    expect(paid.record).toMatchObject({
      kind: 'despesa',
      amountCents: 40_000,
      occurredOn: '2026-11-08',
      description: 'Fatura Nubank (novembro)',
      category: null,
      invoice: { cardId: f.cardId, month: NOV },
      commitmentId: paid.commitment.id,
      accountId: f.accountId,
    });
    expect(paid.commitment).toMatchObject({ status: 'quitado', amountIsEstimate: false, amountCents: 40_000, version: 3 });
    expect(paid.commitment.payment).toMatchObject({ amountCents: 40_000, paidOn: '2026-11-08', recordId: paid.record.id });
    expect(paid.entry).toBeNull();
    expect(invoiceRecordDescription('Nubank', NOV, '2026-11-08')).toBe('Fatura Nubank (novembro)');
    expect(invoiceRecordDescription('Nubank', '2027-01', '2026-12-20')).toBe('Fatura Nubank (janeiro de 2027)');
    expect(isInvoicePayment(paid.record)).toBe(true);
    expect(await f.totals(NOV)).toEqual([0, 40_000, -40_000]);
    expect(await f.totals(OCT)).toEqual([0, 0, 0]);
    expect((await f.invoice(NOV)).situation).toBe('paga');
    // Repetição com a mesma chave: mesmo estado, sem novo gasto.
    const again = await f.repo.payInvoice(key1, f.cardId, NOV, nov.commitmentVersion!, 40_000, '2026-11-08');
    expect(again.record.id).toBe(paid.record.id);
    expect(await f.repo.listRecords(f.ctx, NOV)).toHaveLength(1);
    await expectCode(f.repo.payInvoice(key1, f.cardId, NOV, nov.commitmentVersion!, 39_000, '2026-11-08'), 'chave_reutilizada');
    expect(await f.repo.findCardOperation(key1)).toEqual({
      action: 'pagar_fatura',
      cardId: f.cardId,
      entryId: null,
      commitmentId: paid.commitment.id,
      recordId: paid.record.id,
    });
    expect(await f.repo.findOperation(key1)).toBeNull();
    expect(await f.repo.findCommitmentOperation(key1)).toBeNull();
    f.repo.checkInvariants();
  });

  it('pagamento parcial: 300,00 de 530,00 → saldo anterior de 230,00 em dezembro, sem juros', async () => {
    const f = await sequence();
    const nov = await f.invoice(NOV);
    expect([nov.totalCents, nov.situation]).toEqual([53_000, 'fechada']);
    f.clock.today = '2026-11-08';
    const paid = await f.repo.payInvoice(key(), f.cardId, NOV, nov.commitmentVersion!, 30_000, '2026-11-08');
    expect(paid.record.amountCents).toBe(30_000);
    expect(paid.entry).toMatchObject({ kind: 'saldo_anterior', amountCents: 23_000, invoiceMonth: DEC, installments: 1, version: 1 });
    const after = await f.invoice(NOV);
    expect([after.situation, after.paidCents, after.remainingCents, after.totalCents]).toEqual(['paga_em_parte', 30_000, 23_000, 53_000]);
    const dec = await f.invoice(DEC);
    expect([dec.balanceCents, dec.totalCents]).toEqual([23_000, 58_000]);
    expect(dec.lines[0]).toMatchObject({ kind: 'saldo_anterior', description: 'Saldo anterior', amountCents: 23_000 });
    expect((await f.repo.listInvoiceCommitments(f.cardId)).map((c) => [c.invoice!.month, c.amountCents, c.status])).toEqual([
      [NOV, 53_000, 'quitado'],
      [DEC, 58_000, 'aberto'],
      ['2027-01', 35_000, 'aberto'],
      ...['2027-02', '2027-03', '2027-04', '2027-05', '2027-06', '2027-07', '2027-08'].map((m) => [m, 15_000, 'aberto'] as const),
    ]);
    // Limite usado: a fatura paga em parte sai (o que ficou está no saldo anterior de dezembro, que entra uma vez só).
    expect(cardLimitUsed(await f.invoices())).toBe(580_00 + 350_00 + 7 * 150_00);
    expect((await f.repo.getCard(f.cardId))!.usedCents).toBe(198_000);
    // Pago de novembro é o valor pago, na data do pagamento; o saldo só entra em Pago quando a fatura de dezembro for paga.
    expect(await f.totals(NOV)).toEqual([0, 30_000, -30_000]);
    expect(await f.totals(DEC)).toEqual([0, 0, 0]);
    expect(invoiceTexts(after, f.clock.today).partial).toBe(
      'Ficaram R$ 230,00 para a fatura de dezembro. Juros e encargos do banco entram quando você informar a fatura de dezembro.',
    );
    expect(invoiceTexts(after, f.clock.today).paid).toBe('Pago R$ 300,00 em 08/11/2026');
    // A fatura de dezembro paga por inteiro: o saldo anterior entra em Pago na data desse pagamento.
    f.clock.today = '2026-12-09';
    const dec2 = await f.invoice(DEC);
    await f.repo.payInvoice(key(), f.cardId, DEC, dec2.commitmentVersion!, 58_000, '2026-12-09');
    expect(await f.totals(DEC)).toEqual([0, 58_000, -58_000]);
    expect((await f.invoice(NOV)).situation).toBe('paga_em_parte');
    f.repo.checkInvariants();
  });

  it('desfazer pagamento parcial apaga o gasto e o saldo anterior; com a fatura seguinte paga, fatura_seguinte_paga', async () => {
    const f = await sequence();
    f.clock.today = '2026-11-08';
    const nov = await f.invoice(NOV);
    const paid = await f.repo.payInvoice(key(), f.cardId, NOV, nov.commitmentVersion!, 30_000, '2026-11-08');
    f.clock.today = '2026-12-09';
    const dec = await f.invoice(DEC);
    const decPaid = await f.repo.payInvoice(key(), f.cardId, DEC, dec.commitmentVersion!, 58_000, '2026-12-09');
    await expectCode(f.repo.undoInvoicePayment(key(), f.cardId, NOV, paid.commitment.version), 'fatura_seguinte_paga');
    // A fatura seguinte paga também recusa um pagamento parcial da anterior.
    expect((await f.invoice(NOV)).situation).toBe('paga_em_parte');
    // Desfaz a de dezembro e depois a de novembro.
    const undoDec = await f.repo.undoInvoicePayment(key(), f.cardId, DEC, decPaid.commitment.version);
    expect(undoDec.record.id).toBe(decPaid.record.id);
    expect(undoDec.commitment).toMatchObject({ status: 'aberto' });
    expect(undoDec.entry).toBeNull();
    const novNow = await f.invoice(NOV);
    const undoNov = await f.repo.undoInvoicePayment(key(), f.cardId, NOV, novNow.commitmentVersion!);
    expect(undoNov.record.id).toBe(paid.record.id);
    expect(undoNov.entry).toMatchObject({ id: paid.entry!.id, kind: 'saldo_anterior' });
    expect((await f.repo.listCardEntries(f.cardId)).some((e) => e.kind === 'saldo_anterior')).toBe(false);
    expect(await f.totals(NOV)).toEqual([0, 0, 0]);
    expect(await f.totals(DEC)).toEqual([0, 0, 0]);
    expect((await f.invoice(DEC)).totalCents).toBe(35_000);
    expect((await f.repo.listInvoiceCommitments(f.cardId)).map((c) => [c.invoice!.month, c.amountCents, c.status]).slice(0, 2)).toEqual([
      [NOV, 53_000, 'aberto'],
      [DEC, 35_000, 'aberto'],
    ]);
    expect((await f.invoice(NOV)).situation).toBe('fechada');
    f.repo.checkInvariants();
  });

  it('pagar a fatura seguinte antes de pagar parte da anterior: o pagamento parcial é recusado (fatura_seguinte_paga)', async () => {
    const f = await sequence();
    f.clock.today = '2026-12-09';
    const dec = await f.invoice(DEC);
    await f.repo.payInvoice(key(), f.cardId, DEC, dec.commitmentVersion!, 35_000, '2026-12-09');
    const nov = await f.invoice(NOV);
    await expectCode(f.repo.payInvoice(key(), f.cardId, NOV, nov.commitmentVersion!, 30_000, '2026-12-09'), 'fatura_seguinte_paga');
    // O pagamento total da anterior não depende da seguinte.
    const total = await f.repo.payInvoice(key(), f.cardId, NOV, nov.commitmentVersion!, 53_000, '2026-12-09');
    expect(total.entry).toBeNull();
    f.repo.checkInvariants();
  });

  it('validação do pagamento, na ordem: conta, versão, já paga, valor, data', async () => {
    const f = await sequence();
    f.clock.today = '2026-11-08';
    const nov = await f.invoice(NOV);
    const v = nov.commitmentVersion!;
    await expectCode(f.repo.payInvoice(key(), 'cartao-inexistente', NOV, v, 100, '2026-11-08'), 'nao_encontrado');
    await expectCode(f.repo.payInvoice(key(), f.cardId, '2030-01', v, 100, '2026-11-08'), 'nao_encontrado');
    await expectCode(f.repo.payInvoice(key(), f.cardId, '2026-13', v, 100, '2026-11-08'), 'mes_invalido');
    await expectCode(f.repo.payInvoice(key(), f.cardId, NOV, v + 1, 100, '2026-11-08'), 'versao_desatualizada');
    await expectCode(f.repo.payInvoice(key(), f.cardId, NOV, v, 0, '2026-11-08'), 'valor_invalido');
    await expectCode(f.repo.payInvoice(key(), f.cardId, NOV, v, 1.5, '2026-11-08'), 'valor_invalido');
    await expectCode(f.repo.payInvoice(key(), f.cardId, NOV, v, 53_001, '2026-11-08'), 'valor_acima_da_fatura');
    await expectCode(f.repo.payInvoice(key(), f.cardId, NOV, v, 100, '2026-11-09'), 'data_futura');
    await expectCode(f.repo.payInvoice(key(), f.cardId, NOV, v, 100, '2025-11-07'), 'data_invalida');
    await expectCode(f.repo.payInvoice(key(), f.cardId, NOV, v, 100, '2026-11-31'), 'data_invalida');
    await expectCode(f.repo.payInvoice(key(), f.cardId, NOV, v, 100, '2026-11-08', 'conta-inexistente'), 'conta_invalida');
    // Valor antes de data.
    await expectCode(f.repo.payInvoice(key(), f.cardId, NOV, v, 53_001, '2026-11-09'), 'valor_acima_da_fatura');
    await expectCode(f.repo.payInvoice(key(), f.cardId, NOV, v, 0, '2026-11-09'), 'valor_invalido');
    // Nada foi gravado pelas recusas.
    expect(await f.repo.listRecords(f.ctx, NOV)).toEqual([]);
    expect((await f.invoice(NOV)).situation).toBe('fechada');
    const ok = await f.repo.payInvoice(key(), f.cardId, NOV, v, 1, '2026-11-08');
    expect(ok.entry).toMatchObject({ kind: 'saldo_anterior', amountCents: 52_999 });
    await expectCode(f.repo.payInvoice(key(), f.cardId, NOV, ok.commitment.version, 100, '2026-11-08'), 'compromisso_quitado');
    await expectCode(f.repo.undoInvoicePayment(key(), f.cardId, DEC, (await f.invoice(DEC)).commitmentVersion!), 'compromisso_aberto');
    await expectCode(f.repo.undoInvoicePayment(key(), f.cardId, NOV, 1), 'versao_desatualizada');
    f.repo.checkInvariants();
  });

  it('pagamento de R$ 0,01 até o total, e a data de até 1 ano atrás', async () => {
    const f = await fresh('2026-10-07');
    await f.purchase('Fone', 10_000, '2026-10-05', 1, 'Lazer');
    f.clock.today = '2026-11-08';
    const nov = await f.invoice(NOV);
    const p = await f.repo.payInvoice(key(), f.cardId, NOV, nov.commitmentVersion!, 1, '2025-11-08');
    expect(p.record).toMatchObject({ amountCents: 1, occurredOn: '2025-11-08' });
    expect(p.entry!.amountCents).toBe(9_999);
    f.repo.checkInvariants();
  });
});

describe('Por categoria com pagamento de fatura', () => {
  it('pagamento parcial de 300,00: Lazer 198,11, Educação 84,91 e Encargos do cartão 16,98 (maior resto, soma igual ao pago)', async () => {
    const f = await sequence();
    const nov = await f.invoice(NOV);
    expect(nov.mix).toEqual([
      { category: 'Lazer', charges: false, cents: 35_000 },
      { category: 'Educação', charges: false, cents: 15_000 },
      { category: null, charges: true, cents: 3_000 },
    ]);
    expect(distributeInvoicePayment(30_000, nov.mix).map((s) => s.cents)).toEqual([19_811, 8_491, 1_698]);
    f.clock.today = '2026-11-08';
    await f.repo.payInvoice(key(), f.cardId, NOV, nov.commitmentVersion!, 30_000, '2026-11-08');
    const records = await f.repo.listRecords(f.ctx, NOV);
    expect(records).toHaveLength(1);
    expect(isInvoicePayment(records[0]!)).toBe(true);
    const invoices = await loadInvoicesOfRecords(f.repo, records, f.clock.today);
    const rows = categoryBreakdown(records, invoices);
    expect(rows.map((r) => [r.label, r.cents, r.percentText])).toEqual([
      ['Lazer', 19_811, '66%'],
      ['Educação', 8_491, '28,3%'],
      ['Encargos do cartão', 1_698, '5,7%'],
    ]);
    expect(rows.reduce((a, r) => a + r.cents, 0)).toBe(30_000);
    expect(rows.reduce((a, r) => a + r.tenths, 0)).toBe(1_000);
    expect(rows[2]!.category).toBe(CARD_CHARGES_CATEGORY);
    expect(rows[2]!.a11yLabel).toBe('Encargos do cartão, R$ 16,98, 5,7% do pago');
    // Sem a fatura na lista, o gasto cai na categoria dele ("Sem categoria").
    expect(categoryBreakdown(records).map((r) => [r.label, r.cents])).toEqual([['Sem categoria', 30_000]]);
    // O saldo anterior herda a composição do que ficou: pagando dezembro por inteiro, a soma por categoria fecha com as compras.
    f.clock.today = '2026-12-09';
    const dec = await f.invoice(DEC);
    expect(dec.mix).toEqual([
      { category: 'Lazer', charges: false, cents: 35_189 },
      { category: 'Educação', charges: false, cents: 21_509 },
      { category: null, charges: true, cents: 1_302 },
    ]);
    expect(dec.mix.reduce((a, m) => a + m.cents, 0)).toBe(dec.totalCents);
    await f.repo.payInvoice(key(), f.cardId, DEC, dec.commitmentVersion!, 58_000, '2026-12-09');
    const decRecords = await f.repo.listRecords(f.ctx, DEC);
    const decRows = categoryBreakdown(decRecords, await loadInvoicesOfRecords(f.repo, decRecords, f.clock.today));
    expect(decRows.map((r) => [r.label, r.cents])).toEqual([
      ['Lazer', 35_189],
      ['Educação', 21_509],
      ['Encargos do cartão', 1_302],
    ]);
    // Fechamento da conta: Lazer pago nas duas faturas = Tênis (parcelas 1 e 2: 400,00) + Restaurante 200,00 - estorno 50,00.
    expect(19_811 + 35_189).toBe(55_000);
    f.repo.checkInvariants();
  });

  it('divisão proporcional pelo maior resto; sem composição, tudo em "Sem categoria"; pagamento negativo é erro', () => {
    const mix = distributeInvoicePayment(10_000, [
      { category: 'Mercado', charges: false, cents: 3_000 },
      { category: 'Lazer', charges: false, cents: 3_000 },
      { category: null, charges: false, cents: 1_000 },
    ]);
    expect(mix.map((s) => s.cents)).toEqual([4_286, 4_286, 1_428]);
    expect(mix.reduce((a, s) => a + s.cents, 0)).toBe(10_000);
    expect(distributeInvoicePayment(10_000, [])).toEqual([{ category: null, charges: false, cents: 10_000 }]);
    expect(distributeInvoicePayment(0, [{ category: 'Lazer', charges: false, cents: 1 }])).toEqual([]);
    expect(() => distributeInvoicePayment(-1, [])).toThrow(RangeError);
  });

  it('estorno com categoria maior que as compras dela: abate as outras categorias', async () => {
    const f = await fresh('2026-11-04');
    await f.purchase('Mercado', 30_000, '2026-10-20', 1, 'Mercado'); // outubro (fecha em 03/10? 20/10 vai para novembro)
    await f.purchase('Fone', 10_000, '2026-10-21', 1, 'Lazer');
    await f.repo.addCardRefund(key(), f.cardId, { description: 'Devolução de roupa', category: 'Lazer', amountCents: 14_000, invoiceMonth: NOV });
    const nov = await f.invoice(NOV);
    expect(nov.totalCents).toBe(26_000);
    // Lazer fica com -40,00: sai da composição e Mercado (único positivo) absorve o abatimento.
    expect(nov.mix).toEqual([{ category: 'Mercado', charges: false, cents: 26_000 }]);
    f.clock.today = '2026-11-08';
    await f.repo.payInvoice(key(), f.cardId, NOV, nov.commitmentVersion!, 26_000, '2026-11-08');
    const records = await f.repo.listRecords(f.ctx, NOV);
    const rows = categoryBreakdown(records, await loadInvoicesOfRecords(f.repo, records, f.clock.today));
    expect(rows.map((r) => [r.label, r.cents])).toEqual([['Mercado', 26_000]]);
  });

  it('mistura gastos comuns e pagamento de fatura na mesma lista; recebimentos ficam de fora', async () => {
    const f = await fresh('2026-10-07');
    f.clock.today = '2026-11-08';
    await f.repo.createRecord(key(), f.ctx, 'despesa', { accountId: f.accountId, amountCents: 10_000, occurredOn: '2026-11-01', description: 'Padaria', category: 'Mercado' });
    await f.repo.createRecord(key(), f.ctx, 'receita', { accountId: f.accountId, amountCents: 500_000, occurredOn: '2026-11-01', description: 'Salário', category: 'Salário' });
    await f.purchase('Tênis', 40_000, '2026-10-05', 1, 'Lazer');
    const nov = await f.invoice(NOV);
    await f.repo.payInvoice(key(), f.cardId, NOV, nov.commitmentVersion!, 40_000, '2026-11-08');
    const records = await f.repo.listRecords(f.ctx, NOV);
    const rows = categoryBreakdown(records, await loadInvoicesOfRecords(f.repo, records, f.clock.today));
    expect(rows.map((r) => [r.label, r.cents])).toEqual([
      ['Lazer', 40_000],
      ['Mercado', 10_000],
    ]);
    const month = summarizeMonth(records, f.ctx, NOV);
    expect([month.receivedCents, month.paidCents]).toEqual([500_000, 50_000]);
  });
});

// ---------------------------------------------------------------------------
// 6. Regras do repositório: conta de fatura, gasto de pagamento, cartões e lançamentos
// ---------------------------------------------------------------------------

describe('MemoryRepository: cartões com as regras do banco', () => {
  it('conta de fatura não é editada, excluída nem paga por update_commitment, delete_commitment, pay_commitment e undo_commitment_payment', async () => {
    const f = await sequence();
    const bill = (await f.repo.listInvoiceCommitments(f.cardId))[0]!;
    const input = { description: 'x', amountCents: 100, dueOn: '2026-11-10', category: null };
    await expectCode(f.repo.updateCommitment(key(), bill.id, bill.version, input), 'conta_de_fatura');
    await expectCode(f.repo.deleteCommitment(key(), bill.id, bill.version), 'conta_de_fatura');
    await expectCode(
      f.repo.payCommitment(key(), bill.id, bill.version, { accountId: f.accountId, amountCents: bill.amountCents, paidOn: '2026-11-04', category: null }),
      'conta_de_fatura',
    );
    await expectCode(f.repo.undoCommitmentPayment(key(), bill.id, bill.version), 'conta_de_fatura');
    // Mesmo com versão errada o motivo é a conta de fatura (a recusa vem logo depois da trava).
    await expectCode(f.repo.deleteCommitment(key(), bill.id, 99), 'conta_de_fatura');
    expect((await f.repo.getCommitment(bill.id))!.version).toBe(bill.version);
    expect(quickPayAction(bill, f.clock.today)).toBeNull();
    expect(quickPayDraft(bill, f.clock.today)).toBeNull();
    // Sem o vínculo da fatura, seria uma conta comum e teria "Já paguei".
    expect(quickPayAction({ ...bill, invoice: null, dueOn: '2026-12-10' }, f.clock.today)).toBe('pagar');
    f.repo.checkInvariants();
  });

  it('gasto do pagamento da fatura não é editado nem excluído por update_record e delete_record', async () => {
    const f = await sequence();
    f.clock.today = '2026-11-08';
    const nov = await f.invoice(NOV);
    const paid = await f.repo.payInvoice(key(), f.cardId, NOV, nov.commitmentVersion!, 53_000, '2026-11-08');
    const r = paid.record;
    await expectCode(
      f.repo.updateRecord(key(), r.id, r.version, { accountId: f.accountId, amountCents: 1, occurredOn: '2026-11-08', description: 'x', category: null }),
      'pagamento_de_fatura',
    );
    await expectCode(f.repo.deleteRecord(key(), r.id, r.version), 'pagamento_de_fatura');
    expect((await f.repo.getRecord(r.id))!.version).toBe(1);
    f.repo.checkInvariants();
  });

  it('cartão: criar, editar, arquivar, reativar e excluir (só sem lançamentos), com versão', async () => {
    const f = await fresh();
    const card = (await f.repo.getCard(f.cardId))!;
    expect(card).toMatchObject({ name: 'Nubank', lastDigits: '1234', closingDay: 3, dueDay: 10, limitCents: 500_000, status: 'ativo', version: 1, createdBy: 'pessoa-teste' });
    await expectCode(f.repo.updateCard(key(), f.cardId, 2, NUBANK), 'versao_desatualizada');
    await expectCode(f.repo.updateCard(key(), f.cardId, 1, { ...NUBANK, name: '' }), 'apelido_invalido');
    const edited = await f.repo.updateCard(key(), f.cardId, 1, { ...NUBANK, name: ' Nubank Roxo ', limitCents: null, lastDigits: null });
    expect(edited.card).toMatchObject({ name: 'Nubank Roxo', limitCents: null, lastDigits: null, version: 2 });
    const archived = await f.repo.setCardStatus(key(), f.cardId, 2, 'arquivado');
    expect(archived.card).toMatchObject({ status: 'arquivado', version: 3 });
    await expectCode(f.purchase('Fone', 10_000, '2026-10-05'), 'cartao_arquivado');
    await expectCode(f.repo.setCardStatus(key(), f.cardId, 3, 'cancelado' as never), 'situacao_invalida');
    // Encargo e estorno em cartão arquivado são aceitos.
    await f.repo.addCardCharge(key(), f.cardId, { chargeType: 'tarifa', amountCents: 500, invoiceMonth: NOV });
    await expectCode(f.repo.deleteCard(key(), f.cardId, 3), 'cartao_com_lancamentos');
    const entry = (await f.repo.listCardEntries(f.cardId))[0]!;
    await f.repo.deleteCardEntry(key(), entry.id, entry.version);
    const reactivated = await f.repo.setCardStatus(key(), f.cardId, 3, 'ativo');
    expect(reactivated.card.status).toBe('ativo');
    const deleted = await f.repo.deleteCard(key(), f.cardId, 4);
    expect(deleted.card.version).toBe(5);
    expect(await f.repo.getCard(f.cardId)).toBeNull();
    expect(await f.repo.listCards(f.ctx)).toEqual([]);
    expect(await f.repo.listCardEntries(f.cardId)).toEqual([]);
    expect(await f.repo.listInvoiceCommitments(f.cardId)).toEqual([]);
    await expectCode(f.repo.updateCard(key(), f.cardId, 5, NUBANK), 'nao_encontrado');
    f.repo.checkInvariants();
  });

  it('o apelido e o vencimento novos chegam às contas de fatura em aberto, mas não às pagas', async () => {
    const f = await sequence();
    f.clock.today = '2026-11-08';
    const nov = await f.invoice(NOV);
    await f.repo.payInvoice(key(), f.cardId, NOV, nov.commitmentVersion!, 53_000, '2026-11-08');
    const card = (await f.repo.getCard(f.cardId))!;
    await f.repo.updateCard(key(), f.cardId, card.version, { ...NUBANK, name: 'Roxinho', dueDay: 15 });
    const bills = await f.repo.listInvoiceCommitments(f.cardId);
    expect([bills[0]!.description, bills[0]!.dueOn, bills[0]!.status]).toEqual(['Fatura Nubank', '2026-11-10', 'quitado']);
    expect([bills[1]!.description, bills[1]!.dueOn, bills[1]!.version]).toEqual(['Fatura Roxinho', '2026-12-15', 3]);
    f.repo.checkInvariants();
  });

  it('20 cartões ativos por contexto: o 21º é recusado e arquivar libera um lugar', async () => {
    const f = await fresh();
    for (let i = 2; i <= 20; i++) await f.repo.createCard(key(), f.ctx, { ...NUBANK, name: `Cartão ${i}` });
    await expectCode(f.repo.createCard(key(), f.ctx, { ...NUBANK, name: 'Cartão 21' }), 'limite_de_cartoes');
    expect(await f.repo.listCards(f.ctx)).toHaveLength(20);
    await f.repo.setCardStatus(key(), f.cardId, 1, 'arquivado');
    const extra = await f.repo.createCard(key(), f.ctx, { ...NUBANK, name: 'Cartão 21' });
    expect(extra.card.status).toBe('ativo');
    await expectCode(f.repo.setCardStatus(key(), f.cardId, 2, 'ativo'), 'limite_de_cartoes');
    expect(await f.repo.listCards(f.ctx)).toHaveLength(21);
    f.repo.checkInvariants();
  });

  it('compra: ordem das validações, idempotência e fatura fixada na gravação', async () => {
    const f = await fresh();
    const base = { description: 'Tênis', category: 'Lazer', purchasedOn: '2026-10-05', totalCents: 60_000, installments: 3 };
    await expectCode(f.repo.addCardPurchase(key(), 'cartao-x', base), 'nao_encontrado');
    await expectCode(f.repo.addCardPurchase(key(), f.cardId, { ...base, totalCents: 0 }), 'valor_invalido');
    await expectCode(f.repo.addCardPurchase(key(), f.cardId, { ...base, description: '   ' }), 'descricao_obrigatoria');
    await expectCode(f.repo.addCardPurchase(key(), f.cardId, { ...base, installments: 49 }), 'parcelas_invalidas');
    await expectCode(f.repo.addCardPurchase(key(), f.cardId, { ...base, purchasedOn: '2026-10-08' }), 'data_futura');
    expect(await f.repo.listCardEntries(f.cardId)).toEqual([]);
    expect(await f.repo.listInvoiceCommitments(f.cardId)).toEqual([]);
    const k = key();
    const first = await f.repo.addCardPurchase(k, f.cardId, { ...base, description: ' Tênis ' });
    expect(first.entry).toMatchObject({ kind: 'compra', description: 'Tênis', amountCents: 60_000, installments: 3, invoiceMonth: NOV, purchasedOn: '2026-10-05', version: 1 });
    const again = await f.repo.addCardPurchase(k, f.cardId, base);
    expect(again.entry!.id).toBe(first.entry!.id);
    expect(await f.repo.listCardEntries(f.cardId)).toHaveLength(1);
    await expectCode(f.repo.addCardPurchase(k, f.cardId, { ...base, totalCents: 60_001 }), 'chave_reutilizada');
    expect(await f.repo.findCardOperation(k)).toEqual({ action: 'criar_compra_cartao', cardId: f.cardId, entryId: first.entry!.id, commitmentId: null, recordId: null });
    // A fatura da 1ª parcela não muda se o cartão trocar os dias; só uma data nova a recalcula.
    const card = (await f.repo.getCard(f.cardId))!;
    await f.repo.updateCard(key(), f.cardId, card.version, { ...NUBANK, closingDay: 20, dueDay: 28 });
    expect((await f.repo.listCardEntries(f.cardId))[0]!.invoiceMonth).toBe(NOV);
    const edited = await f.repo.updateCardEntry(key(), first.entry!.id, 1, { kind: 'compra', ...base, description: 'Tênis novo' });
    expect(edited.entry).toMatchObject({ description: 'Tênis novo', invoiceMonth: NOV, version: 2 });
    const moved = await f.repo.updateCardEntry(key(), first.entry!.id, 2, { kind: 'compra', ...base, purchasedOn: '2026-10-06' });
    expect(moved.entry).toMatchObject({ invoiceMonth: OCT, version: 3 });
    f.repo.checkInvariants();
  });

  it('editar compra muda as parcelas e as contas de fatura (valor, quantidade e até excluir)', async () => {
    const f = await fresh();
    const p = await f.purchase('Tênis', 60_000, '2026-10-05', 3, 'Lazer');
    const e = p.entry!;
    const base = { kind: 'compra' as const, description: 'Tênis', category: 'Lazer', purchasedOn: '2026-10-05', totalCents: 60_000, installments: 3 };
    await expectCode(f.repo.updateCardEntry(key(), e.id, 9, base), 'versao_desatualizada');
    await expectCode(f.repo.updateCardEntry(key(), e.id, 1, { ...base, kind: 'encargo' } as never), 'tipo_invalido');
    await expectCode(f.repo.updateCardEntry(key(), e.id, 1, { ...base, installments: 0 }), 'parcelas_invalidas');
    const two = await f.repo.updateCardEntry(key(), e.id, 1, { ...base, installments: 2, totalCents: 60_001 });
    expect((await f.repo.listInvoiceCommitments(f.cardId)).map((c) => [c.invoice!.month, c.amountCents])).toEqual([
      [NOV, 30_001],
      [DEC, 30_000],
    ]);
    expect(two.invoices.map((i) => [i.month, i.totalCents])).toEqual([
      [NOV, 30_001],
      [DEC, 30_000],
    ]);
    expect(two.commitments.map((c) => [c.invoice!.month, c.amountCents])).toEqual([
      [NOV, 30_001],
      [DEC, 30_000],
    ]);
    const del = await f.repo.deleteCardEntry(key(), e.id, 2);
    expect(del.entry).toMatchObject({ id: e.id, version: 3 });
    expect(await f.repo.listInvoiceCommitments(f.cardId)).toEqual([]);
    await expectCode(f.repo.deleteCardEntry(key(), e.id, 3), 'nao_encontrado');
    f.repo.checkInvariants();
  });

  it('encargo e estorno: editar e excluir; saldo anterior não se altera nem se exclui', async () => {
    const f = await sequence();
    const entries = await f.repo.listCardEntries(f.cardId);
    const charge = entries.find((e) => e.kind === 'encargo')!;
    const refund = entries.find((e) => e.kind === 'estorno')!;
    const edited = await f.repo.updateCardEntry(key(), charge.id, 1, { kind: 'encargo', chargeType: 'juros', amountCents: 4_500, invoiceMonth: NOV });
    expect(edited.entry).toMatchObject({ chargeType: 'juros', amountCents: 4_500, version: 2 });
    expect((await f.invoice(NOV)).totalCents).toBe(54_500);
    const moved = await f.repo.updateCardEntry(key(), refund.id, 1, { kind: 'estorno', description: 'Estorno', category: null, amountCents: 5_000, invoiceMonth: DEC });
    expect(moved.entry).toMatchObject({ invoiceMonth: DEC, category: null });
    expect([(await f.invoice(NOV)).totalCents, (await f.invoice(DEC)).totalCents]).toEqual([59_500, 30_000]);
    f.clock.today = '2026-11-08';
    const nov = await f.invoice(NOV);
    const paid = await f.repo.payInvoice(key(), f.cardId, NOV, nov.commitmentVersion!, 20_000, '2026-11-08');
    const balance = paid.entry!;
    await expectCode(f.repo.deleteCardEntry(key(), balance.id, 1), 'lancamento_automatico');
    await expectCode(f.repo.updateCardEntry(key(), balance.id, 1, { kind: 'encargo', chargeType: 'juros', amountCents: 1, invoiceMonth: DEC }), 'lancamento_automatico');
    // Fatura paga: mudar o total dela é recusado; mudar só a categoria de uma compra dela não muda o total.
    await expectCode(f.repo.deleteCardEntry(key(), charge.id, 2), 'fatura_paga');
    await expectCode(f.repo.addCardCharge(key(), f.cardId, { chargeType: 'multa', amountCents: 100, invoiceMonth: NOV }), 'fatura_paga');
    await expectCode(f.repo.addCardRefund(key(), f.cardId, { description: 'x', category: null, amountCents: 100, invoiceMonth: NOV }), 'fatura_paga');
    await expectCode(f.repo.updateCardEntry(key(), charge.id, 2, { kind: 'encargo', chargeType: 'juros', amountCents: 4_600, invoiceMonth: NOV }), 'fatura_paga');
    const notebook = (await f.repo.listCardEntries(f.cardId)).find((e) => e.description === 'Notebook')!;
    await f.repo.updateCardEntry(key(), notebook.id, notebook.version, {
      kind: 'compra',
      description: 'Notebook',
      category: 'Lazer',
      purchasedOn: '2026-10-05',
      totalCents: 150_000,
      installments: 10,
    });
    expect((await f.invoice(NOV)).totalCents).toBe(59_500);
    // Nada mudou nas recusas.
    expect((await f.repo.listCardEntries(f.cardId)).find((e) => e.id === charge.id)!.version).toBe(2);
    f.repo.checkInvariants();
  });

  it('compra com data no período de uma fatura já paga é recusada (fatura_paga), sem desvio para outra fatura', async () => {
    const f = await fresh('2026-10-07');
    await f.purchase('Tênis', 40_000, '2026-10-05', 1, 'Lazer');
    f.clock.today = '2026-11-08';
    const nov = await f.invoice(NOV);
    await f.repo.payInvoice(key(), f.cardId, NOV, nov.commitmentVersion!, 40_000, '2026-11-08');
    // Hoje é 08/11: novembro fechou em 03/11 e está paga. O banco já cobrou uma compra de 02/11 nela; empurrá-la para dezembro faria
    // a pessoa pagar de novo. Recusa, e nada é gravado.
    await expectCode(f.purchase('Outra', 1_000, '2026-11-02', 1), 'fatura_paga');
    await expectCode(f.purchase('Parcelada', 30_000, '2026-11-02', 3), 'fatura_paga');
    expect(await f.repo.listCardEntries(f.cardId)).toHaveLength(1);
    expect((await f.invoice(NOV)).totalCents).toBe(40_000);
    expect(await f.invoices()).toHaveLength(1);
    // O texto explica o que fazer.
    expect(cardErrorText('fatura_paga', { purchase: true })).toMatch(/^Esta compra é de uma fatura já paga\./);
    expect(cardErrorText('fatura_paga', { purchase: true })).toMatch(/encargo ou ajuste na fatura atual/);
    expect(cardErrorText('fatura_paga')).toBe(CARD_ERROR_TEXT.fatura_paga);
    // Uma compra depois do fechamento vai para a fatura seguinte, que está aberta e não paga.
    const ok = await f.purchase('Depois do fechamento', 1_000, '2026-11-04', 1);
    expect(ok.entry!.invoiceMonth).toBe(DEC);
    // Fatura natural fechada e NÃO paga (outubro) com a parcela seguinte em fatura paga (novembro): a compra em 2 vezes é
    // recusada, sem desvio; em 1 vez ela fica em outubro.
    await expectCode(f.purchase('Esquecida', 500, '2026-09-20', 2), 'fatura_paga');
    expect((await f.purchase('Esquecida', 500, '2026-09-20', 1)).entry!.invoiceMonth).toBe(OCT);
    // Mudar a data para o ciclo de novembro (paga) também é recusado, e nada muda.
    const moved = await f.purchase('Mudar data', 700, '2026-11-04', 1);
    await expectCode(
      f.repo.updateCardEntry(key(), moved.entry!.id, moved.entry!.version, {
        kind: 'compra',
        description: 'Mudar data',
        category: null,
        purchasedOn: '2026-11-02',
        totalCents: 700,
        installments: 1,
      }),
      'fatura_paga',
    );
    expect((await f.repo.listCardEntries(f.cardId)).find((e) => e.id === moved.entry!.id)).toMatchObject({ invoiceMonth: DEC, purchasedOn: '2026-11-04', version: 1 });
    f.repo.checkInvariants();
  });

  it('a fatura só se paga depois do fechamento (fatura_aberta); a data pode ser anterior; as compras vão sempre para a fatura natural', async () => {
    const f = await fresh('2026-10-07');
    const totalOf = async () => (await f.invoices()).reduce((a, i) => a + i.rawCents, 0);
    // Outubro (fechou em 03/10) paga em 07/10; novembro, aberta (fecha em 03/11), não aceita pagamento.
    await f.purchase('Compra de outubro', 2_000, '2026-10-01');
    const oct = await f.invoice(OCT);
    expect(invoiceCanBePaid(oct)).toBe(true);
    await f.repo.payInvoice(key(), f.cardId, OCT, oct.commitmentVersion!, 2_000, '2026-10-07');
    await f.purchase('Mercado', 30_000, '2026-10-05', 1, 'Mercado');
    let nov = await f.invoice(NOV);
    expect([nov.situation, nov.estimated, nov.totalCents]).toEqual(['aberta', true, 30_000]);
    expect(invoiceCanBePaid(nov)).toBe(false);
    const before = await f.repo.listRecords(f.ctx, '2026-10');
    await expectCode(f.repo.payInvoice(key(), f.cardId, NOV, nov.commitmentVersion!, 30_000, '2026-10-07'), 'fatura_aberta');
    await expectCode(f.repo.payInvoice(key(), f.cardId, NOV, nov.commitmentVersion!, 10_000, '2026-10-07'), 'fatura_aberta');
    // A recusa vem logo depois de versão e situação, antes de valor, data e conta; não grava nada.
    await expectCode(f.repo.payInvoice(key(), f.cardId, NOV, nov.commitmentVersion!, 0, '2030-01-01', 'conta-inexistente'), 'fatura_aberta');
    await expectCode(f.repo.payInvoice(key(), f.cardId, NOV, nov.commitmentVersion! + 1, 30_000, '2026-10-07'), 'versao_desatualizada');
    expect(await f.repo.listRecords(f.ctx, '2026-10')).toEqual(before);
    expect(await f.invoice(NOV)).toEqual(nov);
    // Sem desvio: a compra de hoje cai na fatura natural (novembro), com ou sem parcelas.
    expect((await f.purchase('Farmácia', 7_000, '2026-10-07', 1, 'Saúde')).entry!.invoiceMonth).toBe(NOV);
    expect((await f.purchase('Tênis', 9_000, '2026-10-07', 3, 'Lazer')).entry!.invoiceMonth).toBe(NOV);
    expect((await f.invoices()).map((i) => [i.month, i.totalCents])).toEqual([[OCT, 2_000], [NOV, 40_000], [DEC, 3_000], ['2027-01', 3_000]]);
    expect(await totalOf()).toBe(2_000 + 30_000 + 7_000 + 9_000);
    // Só os pagamentos entram em Pago (as compras no cartão não).
    expect(await f.totals('2026-10')).toEqual([0, 2_000, -2_000]);
    // No dia do fechamento (03/11) a fatura ainda está aberta; no dia seguinte, fechada. A data do pagamento pode ser anterior ao
    // fechamento (quem pagou antes informa o dia em que pagou).
    f.clock.today = '2026-11-03';
    nov = await f.invoice(NOV);
    expect(invoiceCanBePaid(nov)).toBe(false);
    await expectCode(f.repo.payInvoice(key(), f.cardId, NOV, nov.commitmentVersion!, 40_000, '2026-11-02'), 'fatura_aberta');
    f.clock.today = '2026-11-04';
    nov = await f.invoice(NOV);
    expect(nov.situation).toBe('fechada');
    expect(invoiceCanBePaid(nov)).toBe(true);
    const paid = await f.repo.payInvoice(key(), f.cardId, NOV, nov.commitmentVersion!, 40_000, '2026-11-02');
    expect(paid.record.occurredOn).toBe('2026-11-02');
    nov = await f.invoice(NOV);
    expect([nov.situation, nov.estimated, nov.totalCents]).toEqual(['paga', false, 40_000]);
    expect(invoiceCanBePaid(nov)).toBe(false);
    // A compra do ciclo de novembro (data até 03/11), agora numa fatura paga, é recusada; a de 04/11 vai para dezembro.
    await expectCode(f.purchase('Esquecida de novembro', 1_000, '2026-11-02'), 'fatura_paga');
    const cafe = await f.purchase('Café', 500, '2026-11-04');
    expect(cafe.entry!.invoiceMonth).toBe(DEC);
    // Mudar a data para o ciclo de outubro ou de novembro (pagas) é recusado.
    const cafeInput = { kind: 'compra' as const, description: 'Café', category: null, totalCents: 500, installments: 1 };
    await expectCode(f.repo.updateCardEntry(key(), cafe.entry!.id, cafe.entry!.version, { ...cafeInput, purchasedOn: '2026-10-02' }), 'fatura_paga');
    await expectCode(f.repo.updateCardEntry(key(), cafe.entry!.id, cafe.entry!.version, { ...cafeInput, purchasedOn: '2026-11-02' }), 'fatura_paga');
    expect((await f.repo.listCardEntries(f.cardId)).find((e) => e.id === cafe.entry!.id)).toMatchObject({ invoiceMonth: DEC, purchasedOn: '2026-11-04', version: 1 });
    // Desfazer o pagamento reabre o ciclo (fechada, não paga): a compra com data nele volta a ser aceita.
    await f.repo.undoInvoicePayment(key(), f.cardId, NOV, (await f.invoice(NOV)).commitmentVersion!);
    expect((await f.purchase('Esquecida de novembro', 1_000, '2026-11-02')).entry!.invoiceMonth).toBe(NOV);
    f.repo.checkInvariants();
  });

  it('mudar os dias do cartão com fatura paga no período de hoje ou depois é recusado (dias_com_fatura_paga); a "Fatura atual" nunca é paga', async () => {
    const f = await fresh('2026-10-07');
    await f.purchase('Tênis', 40_000, '2026-10-05', 2, 'Lazer');
    f.clock.today = '2026-11-04';
    const nov = await f.invoice(NOV);
    await f.repo.payInvoice(key(), f.cardId, NOV, nov.commitmentVersion!, 20_000, '2026-11-04');
    const card = (await f.repo.getCard(f.cardId))!;
    // Fecha dia 3: hoje (04/11) é da fatura de dezembro, aberta.
    expect(summarizeCard(card, await f.invoices(), f.clock.today).current.month).toBe(DEC);
    // Fechamento no dia 20: o período de hoje seria o de novembro, que está paga. Recusado, sem gravar nada.
    await expectCode(f.repo.updateCard(key(), f.cardId, card.version, { ...NUBANK, closingDay: 20, dueDay: 25 }), 'dias_com_fatura_paga');
    expect(await f.repo.getCard(f.cardId)).toEqual(card);
    expect(CARD_ERROR_TEXT.dias_com_fatura_paga).toBe(
      'Há uma fatura paga neste período. Para mudar os dias de fechamento e vencimento, desfaça esse pagamento ou espere a próxima fatura.',
    );
    // Dias cujo período de hoje ainda é uma fatura sem pagamento (dezembro) passam, e a atual segue sendo a de dezembro.
    await f.repo.updateCard(key(), f.cardId, card.version, { ...NUBANK, closingDay: 2, dueDay: 9 });
    const moved = (await f.repo.getCard(f.cardId))!;
    expect(invoiceMonthOf(moved, f.clock.today)).toBe(DEC);
    expect(summarizeCard(moved, await f.invoices(), f.clock.today).current.month).toBe(DEC);
    // Só apelido ou limite (sem mudar os dias) continuam livres com fatura paga.
    await f.repo.updateCard(key(), f.cardId, moved.version, { ...NUBANK, name: 'Roxinho', closingDay: 2, dueDay: 9 });
    // Desfeito o pagamento, mudar os dias volta a ser aceito.
    await f.repo.undoInvoicePayment(key(), f.cardId, NOV, (await f.invoice(NOV)).commitmentVersion!);
    const again = (await f.repo.getCard(f.cardId))!;
    await f.repo.updateCard(key(), f.cardId, again.version, { ...NUBANK, closingDay: 20, dueDay: 25 });
    expect(invoiceMonthOf((await f.repo.getCard(f.cardId))!, f.clock.today)).toBe(NOV);
    f.repo.checkInvariants();
  });

  it('pagamento parcial depois do fechamento: o que sobra e as compras seguintes vão para a fatura seguinte; o resto pode ser pago', async () => {
    const f = await fresh('2026-11-04');
    await f.purchase('Reforma', 30_000, '2026-10-05');
    await f.purchase('Compra de setembro', 1_000, '2026-09-20');
    const nov = await f.invoice(NOV);
    const paid = await f.repo.payInvoice(key(), f.cardId, NOV, nov.commitmentVersion!, 20_000, '2026-11-04');
    expect(paid.entry).toMatchObject({ kind: 'saldo_anterior', amountCents: 10_000, invoiceMonth: DEC });
    expect((await f.invoice(NOV)).situation).toBe('paga_em_parte');
    expect((await f.purchase('Depois do pagamento', 5_000, '2026-11-04')).entry!.invoiceMonth).toBe(DEC);
    const dec = await f.invoice(DEC);
    expect([dec.balanceCents, dec.installmentsCents, dec.totalCents]).toEqual([10_000, 5_000, 15_000]);
    // Parcela adiante em fatura paga: em 2 vezes a partir de setembro seriam outubro (fechada, não paga) e novembro (paga em parte).
    await expectCode(f.purchase('Em duas vezes', 2_000, '2026-09-20', 2), 'fatura_paga');
    // Mudar a data para o ciclo de novembro (paga em parte) é recusado; para o de outubro (fechada, não paga), aceito.
    const sep = await f.purchase('Troca de data', 1_000, '2026-11-04');
    expect(sep.entry!.invoiceMonth).toBe(DEC);
    const input = { kind: 'compra' as const, description: 'Troca de data', category: null, totalCents: 1_000, installments: 1 };
    await expectCode(f.repo.updateCardEntry(key(), sep.entry!.id, sep.entry!.version, { ...input, purchasedOn: '2026-10-06' }), 'fatura_paga');
    const moved = await f.repo.updateCardEntry(key(), sep.entry!.id, sep.entry!.version, { ...input, purchasedOn: '2026-09-20' });
    expect(moved.entry).toMatchObject({ invoiceMonth: OCT, purchasedOn: '2026-09-20', version: 2 });
    await f.repo.deleteCardEntry(key(), sep.entry!.id, 2);
    // Dezembro fecha em 03/12: em 04/12 o resto pode ser pago, e os pagamentos somam as compras.
    f.clock.today = '2026-12-04';
    const dec2 = await f.invoice(DEC);
    expect([dec2.balanceCents, dec2.installmentsCents, dec2.totalCents]).toEqual([10_000, 5_000, 15_000]);
    await f.repo.payInvoice(key(), f.cardId, DEC, dec2.commitmentVersion!, 15_000, '2026-12-04');
    const oct = await f.invoice(OCT);
    await f.repo.payInvoice(key(), f.cardId, OCT, oct.commitmentVersion!, 1_000, '2026-12-04');
    const records = [...(await f.repo.listRecords(f.ctx, '2026-11')), ...(await f.repo.listRecords(f.ctx, '2026-12'))].filter((r) => r.invoice);
    expect(records.reduce((a, r) => a + r.amountCents, 0)).toBe(36_000);
    f.repo.checkInvariants();
  });

  it('purchaseFirstInvoiceMonth é sempre a fatura natural; purchaseBlockedByPaidInvoice e purchasePreview dizem quando o banco recusa', () => {
    const card = { name: 'Nubank', closingDay: 3, dueDay: 10 };
    const T = '2026-10-07';
    // Sem desvio: a fatura natural, com ou sem faturas pagas e qualquer que seja o dia de hoje.
    expect(purchaseFirstInvoiceMonth(card, '2026-10-05')).toBe(NOV);
    expect(purchaseFirstInvoiceMonth(card, '2026-10-05', 3, [NOV, DEC], T)).toBe(NOV);
    expect(purchaseFirstInvoiceMonth(card, '2026-10-05', 1, [NOV], '2026-11-04')).toBe(NOV);
    expect(purchaseFirstInvoiceMonth(card, '2026-10-03')).toBe(OCT);
    expect(purchaseFirstInvoiceMonth(card, '2024-10-20')).toBe('2024-11');
    // A primeira parcela, ou qualquer outra, em fatura paga: recusada.
    expect(purchaseBlockedByPaidInvoice(NOV, 1, [])).toBe(false);
    expect(purchaseBlockedByPaidInvoice(NOV, 1, [NOV])).toBe(true);
    expect(purchaseBlockedByPaidInvoice(NOV, 3, [DEC])).toBe(true);
    expect(purchaseBlockedByPaidInvoice(NOV, 1, [DEC])).toBe(false);
    expect(purchaseBlockedByPaidInvoice(NOV, 48, ['2030-10'])).toBe(true);
    expect(purchaseBlockedByPaidInvoice(NOV, 2, ['2026-09', '2027-03'])).toBe(false);
    expect(purchaseBlockedByPaidInvoice(NOV, 2, new Set([DEC, NOV, NOV]))).toBe(true);
    // Prévia do formulário: a fatura, ou o motivo da recusa (o mesmo texto do banco).
    expect(purchasePreview(card, '2026-10-05', 1, [], T)).toEqual({ text: purchaseNotice(NOV, 'Nubank', T), blocked: false });
    expect(purchasePreview(card, '2026-10-05', 1, [NOV], T)).toEqual({ text: CARDS_TEXT.expense.paidInvoicePurchase, blocked: true });
    expect(purchasePreview(card, '2026-10-05', 3, [DEC], T).blocked).toBe(true);
    expect(purchasePreview(card, '2026-10-05', 1, [DEC], T).blocked).toBe(false);
    expect(paidInvoiceMonths([{ month: NOV, situation: 'paga' }, { month: DEC, situation: 'paga_em_parte' }, { month: '2027-01', situation: 'fechada' }, { month: '2027-02', situation: 'aberta' }])).toEqual([NOV, DEC]);
  });

  it('atividade: toda escrita de cartão conta como anotação (como as demais escritas)', async () => {
    const f = await fresh('2026-10-07');
    expect((await f.repo.getReturnReviewState(f.ctx)).activity!.lastWriteOn).toBe('2026-10-07');
    f.clock.today = '2026-12-20';
    await f.repo.addCardCharge(key(), f.cardId, { chargeType: 'tarifa', amountCents: 500, invoiceMonth: '2026-12' });
    const state = await f.repo.getReturnReviewState(f.ctx);
    expect(state.activity).toMatchObject({ lastWriteOn: '2026-12-20', absenceFromOn: '2026-10-07', absenceUntilOn: '2026-12-20' });
  });

  it('falha de rede: antes não grava; depois grava e a mesma chave devolve o resultado, sem duplicar', async () => {
    const f = await fresh();
    const k = key();
    f.repo.failNextWrite = 'antes';
    await expectCode(f.repo.addCardCharge(k, f.cardId, { chargeType: 'juros', amountCents: 500, invoiceMonth: NOV }), 'rede');
    expect(await f.repo.listCardEntries(f.cardId)).toEqual([]);
    expect(await f.repo.findCardOperation(k)).toBeNull();
    f.repo.failNextWrite = 'depois';
    await expectCode(f.repo.addCardCharge(k, f.cardId, { chargeType: 'juros', amountCents: 500, invoiceMonth: NOV }), 'rede');
    const op = await f.repo.findCardOperation(k);
    expect(op).toMatchObject({ action: 'criar_encargo_cartao', cardId: f.cardId });
    const again = await f.repo.addCardCharge(k, f.cardId, { chargeType: 'juros', amountCents: 500, invoiceMonth: NOV });
    expect(again.entry!.id).toBe(op!.entryId);
    expect(await f.repo.listCardEntries(f.cardId)).toHaveLength(1);
    expect(await f.repo.listInvoiceCommitments(f.cardId)).toHaveLength(1);
  });

  it('Pago e Recebido não mudam com compras, encargos, estornos e cartões (só o pagamento da fatura mexe em Pago)', async () => {
    const f = await fresh('2026-10-07');
    await f.repo.createRecord(key(), f.ctx, 'despesa', { accountId: f.accountId, amountCents: 140_000, occurredOn: '2026-10-06', description: 'Mercado', category: 'Mercado' });
    const before = await f.totals(OCT);
    await f.purchase('Tênis', 60_000, '2026-10-05', 3, 'Lazer');
    await f.repo.addCardCharge(key(), f.cardId, { chargeType: 'anuidade', amountCents: 3_000, invoiceMonth: OCT });
    await f.repo.addCardRefund(key(), f.cardId, { description: 'Devolução', category: null, amountCents: 1_000, invoiceMonth: OCT });
    expect(await f.totals(OCT)).toEqual(before);
    expect(await f.totals(NOV)).toEqual([0, 0, 0]);
    // Ainda a pagar: a fatura de outubro (vence 10/10) entra em outubro; a de novembro não.
    const oct = summarizeToPay(await f.repo.listCommitments(f.ctx, OCT), f.ctx, OCT, TODAY);
    expect([oct.toPayCents, oct.items.map((c) => c.description)]).toEqual([2_000, ['Fatura Nubank']]);
    // A fatura de outubro já fechou (03/10): valor fixo, não estimado.
    expect(oct.estimatedCents).toBe(0);
    f.repo.checkInvariants();
  });
});

// ---------------------------------------------------------------------------
// 7. Renda comprometida, lembretes e revisão
// ---------------------------------------------------------------------------

describe('integração: renda comprometida, lembretes e revisão dos últimos meses', () => {
  it('demonstração: outubro igual (52,5%); novembro ganha o grupo "Faturas de cartão" (R$ 550,00) fora de Dívidas', async () => {
    const repo = await createDemoRepository();
    const ctx = (await repo.getSpace())!.personalContextId;
    const refs = await repo.listIncomeReferences(ctx);
    const series = await repo.listSeries(ctx);
    const oct = summarizeCommitted(await repo.listCommitments(ctx, OCT), ctx, OCT, DEMO_TODAY, refs, series);
    expect([oct.committedCents, oct.committedPermille, oct.cardCents, oct.outsideCents]).toEqual([315_000, 525, 0, 285_000]);
    const sOct = summarizeMonth(await repo.listRecords(ctx, OCT), ctx, OCT);
    expect([sOct.receivedCents, sOct.paidCents, sOct.differenceCents]).toEqual([600_000, 390_000, 210_000]);
    expect(summarizeToPay(await repo.listCommitments(ctx, OCT), ctx, OCT, DEMO_TODAY).toPayCents).toBe(65_000);
    const nov = summarizeCommitted(await repo.listCommitments(ctx, NOV), ctx, NOV, DEMO_TODAY, refs, series);
    expect([nov.cardCents, nov.debtCents, nov.committedCents, nov.committedPermille, nov.cardPermille]).toEqual([55_000, 85_000, 438_000, 730, 92]);
    expect(nov.items.faturas.map((c) => c.description)).toEqual(['Fatura Cartão Exemplo']);
    expect(nov.estimatedOpenCents).toBe(18_000 + 55_000);
    expect(committedGroupOf(nov.items.faturas[0]!)).toBe('faturas');
    const t = committedTexts(nov, 600_000);
    expect(t.groups.map((g) => g.line)).toEqual([
      'Gastos fixos · R$ 2.680,00 · 44,7%',
      'Parcelamentos · R$ 850,00 · 14,2%',
      'Faturas de cartão · R$ 550,00 · 9,2%',
      'Outras contas a pagar · R$ 300,00 · 5,0%',
    ]);
    expect(t.invoiceNote).toBe(COMMITTED_TEXT.invoiceNote);
    expect(committedTexts(oct).invoiceNote).toBeNull();
    expect(committedTexts(oct).groups.map((g) => g.label)).not.toContain('Faturas de cartão');
    // Próximos meses: as parcelas futuras do cartão entram mês a mês.
    const months = upcomingCommittedMonths(OCT);
    const p = projectCommitted(series, await repo.listCommitmentsDueBetween(ctx, months[0]!, months[5]!), refs, months, DEMO_TODAY);
    expect(p.months.map((m) => [m.month, m.cardCents])).toEqual([
      ['2026-11', 55_000],
      ['2026-12', 35_000],
      ['2027-01', 35_000],
      ['2027-02', 15_000],
      ['2027-03', 15_000],
      ['2027-04', 15_000],
    ]);
  });

  it('lembretes: a fatura em aberto entra no plano (véspera do vencimento) e a paga sai', async () => {
    const repo = await createDemoRepository();
    const ctx = (await repo.getSpace())!.personalContextId;
    const list = await repo.listCommitments(ctx, OCT);
    const plan = reminderPlan(list, DEMO_TODAY, 9, 40, { nowMinutes: 8 * 60, contextId: ctx });
    expect(plan.find((p) => p.date === '2026-11-09')).toMatchObject({ count: 3 });
    expect(JSON.stringify(plan)).not.toContain('Fatura');
  });

  it('revisão dos últimos meses: conta de fatura vencida e em aberto aparece, sem "Já paguei" nem "Não houve"', async () => {
    const f = await fresh('2026-10-07');
    await f.purchase('Tênis', 40_000, '2026-10-05', 1, 'Lazer');
    f.clock.today = '2026-12-20';
    const bills = await f.repo.listCommitmentsDueBetween(f.ctx, '2026-10', '2026-12');
    const review = buildReturnReview(
      { kind: 'ausencia', anchor: '2026-10-07', returnedOn: null, fromMonth: '2026-10', toMonth: '2026-11', currentMonth: '2026-12', cutBefore: null },
      [],
      bills,
      [],
      f.clock.today,
    );
    const rows = review.months.flatMap((m) => m.rows);
    const row = rows.find((r) => r.description === 'Fatura Nubank')!;
    expect(row).toBeDefined();
    expect(rowActions(row)).toEqual([]);
    expect(batchEligible(row)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 7b. Alinhamento com a migração 0008 (regras que só o banco e o core têm)
// ---------------------------------------------------------------------------

/** Chave de acesso de 44 dígitos com o dígito verificador certo (módulo 11), a partir de 43 dígitos (CNPJ 12.345.678/0001-95, válido). */
function accessKey(base43: string): string {
  let sum = 0;
  for (let i = 0; i < 43; i++) sum += Number(base43[42 - i]) * (2 + (i % 8));
  const r = sum % 11;
  return base43 + String(r === 0 || r === 1 ? 0 : 11 - r);
}
/** Resumo SHA-256 da chave (o que o registro guarda): pelo core, conferido contra o Node. */
function digestOf(raw: string): string {
  const digest = receiptKeyDigest(raw);
  expect(digest, raw).toBe(createHash('sha256').update(raw, 'utf8').digest('hex'));
  return digest!;
}
const RAW_A = accessKey('3326101234567800019565001000000123100000012');
const RAW_B = accessKey('3326101234567800019565001000000124100000013');
const KEY_A = digestOf(RAW_A);
const KEY_B = digestOf(RAW_B);

describe('alinhamento com o banco', () => {
  it('apelido nunca é número de cartão (13 a 19 dígitos seguidos ou em grupos), sem recusar dígitos espalhados; final aparado; final vazio vira nulo', async () => {
    const ok: CardInput = { name: 'Nubank', lastDigits: null, closingDay: 3, dueDay: 10, limitCents: null };
    for (const name of ['4111 1111 1111 1111', '4111-1111-1111-1111', '4111.1111.1111.1111', '4111111111111', 'Cartão 41111111111111111111',
      '4111/1111/1111/1111', '4111_1111_1111_1111', '4111,1111,1111,1111', '4111 1111 1111 111', '4111.1111-1111 1111',
      '3782 822463 10005', '3782-822463-10005', '1234567890123456789', 'final 1234567890123', 'Visa 4111 1111 1111 1111', '2024 4111 1111 1111 1111']) {
      expect(looksLikeCardNumber(name), name).toBe(true);
      expect(cardInputError({ ...ok, name }), name).toBe('apelido_invalido');
    }
    // Dígitos espalhados entre palavras ou em grupos curtos não são número de cartão.
    for (const name of ['Cartão 1234', 'Cartão 2026', '123456789012', 'Nubank 12 meses', 'Loja 1234 / 2026', '12/34/56/78/90/12',
      'Conta 0001 12345678-9', 'Cartão 2024/2025 nº 123456', 'a4111b1111c1111d1111', 'Ag 1234 Conta 123456-7', 'Mercado 2024 2025 2026', 'Loja 12 34 56 78 90 12 34 56']) {
      expect(looksLikeCardNumber(name), name).toBe(false);
      expect(cardInputError({ ...ok, name }), name).toBeNull();
    }
    // A mensagem explica o motivo quando é um número; nos outros casos de apelido inválido, o texto geral.
    expect(cardErrorText('apelido_invalido', { nickname: '4111 1111 1111 1111' })).toBe('Não use o número do cartão no apelido. Use os 4 últimos dígitos no campo próprio.');
    expect(cardErrorText('apelido_invalido', { nickname: '' })).toBe(CARD_ERROR_TEXT.apelido_invalido);
    expect(cardErrorText('apelido_invalido')).toBe(CARD_ERROR_TEXT.apelido_invalido);
    const bad = validateCardDraft({ name: '4111 1111 1111 1111', lastDigits: '', closingDay: '3', dueDay: '10', limitText: '' });
    expect(bad.ok === false && bad.errors.name).toBe(CARDS_TEXT.form.nameHasNumber);
    const empty = validateCardDraft({ name: '', lastDigits: '', closingDay: '3', dueDay: '10', limitText: '' });
    expect(empty.ok === false && empty.errors.name).toBe(CARD_ERROR_TEXT.apelido_invalido);
    const f = await fresh();
    await expectCode(f.repo.createCard(key(), f.ctx, { ...ok, name: '4111 1111 1111 1111' }), 'apelido_invalido');
    await expectCode(f.repo.updateCard(key(), f.cardId, 1, { ...ok, name: '4111111111111111' }), 'apelido_invalido');
    expect(normalizeCardInput({ ...ok, lastDigits: '  ' })).toEqual({ ...ok, lastDigits: null });
    expect(normalizeCardInput({ ...ok, lastDigits: ' 0042 ' }).lastDigits).toBe('0042');
    const c = await f.repo.createCard(key(), f.ctx, { ...ok, name: 'Mercado', lastDigits: ' 0042 ' });
    expect(c.card.lastDigits).toBe('0042');
    await expectCode(f.repo.createCard(key(), f.ctx, { ...ok, name: 'Outro', lastDigits: '1234 5678 9012 3456' }), 'final_invalido');
  });

  it('chave da nota fiscal: dígito verificador, única entre gastos e compras no cartão; detalhe registro= ou compra=', async () => {
    // O registro guarda só o resumo SHA-256 da chave (64 hexadecimais minúsculos); a chave de 44 caracteres é recusada.
    expect(receiptKeyValid(KEY_A)).toBe(true);
    expect(KEY_A).toMatch(/^[0-9a-f]{64}$/);
    expect(receiptKeyValid(RAW_A)).toBe(false);
    expect(receiptKeyValid(KEY_A.toUpperCase())).toBe(false);
    expect(receiptKeyValid(KEY_A.slice(1))).toBe(false);
    expect(receiptKeyValid('123')).toBe(false);
    expect(receiptKeyValid('x'.repeat(44))).toBe(false);
    const f = await fresh();
    const rec = { accountId: f.accountId, amountCents: 8_740, occurredOn: '2026-10-06', description: 'Mercado', category: 'Mercado' };
    await expectCode(f.repo.createRecord(key(), f.ctx, 'despesa', { ...rec, receiptKey: '123' }), 'chave_de_nota_invalida');
    // A chave inteira (44 caracteres, como no QR) nunca é aceita nem guardada: só o resumo.
    await expectCode(f.repo.createRecord(key(), f.ctx, 'despesa', { ...rec, receiptKey: RAW_A }), 'chave_de_nota_invalida');
    await expectCode(f.repo.createRecord(key(), f.ctx, 'despesa', { ...rec, receiptKey: KEY_A.toUpperCase() }), 'chave_de_nota_invalida');
    await expectCode(f.repo.addCardPurchase(key(), f.cardId, { description: 'x', category: null, purchasedOn: '2026-10-06', totalCents: 100, installments: 1, receiptKey: RAW_A }), 'chave_de_nota_invalida');
    expect(await f.repo.findReceipt(f.ctx, KEY_A)).toBeNull();
    await expectCode(f.repo.createRecord(key(), f.ctx, 'receita', { ...rec, receiptKey: KEY_A }), 'chave_de_nota_invalida');
    const r = await f.repo.createRecord(key(), f.ctx, 'despesa', { ...rec, receiptKey: ` ${KEY_A} ` });
    expect(r.receiptKey).toBe(KEY_A);
    expect((await f.repo.createRecord(key(), f.ctx, 'despesa', { ...rec, description: 'Sem nota' })).receiptKey).toBeNull();
    // A mesma nota de novo: gasto ou compra no cartão, recusada com o detalhe do que já existe.
    let error: unknown = null;
    try {
      await f.repo.createRecord(key(), f.ctx, 'despesa', { ...rec, receiptKey: KEY_A });
    } catch (e) {
      error = e;
    }
    expect(isRepoError(error, 'nota_ja_anotada')).toBe(true);
    expect((error as RepoError).detail).toBe(`registro=${r.id}`);
    await expectCode(f.repo.addCardPurchase(key(), f.cardId, { description: 'Mercado', category: 'Mercado', purchasedOn: '2026-10-06', totalCents: 8_740, installments: 1, receiptKey: KEY_A }), 'nota_ja_anotada');
    const bought = await f.repo.addCardPurchase(key(), f.cardId, { description: 'Loja', category: null, purchasedOn: '2026-10-06', totalCents: 30_000, installments: 3, receiptKey: KEY_B });
    expect(bought.entry).toMatchObject({ kind: 'compra', receiptKey: KEY_B, installments: 3 });
    error = null;
    try {
      await f.repo.createRecord(key(), f.ctx, 'despesa', { ...rec, receiptKey: KEY_B });
    } catch (e) {
      error = e;
    }
    expect((error as RepoError).detail).toBe(`compra=${bought.entry!.id}`);
    expect(await f.repo.getCardEntry(bought.entry!.id)).toMatchObject({ id: bought.entry!.id, amountCents: 30_000 });
    await expectCode(f.repo.addCardPurchase(key(), f.cardId, { description: 'x', category: null, purchasedOn: '2026-10-06', totalCents: 100, installments: 1, receiptKey: 'abc' }), 'chave_de_nota_invalida');
    // Excluir libera a chave; editar não troca a chave.
    await f.repo.deleteRecord(key(), r.id, r.version);
    const again = await f.repo.createRecord(key(), f.ctx, 'despesa', { ...rec, receiptKey: KEY_A });
    expect(again.receiptKey).toBe(KEY_A);
    const edited = await f.repo.updateRecord(key(), again.id, 1, { ...rec, description: 'Mercado do mês', receiptKey: KEY_B });
    expect(edited.receiptKey).toBe(KEY_A);
    await f.repo.deleteCardEntry(key(), bought.entry!.id, 1);
    expect((await f.repo.createRecord(key(), f.ctx, 'despesa', { ...rec, description: 'Outra', receiptKey: KEY_B })).receiptKey).toBe(KEY_B);
    // Repetição com a mesma chave de operação devolve o mesmo gasto.
    const k = key();
    const first = await f.repo.createRecord(k, f.ctx, 'despesa', { ...rec, description: 'Padaria', receiptKey: digestOf(accessKey('3326101234567800019565001000000125100000014')) });
    const same = await f.repo.createRecord(k, f.ctx, 'despesa', { ...rec, description: 'Padaria', receiptKey: digestOf(accessKey('3326101234567800019565001000000125100000014')) });
    expect(same.id).toBe(first.id);
    f.repo.checkInvariants();
  });

  it('até 5.000 lançamentos vivos por cartão (cada parcela conta): limite_de_lancamentos', async () => {
    const f = await fresh('2026-10-07', { ...NUBANK, limitCents: null });
    for (let i = 0; i < 104; i++) await f.purchase(`Compra ${i}`, 48_000, '2026-10-05', 48, null);
    expect((await f.repo.listCardEntries(f.cardId)).reduce((a, e) => a + e.installments, 0)).toBe(4_992);
    await expectCode(f.purchase('Mais uma em 48', 48_000, '2026-10-05', 48), 'limite_de_lancamentos');
    // 8 lançamentos ainda cabem; o nono não.
    await f.purchase('Cabe', 8_000, '2026-10-05', 8);
    await expectCode(f.repo.addCardCharge(key(), f.cardId, { chargeType: 'tarifa', amountCents: 500, invoiceMonth: NOV }), 'limite_de_lancamentos');
    // Excluir uma compra abre espaço.
    const entries = await f.repo.listCardEntries(f.cardId);
    await f.repo.deleteCardEntry(key(), entries[0]!.id, entries[0]!.version);
    await f.repo.addCardCharge(key(), f.cardId, { chargeType: 'tarifa', amountCents: 500, invoiceMonth: NOV });
    f.repo.checkInvariants();
  }, 120_000);

  it('crédito sem fatura seguinte com lançamento comum fica parado na própria fatura; um lançamento novo mais adiante o recebe', async () => {
    const f = await fresh();
    await f.purchase('Camiseta', 10_000, '2026-10-05', 1, 'Lazer'); // novembro 100,00
    const refund = await f.repo.addCardRefund(key(), f.cardId, { description: 'Devolução', category: 'Lazer', amountCents: 30_000, invoiceMonth: NOV });
    let nov = await f.invoice(NOV);
    expect([nov.rawCents, nov.totalCents, nov.creditOutCents, nov.commitmentId]).toEqual([-20_000, 0, 20_000, null]);
    expect((await f.repo.listCardEntries(f.cardId)).filter((e) => e.sourceMonth !== null)).toEqual([]);
    expect(await f.repo.listInvoiceCommitments(f.cardId)).toEqual([]);
    // Uma compra parcelada em 2 vezes: novembro 100,00 e dezembro 100,00. O crédito sobra de novembro e vai para dezembro.
    const fone = await f.purchase('Fone', 20_000, '2026-10-06', 2, 'Lazer');
    nov = await f.invoice(NOV);
    const dec = await f.invoice(DEC);
    expect([nov.rawCents, nov.creditOutCents]).toEqual([-10_000, 10_000]);
    expect([dec.creditInCents, dec.rawCents, dec.totalCents]).toEqual([10_000, 0, 0]);
    expect(dec.lines.map(invoiceLineText)).toEqual(['Crédito da fatura anterior · − R$ 100,00', 'Fone · parcela 2 de 2 · R$ 100,00']);
    expect(await f.repo.listInvoiceCommitments(f.cardId)).toEqual([]);
    // Excluir a compra desfaz o encadeamento: o crédito volta a ficar parado em novembro.
    await f.repo.deleteCardEntry(key(), fone.entry!.id, 1);
    expect((await f.repo.listCardEntries(f.cardId)).filter((e) => e.sourceMonth !== null)).toEqual([]);
    nov = await f.invoice(NOV);
    expect([nov.rawCents, nov.creditOutCents]).toEqual([-20_000, 20_000]);
    // Excluir o estorno também: a compra de novembro volta a ser conta a pagar.
    await f.repo.deleteCardEntry(key(), refund.entry!.id, 1);
    expect((await f.repo.listInvoiceCommitments(f.cardId)).map((c) => [c.invoice!.month, c.amountCents])).toEqual([[NOV, 10_000]]);
    f.repo.checkInvariants();
  });

  it('gasto do pagamento da fatura: só a conta de saída e a data mudam (a conta da fatura sobe de versão); valor, descrição e categoria não', async () => {
    const f = await sequence();
    f.clock.today = '2026-11-08';
    const nov = await f.invoice(NOV);
    const paid = await f.repo.payInvoice(key(), f.cardId, NOV, nov.commitmentVersion!, 30_000, '2026-11-08');
    const r = paid.record;
    const same = { accountId: f.accountId, amountCents: 30_000, occurredOn: '2026-11-08', description: r.description, category: null };
    await expectCode(f.repo.updateRecord(key(), r.id, r.version, { ...same, amountCents: 29_999 }), 'pagamento_de_fatura');
    await expectCode(f.repo.updateRecord(key(), r.id, r.version, { ...same, description: 'Outro nome' }), 'pagamento_de_fatura');
    await expectCode(f.repo.updateRecord(key(), r.id, r.version, { ...same, category: 'Lazer' }), 'pagamento_de_fatura');
    await expectCode(f.repo.updateRecord(key(), r.id, 99, same), 'versao_desatualizada');
    const moved = await f.repo.updateRecord(key(), r.id, r.version, { ...same, occurredOn: '2026-11-05' });
    expect([moved.occurredOn, moved.version, moved.invoice]).toEqual(['2026-11-05', 2, { cardId: f.cardId, month: NOV }]);
    expect((await f.repo.getCommitment(paid.commitment.id))!.version).toBe(paid.commitment.version + 1);
    expect(await f.totals(NOV)).toEqual([0, 30_000, -30_000]);
    await expectCode(f.repo.deleteRecord(key(), r.id, 2), 'pagamento_de_fatura');
    f.repo.checkInvariants();
  });

  it('pagar com a conta informada (ou a mais antiga); a conta entra no hash da repetição; cartão arquivado também paga', async () => {
    const f = await fresh('2026-10-07');
    await f.purchase('Fone', 10_000, '2026-10-05', 1, 'Lazer');
    f.clock.today = '2026-11-08';
    const nov = await f.invoice(NOV);
    const k = key();
    const paid = await f.repo.payInvoice(k, f.cardId, NOV, nov.commitmentVersion!, 10_000, '2026-11-08', f.accountId);
    expect(paid.record.accountId).toBe(f.accountId);
    const again = await f.repo.payInvoice(k, f.cardId, NOV, nov.commitmentVersion!, 10_000, '2026-11-08', f.accountId);
    expect(again.record.id).toBe(paid.record.id);
    // Sem a conta no pedido, o conteúdo é outro (hash diferente): a mesma chave é recusada.
    await expectCode(f.repo.payInvoice(k, f.cardId, NOV, nov.commitmentVersion!, 10_000, '2026-11-08'), 'chave_reutilizada');
    expect(paid.invoices.map((i) => [i.month, i.status, i.paidCents, i.leftOverCents, i.toPayCents])).toEqual([[NOV, 'paga', 10_000, 0, 0]]);
    // Cartão arquivado ainda paga a fatura e aceita desfazer.
    await f.repo.setCardStatus(key(), f.cardId, 1, 'arquivado');
    const v = (await f.invoice(NOV)).commitmentVersion!;
    const undone = await f.repo.undoInvoicePayment(key(), f.cardId, NOV, v);
    expect(undone.commitment.status).toBe('aberto');
    const repaid = await f.repo.payInvoice(key(), f.cardId, NOV, undone.commitment.version, 10_000, '2026-11-08');
    expect(repaid.commitment.status).toBe('quitado');
    f.repo.checkInvariants();
  });

  it('fatura de outro ano que o do pagamento leva o ano no nome do gasto', async () => {
    const f = await fresh('2026-10-07');
    await f.purchase('Fone', 30_000, '2026-10-06', 3, 'Lazer'); // novembro, dezembro e janeiro
    f.clock.today = '2027-01-04'; // janeiro fechou em 03/01; quem pagou antes informa o dia do pagamento (20/12)
    const jan = await f.invoice('2027-01');
    const paid = await f.repo.payInvoice(key(), f.cardId, '2027-01', jan.commitmentVersion!, 10_000, '2026-12-20');
    expect(paid.record.description).toBe('Fatura Nubank (janeiro de 2027)');
  });

  it('leituras: getCardEntry, listInvoiceItems e os campos calculados do cartão (limite usado e fatura atual)', async () => {
    const f = await sequence();
    const card = (await f.repo.getCard(f.cardId))!;
    // Tênis 3x e Notebook 10x e Restaurante: 600 + 1500 + 200 = 2300; encargo +30; estorno -50; Nov-Dez-Jan... tudo ainda a pagar.
    expect(card.usedCents).toBe(230_000 + 3_000 - 5_000);
    expect([card.currentMonth, card.currentClosingOn, card.currentDueOn]).toEqual([DEC, '2026-12-03', '2026-12-10']);
    expect((await f.repo.listCards(f.ctx))[0]!.usedCents).toBe(card.usedCents);
    const items = await f.repo.listInvoiceItems(f.cardId);
    expect(items.slice(0, 3).map((i) => [i.month, i.status, i.totalCents, i.purchasesCents, i.chargesCents, i.refundsCents, i.entryCount, i.toPayCents])).toEqual([
      [NOV, 'fechada', 53_000, 55_000, 3_000, 5_000, 5, 53_000],
      [DEC, 'aberta', 35_000, 35_000, 0, 0, 2, 35_000],
      ['2027-01', 'aberta', 35_000, 35_000, 0, 0, 2, 35_000],
    ]);
    expect(items[0]).toMatchObject({ closingOn: '2026-11-03', dueOn: '2026-11-10', creditCents: 0, carriedInCents: 0, paidCents: null, leftOverCents: null, amountIsEstimate: false });
    expect(items[0]!.commitmentId).toBeTruthy();
    // O mesmo conjunto vem de buildInvoices + invoiceItemOf.
    expect((await f.invoices()).map(invoiceItemOf)).toEqual(items);
    const entry = (await f.repo.listCardEntries(f.cardId)).find((e) => e.kind === 'encargo')!;
    expect(await f.repo.getCardEntry(entry.id)).toEqual(entry);
    expect(await f.repo.getCardEntry('lanc-inexistente')).toBeNull();
    expect(await f.repo.listInvoiceItems('cartao-inexistente')).toEqual([]);
  });

  it('o resultado das escritas traz o cartão, o lançamento, as faturas envolvidas e todas as contas de fatura vivas', async () => {
    const f = await fresh();
    const w = await f.purchase('Tênis', 60_000, '2026-10-05', 3, 'Lazer');
    expect(w.card).toMatchObject({ id: f.cardId, usedCents: 60_000, currentMonth: NOV });
    expect(w.entry).toMatchObject({ kind: 'compra', amountCents: 60_000, installments: 3, invoiceMonth: NOV });
    expect(w.invoices.map((i) => [i.month, i.totalCents])).toEqual([
      [NOV, 20_000],
      [DEC, 20_000],
      ['2027-01', 20_000],
    ]);
    expect(w.commitments.map((c) => [c.invoice!.month, c.amountCents])).toEqual([
      [NOV, 20_000],
      [DEC, 20_000],
      ['2027-01', 20_000],
    ]);
    const c = await f.repo.updateCard(key(), f.cardId, 1, { ...NUBANK, limitCents: null });
    expect([c.entry, c.invoices, c.commitments.length]).toEqual([null, [], 3]);
    const del = await f.repo.deleteCardEntry(key(), w.entry!.id, 1);
    expect([del.entry!.id, del.invoices, del.commitments]).toEqual([w.entry!.id, [], []]);
  });
});

// ---------------------------------------------------------------------------
// 8. Textos
// ---------------------------------------------------------------------------

describe('textos de cartões', () => {
  it('aviso da compra, pagamento parcial e link da calculadora', () => {
    expect(purchaseNotice(NOV, 'Nubank', TODAY)).toBe('Esta compra entra na fatura de novembro do Nubank e conta em Pago quando a fatura for paga.');
    expect(purchaseNotice('2027-01', 'Nubank', TODAY)).toBe('Esta compra entra na fatura de janeiro de 2027 do Nubank e conta em Pago quando a fatura for paga.');
    expect(partialPaymentText(30_000, DEC, TODAY)).toBe(
      'Ficaram R$ 300,00 para a fatura de dezembro. Juros e encargos do banco entram quando você informar a fatura de dezembro.',
    );
    expect(CARDS_TEXT.invoice.calcLink).toBe('Quanto custa pagar só uma parte?');
    expect(partialPaymentCalcLink(30_000)).toEqual({ slug: 'custo-da-divida', params: { modo: 'rotativo', valor: '30000', origem: 'fatura' } });
    expect(installmentsNotice(10, 15_000)).toBe('10 parcelas, a primeira de R$ 150,00. As outras 9 entram nas faturas seguintes.');
    expect(installmentsNotice(1, 15_000)).toBe('');
    expect(invoiceMonthLabel('2026-11', TODAY)).toBe('novembro');
    expect(invoiceMonthLabel('2027-01', TODAY)).toBe('janeiro de 2027');
    expect(CARDS_TEXT.expense.savedFor(NOV, TODAY)).toBe('Compra anotada na fatura de novembro.');
  });

  it('códigos de erro de cartões têm texto próprio e código desconhecido cai na falha genérica', () => {
    const codes: RepoErrorCode[] = [
      'conta_de_fatura',
      'pagamento_de_fatura',
      'fatura_paga',
      'fatura_seguinte_paga',
      'dias_com_fatura_paga',
      'valor_acima_da_fatura',
      'lancamento_automatico',
      'apelido_invalido',
      'final_invalido',
      'dia_de_fechamento_invalido',
      'dia_de_vencimento_invalido',
      'limite_invalido',
      'limite_de_cartoes',
      'cartao_arquivado',
      'cartao_com_lancamentos',
      'tipo_de_encargo_invalido',
    ];
    for (const code of codes) expect(CARD_ERROR_TEXT[code as keyof typeof CARD_ERROR_TEXT], code).toBeTruthy();
    expect(cardErrorText('fatura_paga')).toBe(CARD_ERROR_TEXT.fatura_paga);
    expect(cardErrorText('inexistente')).toBe(CARD_ERROR_TEXT.salvar_falhou);
    expect(new RepoError('fatura_paga').code).toBe('fatura_paga');
  });
});

// ---------------------------------------------------------------------------
// 9. Cartão sem dados de exemplo e buildInvoices direto
// ---------------------------------------------------------------------------

describe('conta nova e buildInvoices', () => {
  it('conta nova nunca recebe cartão nem fatura; a demonstração sem cartões (cards: false) volta aos ciclos anteriores', async () => {
    const fresh0 = new MemoryRepository({ actorId: 'pessoa-nova', displayName: 'Pessoa nova', today: () => TODAY });
    const space = await fresh0.ensurePersonalSpace('Conta principal');
    expect(await fresh0.listCards(space.personalContextId)).toEqual([]);
    const base = await createDemoRepository({ cards: false });
    const ctx = (await base.getSpace())!.personalContextId;
    expect(await base.listCards(ctx)).toEqual([]);
    expect((await base.listCommitments(ctx, NOV)).some((c) => c.invoice)).toBe(false);
    const withCards = await createDemoRepository();
    expect(await withCards.listCards((await withCards.getSpace())!.personalContextId)).toHaveLength(1);
  });

  it('buildInvoices ignora lançamentos de outro cartão e devolve vazio sem lançamentos', () => {
    const card: Card = {
      id: 'c1',
      contextId: 'x',
      name: 'A',
      lastDigits: null,
      closingDay: 3,
      dueDay: 10,
      limitCents: null,
      status: 'ativo',
      createdBy: 'p',
      version: 1,
      createdAt: '',
      updatedAt: '',
      usedCents: 0,
      currentMonth: OCT,
      currentClosingOn: '2026-10-03',
      currentDueOn: '2026-10-10',
    };
    expect(buildInvoices(card, [], [], TODAY)).toEqual([]);
    const other = {
      id: 'e1',
      contextId: 'x',
      cardId: 'c2',
      kind: 'encargo' as const,
      description: null,
      category: null,
      chargeType: 'juros' as const,
      purchasedOn: null,
      amountCents: 100,
      installments: 1,
      invoiceMonth: NOV,
      sourceMonth: null,
      paymentRecordId: null,
      receiptKey: null,
      createdBy: 'p',
      version: 1,
      createdAt: '2026-10-07T00:00:00Z',
      updatedAt: '2026-10-07T00:00:00Z',
    };
    expect(buildInvoices(card, [other], [], TODAY)).toEqual([]);
    const own = buildInvoices(card, [{ ...other, cardId: 'c1' }], [], TODAY);
    expect(own.map((i) => [i.month, i.totalCents, i.situation])).toEqual([[NOV, 100, 'aberta']]);
  });
});

// ---------------------------------------------------------------------------
// 9. Revisão da auditoria (Ciclo E): limite usado, fatura antiga, fatura paga com os dias do cartão mudados, leitura por chave
// ---------------------------------------------------------------------------

describe('revisão da auditoria', () => {
  it('limite usado com crédito em cadeia: soma por fatura não paga de max(0, total), igual ao banco', async () => {
    // 450,00 em 3 vezes e estorno de 400,00 em novembro: novembro -250,00, dezembro -100,00, janeiro 50,00.
    const f = await fresh('2026-10-07', { name: 'Cadeia', lastDigits: null, closingDay: 5, dueDay: 12, limitCents: 100_000 });
    await f.purchase('Geladeira', 45_000, '2026-10-07', 3);
    const refund = await f.repo.addCardRefund(key(), f.cardId, { description: 'Devolução', category: null, amountCents: 40_000, invoiceMonth: NOV });
    expect((await f.invoices()).map((i) => [i.month, i.rawCents])).toEqual([[NOV, -25_000], [DEC, -10_000], ['2027-01', 5_000]]);
    expect(cardLimitUsed(await f.invoices())).toBe(5_000);
    expect(refund.card.usedCents).toBe(5_000);
    expect((await f.repo.getCard(f.cardId))!.usedCents).toBe(5_000);
    // O caso da auditoria: 200,00 em novembro e 600,00 em 2 vezes, estorno de 600,00: novembro -100,00 e dezembro 200,00.
    const g = await fresh('2026-10-07', { name: 'Cadeia 2', lastDigits: null, closingDay: 5, dueDay: 12, limitCents: null });
    await g.purchase('Mercado', 20_000, '2026-10-07');
    await g.purchase('Sofá', 60_000, '2026-10-07', 2);
    await g.repo.addCardRefund(key(), g.cardId, { description: 'Sofá devolvido', category: null, amountCents: 60_000, invoiceMonth: NOV });
    expect((await g.invoices()).map((i) => [i.month, i.rawCents])).toEqual([[NOV, -10_000], [DEC, 20_000]]);
    expect((await g.repo.getCard(g.cardId))!.usedCents).toBe(20_000);
    // Fatura paga sai do uso do limite.
    g.clock.today = '2026-12-06'; // dezembro fechou em 05/12
    const dec = await g.invoice(DEC);
    const paid = await g.repo.payInvoice(key(), g.cardId, DEC, dec.commitmentVersion!, 20_000, '2026-12-06');
    expect(paid.card.usedCents).toBe(0);
    g.repo.checkInvariants();
  });

  it('fatura antiga (compra de até 48 meses atrás) é paga na data real; a janela de 1 ano vale para as recentes', async () => {
    const f = await fresh('2026-10-07');
    await f.purchase('Compra antiga', 9_000, '2024-11-20', 3);
    expect((await f.invoices()).map((i) => [i.month, i.totalCents, i.situation, i.periodStartOn])).toEqual([
      ['2024-12', 3_000, 'fechada', '2024-11-04'],
      ['2025-01', 3_000, 'fechada', '2024-12-04'],
      ['2025-02', 3_000, 'fechada', '2025-01-04'],
    ]);
    const dec24 = await f.invoice('2024-12');
    await expectCode(f.repo.payInvoice(key(), f.cardId, '2024-12', dec24.commitmentVersion!, 3_000, '2024-11-03'), 'data_invalida');
    const paid = await f.repo.payInvoice(key(), f.cardId, '2024-12', dec24.commitmentVersion!, 3_000, '2024-12-10');
    expect(paid.record).toMatchObject({ occurredOn: '2024-12-10', description: 'Fatura Nubank (dezembro)' });
    const jan25 = await f.invoice('2025-01');
    await expectCode(f.repo.payInvoice(key(), f.cardId, '2025-01', jan25.commitmentVersion!, 3_000, '2024-12-03'), 'data_invalida');
    await f.repo.payInvoice(key(), f.cardId, '2025-01', jan25.commitmentVersion!, 3_000, '2024-12-04');
    const feb25 = await f.invoice('2025-02');
    await expectCode(f.repo.payInvoice(key(), f.cardId, '2025-02', feb25.commitmentVersion!, 3_000, '2026-10-08'), 'data_futura');
    await expectCode(f.repo.payInvoice(key(), f.cardId, '2025-02', feb25.commitmentVersion!, 3_000, ''), 'data_invalida');
    // Fatura recente: a janela de 1 ano (07/10/2025 vale; 06/10/2025 não).
    const g = await fresh('2026-10-07');
    await g.purchase('Recente', 1_000, '2026-09-20'); // fatura de outubro, fechada em 03/10
    const oct = await g.invoice(OCT);
    await expectCode(g.repo.payInvoice(key(), g.cardId, OCT, oct.commitmentVersion!, 1_000, '2025-10-06'), 'data_invalida');
    expect((await g.repo.payInvoice(key(), g.cardId, OCT, oct.commitmentVersion!, 1_000, '2025-10-07')).record.occurredOn).toBe('2025-10-07');
    f.repo.checkInvariants();
    g.repo.checkInvariants();
  });

  it('invoicePaymentError e o formulário: o início do período só vale quando é anterior a 1 ano atrás', () => {
    const base = { amountCents: 3_000, totalCents: 3_000 };
    const today = '2026-10-07';
    expect(invoicePaymentError({ ...base, paidOn: '2025-10-07' }, today)).toBeNull();
    expect(invoicePaymentError({ ...base, paidOn: '2025-10-06' }, today)).toBe('data_invalida');
    expect(invoicePaymentError({ ...base, paidOn: '2025-10-06', periodStartOn: '2025-10-04' }, today)).toBeNull();
    expect(invoicePaymentError({ ...base, paidOn: '2025-10-03', periodStartOn: '2025-10-04' }, today)).toBe('data_invalida');
    expect(invoicePaymentError({ ...base, paidOn: '2024-12-04', periodStartOn: '2024-12-04' }, today)).toBeNull();
    expect(invoicePaymentError({ ...base, paidOn: '2024-12-03', periodStartOn: '2024-12-04' }, today)).toBe('data_invalida');
    // Período mais novo que 1 ano atrás: vale 1 ano (não aperta a janela).
    expect(invoicePaymentError({ ...base, paidOn: '2025-10-07', periodStartOn: '2026-10-04' }, today)).toBeNull();
    expect(invoicePaymentError({ ...base, paidOn: '2025-10-06', periodStartOn: '2026-10-04' }, today)).toBe('data_invalida');
    expect(invoicePaymentError({ ...base, paidOn: '2026-10-08', periodStartOn: '2024-12-04' }, today)).toBe('data_futura');
    expect(invoicePaymentError({ ...base, paidOn: '', periodStartOn: '2024-12-04' }, today)).toBe('data_invalida');
    // O formulário passa o início do período da fatura.
    const old = { totalCents: 3_000, periodStartOn: '2024-11-04' };
    expect(validateInvoicePaymentDraft({ mode: 'total', amountText: '', dateText: '10/12/2024' }, old, today)).toMatchObject({ ok: true, paidOn: '2024-12-10' });
    expect(validateInvoicePaymentDraft({ mode: 'total', amountText: '', dateText: '03/11/2024' }, old, today)).toMatchObject({ ok: false, code: 'data_invalida' });
    // periodStartOn é obrigatório no tipo: sem ele (como `{ totalCents }`) nem compila.
  });

  it('fatura paga mantém vencimento e fechamento quando o cartão muda os dias (como invoice_items e Contas a pagar)', async () => {
    const f = await fresh('2026-10-07');
    await f.purchase('Tênis', 40_000, '2026-10-05');
    f.clock.today = '2026-11-12';
    const nov = await f.invoice(NOV);
    expect([nov.closingOn, nov.dueOn, nov.periodEndOn]).toEqual(['2026-11-03', '2026-11-10', '2026-11-03']);
    await f.repo.payInvoice(key(), f.cardId, NOV, nov.commitmentVersion!, 40_000, '2026-11-12');
    await f.purchase('Para dezembro', 10_000, '2026-11-11');
    // Vencimento do dia 10 para o dia 12 e fechamento do dia 3 para o dia 5: a paga não muda; a aberta segue o cartão.
    const card = (await f.repo.getCard(f.cardId))!;
    await f.repo.updateCard(key(), f.cardId, card.version, { name: 'Nubank', lastDigits: '1234', closingDay: 5, dueDay: 12, limitCents: 500_000 });
    const bills = await f.repo.listInvoiceCommitments(f.cardId);
    expect(bills.map((b) => [b.invoice!.month, b.dueOn, b.invoice!.closingOn, b.status])).toEqual([
      [NOV, '2026-11-10', '2026-11-03', 'quitado'],
      [DEC, '2026-12-12', '2026-12-05', 'aberto'],
    ]);
    const invoices = await f.invoices();
    const novInvoice = invoices.find((i) => i.month === NOV)!;
    expect([novInvoice.closingOn, novInvoice.dueOn, novInvoice.periodEndOn, novInvoice.situation]).toEqual(['2026-11-03', '2026-11-10', '2026-11-03', 'paga']);
    expect(dueTextOf(novInvoice.dueOn, f.clock.today)).toBe('Venceu em 10/11');
    const decInvoice = invoices.find((i) => i.month === DEC)!;
    expect([decInvoice.closingOn, decInvoice.dueOn]).toEqual(['2026-12-05', '2026-12-12']);
    // A leitura calculada (invoiceItemOf) e a lida do repositório (invoice_items) são a mesma.
    expect(invoices.map(invoiceItemOf)).toEqual(await f.repo.listInvoiceItems(f.cardId));
    f.repo.checkInvariants();
  });

  it('findReceipt: a nota já anotada aparece pelo resumo da chave, antes de Salvar (gasto ou compra no cartão, só vivos, só de quem lê)', async () => {
    const f = await fresh();
    const rec = { accountId: f.accountId, amountCents: 8_740, occurredOn: '2026-10-06', description: 'Mercado', category: 'Mercado' };
    expect(await f.repo.findReceipt(f.ctx, KEY_A)).toBeNull();
    const r = await f.repo.createRecord(key(), f.ctx, 'despesa', { ...rec, receiptKey: KEY_A });
    expect(await f.repo.findReceipt(f.ctx, KEY_A)).toEqual({ recordId: r.id, cardEntryId: null, cardId: null });
    expect((await f.repo.getRecord(r.id))!.description).toBe('Mercado');
    const bought = await f.repo.addCardPurchase(key(), f.cardId, { description: 'Loja', category: null, purchasedOn: '2026-10-06', totalCents: 30_000, installments: 3, receiptKey: KEY_B });
    expect(await f.repo.findReceipt(f.ctx, KEY_B)).toEqual({ recordId: null, cardEntryId: bought.entry!.id, cardId: f.cardId });
    expect((await f.repo.getCardEntry(bought.entry!.id))!.amountCents).toBe(30_000);
    // Outro contexto, chave malformada, a chave inteira ou resumo em maiúsculas: nada (sem erro, sem revelar).
    expect(await f.repo.findReceipt('outro-contexto', KEY_A)).toBeNull();
    expect(await f.repo.findReceipt(f.ctx, RAW_A)).toBeNull();
    expect(await f.repo.findReceipt(f.ctx, KEY_A.toUpperCase())).toBeNull();
    expect(await f.repo.findReceipt(f.ctx, '')).toBeNull();
    // Excluído, a chave volta a ficar livre.
    await f.repo.deleteRecord(key(), r.id, r.version);
    expect(await f.repo.findReceipt(f.ctx, KEY_A)).toBeNull();
    await f.repo.deleteCardEntry(key(), bought.entry!.id, bought.entry!.version);
    expect(await f.repo.findReceipt(f.ctx, KEY_B)).toBeNull();
    // Só leitura: não grava operação nem conta como anotação.
    const before = (await f.repo.getReturnReviewState(f.ctx)).activity;
    await f.repo.findReceipt(f.ctx, KEY_A);
    expect((await f.repo.getReturnReviewState(f.ctx)).activity).toEqual(before);
  });

  it('do QR ao aviso: ler a nota, calcular o resumo e achar o registro antes de Salvar; a nota de pessoa física não guarda CPF', async () => {
    const f = await fresh();
    const cpf = '52998224725';
    const pfKey = accessKey(`33261000${cpf}`.slice(0, 6) + `000${cpf}` + '55' + '001' + '000000124' + '1' + '00000002');
    const read = readReceiptCode(pfKey);
    if (!read.ok) throw new Error(read.code);
    const draft = receiptDraft(factsFromKey(read.key), '2026-10-09');
    expect(draft.receiptKey).toBe(createHash('sha256').update(pfKey, 'utf8').digest('hex'));
    expect(await f.repo.findReceipt(f.ctx, draft.receiptKey)).toBeNull();
    const rec = { accountId: f.accountId, amountCents: 4_500, occurredOn: '2026-10-06', description: draft.description, category: null, receiptKey: draft.receiptKey };
    const saved = await f.repo.createRecord(key(), f.ctx, 'despesa', rec);
    expect(JSON.stringify(saved)).not.toContain(cpf);
    expect(saved.receiptKey).toBe(draft.receiptKey);
    // Escanear de novo: o aviso aparece pelo resumo, sem chegar ao Salvar.
    const again = readReceiptCode(pfKey);
    if (!again.ok) throw new Error(again.code);
    expect(await f.repo.findReceipt(f.ctx, receiptDraft(factsFromKey(again.key), '2026-10-09').receiptKey)).toEqual({ recordId: saved.id, cardEntryId: null, cardId: null });
    // Chave de CNPJ alfanumérico: lida, resumida e salva sem recusa do repositório.
    const alfa = '35261012ABC34501DE35550010000001251000000035';
    const readAlfa = readReceiptCode(alfa);
    if (!readAlfa.ok) throw new Error(readAlfa.code);
    const alfaDraft = receiptDraft(factsFromKey(readAlfa.key), '2026-10-09');
    const alfaSaved = await f.repo.addCardPurchase(key(), f.cardId, { description: alfaDraft.description, category: null, purchasedOn: '2026-10-06', totalCents: 8_000, installments: 2, receiptKey: alfaDraft.receiptKey });
    expect(alfaSaved.entry!.receiptKey).toBe(createHash('sha256').update(alfa, 'utf8').digest('hex'));
    expect(await f.repo.findReceipt(f.ctx, alfaDraft.receiptKey)).toMatchObject({ cardEntryId: alfaSaved.entry!.id });
    f.repo.checkInvariants();
  });
});

// Tipos usados só para conferir a forma dos retornos.
export type _Shapes = [Commitment, FinancialRecord, Invoice];
