import type { IsoDate, IsoMonth } from './dates';
import {
  addDays,
  addMonths,
  addYearsClamped,
  dateInMonth,
  formatDateBR,
  formatDayMonth,
  formatMonthName,
  isValidIsoDate,
  isValidIsoMonth,
  monthOf,
  parseDateBR,
} from './dates';
import { sharesCents } from './learn/math';
import type { Cents } from './money';
import { MAX_RECORD_CENTS, formatBRL, parseBRL } from './money';
import type {
  Card,
  CardChargeInput,
  CardChargeType,
  CardEntry,
  CardEntryKind,
  CardInput,
  CardPurchaseInput,
  CardRefundInput,
  CardStatus,
  Commitment,
  FinancialRecord,
  InvoiceItem,
} from './records';
import { NO_CATEGORY_LABEL } from './records';
import type { RecordsRepository } from './repository';
import { CATEGORY_MAX, DESCRIPTION_MAX, ERROR_TEXT, charCount } from './validation';
import { calcLinkParams } from './calculators/links';

/**
 * Cartões de crédito (D-037, Ciclo E), no contexto Pessoal. Regras puras, repetidas no banco pelas funções de cartões
 * (create_card, update_card, set_card_status, delete_card, add_card_purchase, update_card_entry, delete_card_entry,
 * add_card_charge, add_card_refund, pay_invoice e undo_invoice_payment) e pelas visões card_items e invoice_items.
 *
 * - Fatura = mês do VENCIMENTO ("fatura de novembro"). Fechamento da fatura do mês M: o dia de fechamento no mês do
 *   fechamento, limitado ao último dia do mês; o mês do fechamento é M se o dia de vencimento é maior que o de fechamento,
 *   senão M - 1. Vencimento: o dia de vencimento em M, limitado ao último dia.
 * - Período da fatura: do dia seguinte ao fechamento da fatura anterior até o dia do fechamento, inclusive. Compra no dia
 *   do fechamento fica nessa fatura; só a compra DEPOIS do fechamento vai para a seguinte.
 * - Compra em n parcelas: o valor total dividido por n, com o resto de centavos na primeira; a parcela 1 cai na fatura
 *   cujo período contém a data da compra e as outras nas n - 1 faturas seguintes. A fatura da parcela 1 é fixada ao gravar.
 * - Total da fatura = parcelas + encargos + saldo anterior - estornos. Nunca negativo no pagamento: com total negativo, o
 *   crédito vira um estorno automático (gravado, com a fatura de origem) na fatura seguinte, mantido pelas funções de cartão.
 * - Situação: aberta (hoje até o dia do fechamento), fechada (depois do fechamento, sem pagamento), paga ou paga em parte.
 * - Compras nunca entram em Pago na data da compra: Pago recebe o pagamento da fatura, na data do pagamento (D-021).
 * - Pagamento parcial: a diferença vira o lançamento "saldo anterior" na fatura do mês seguinte, sem juros.
 * - Limite usado = soma dos totais das faturas ainda não pagas (abertas e fechadas, de todos os meses).
 * - Nunca guarda número completo de cartão, código de segurança nem validade.
 */

export const CARD_NAME_MAX = 30;
/** Limite do cartão: de R$ 1,00 a R$ 9.999.999,99. */
export const CARD_LIMIT_MIN_CENTS = 100;
export const CARD_LIMIT_MAX_CENTS = MAX_RECORD_CENTS;
/** Cartões ativos por contexto. */
export const CARDS_ACTIVE_MAX = 20;
export const CARD_INSTALLMENTS_MIN = 1;
export const CARD_INSTALLMENTS_MAX = 48;
/** Faturas aceitas em encargos e estornos novos: de 48 meses antes a 48 meses depois do mês de hoje. */
export const INVOICE_MONTHS_BACK = 48;
export const INVOICE_MONTHS_AHEAD = 48;
/** A data da compra não passa do primeiro dia do mês 48 meses antes do mês de hoje (nenhuma compra em 48 parcelas teria parcela a pagar). */
export const PURCHASE_MONTHS_BACK = 48;
/** Até 5.000 lançamentos vivos por cartão (cada parcela conta como um). */
export const CARD_ENTRIES_MAX = 5000;
/** Rótulo de "Por categoria" para a parte do pagamento da fatura que é juros, multa, IOF, anuidade ou tarifa. */
export const CARD_CHARGES_CATEGORY = 'Encargos do cartão';

export const CARD_STATUSES: readonly CardStatus[] = ['ativo', 'arquivado'];
export const CARD_CHARGE_TYPES: readonly CardChargeType[] = ['juros', 'multa', 'iof', 'anuidade', 'tarifa'];
export const CARD_ENTRY_KINDS: readonly CardEntryKind[] = ['compra', 'encargo', 'estorno', 'saldo_anterior'];
/** Tipos de encargo, no texto da lista. */
export const CARD_CHARGE_LABEL: Readonly<Record<CardChargeType, string>> = {
  juros: 'Juros',
  multa: 'Multa',
  iof: 'IOF',
  anuidade: 'Anuidade',
  tarifa: 'Tarifa',
};

/** Textos dos lançamentos que o app gera. */
export const BALANCE_DESCRIPTION = 'Saldo anterior';
export const CREDIT_DESCRIPTION = 'Crédito da fatura anterior';

const isInt = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n);

// ---------------------------------------------------------------------------
// Datas da fatura
// ---------------------------------------------------------------------------

/** Dias do cartão que definem fechamento e vencimento. */
export interface CardDays {
  closingDay: number;
  dueDay: number;
}

/** Mês em que a fatura do mês M fecha: M se o vencimento é depois do fechamento no mês, senão o mês anterior. */
export function invoiceClosingMonth(card: CardDays, month: IsoMonth): IsoMonth {
  return card.dueDay > card.closingDay ? month : addMonths(month, -1);
}

/** Dia do fechamento da fatura do mês M (dia de fechamento limitado ao último dia do mês do fechamento). */
export function invoiceClosingOn(card: CardDays, month: IsoMonth): IsoDate {
  return dateInMonth(invoiceClosingMonth(card, month), card.closingDay);
}

/** Dia do vencimento da fatura do mês M (dia de vencimento limitado ao último dia de M). */
export function invoiceDueOn(card: CardDays, month: IsoMonth): IsoDate {
  return dateInMonth(month, card.dueDay);
}

/** Período da fatura: do dia seguinte ao fechamento anterior até o fechamento, inclusive. */
export function invoicePeriod(card: CardDays, month: IsoMonth): { startOn: IsoDate; endOn: IsoDate } {
  return { startOn: addDays(invoiceClosingOn(card, addMonths(month, -1)), 1), endOn: invoiceClosingOn(card, month) };
}

/** Fatura (mês do vencimento) cujo período contém a data. Compra no dia do fechamento fica na fatura que fecha nele. */
export function invoiceMonthOf(card: CardDays, date: IsoDate): IsoMonth {
  const base = monthOf(date);
  for (let i = 0; i <= 2; i++) {
    const month = addMonths(base, i);
    if (date <= invoiceClosingOn(card, month)) return month;
  }
  // Inalcançável: o fechamento do mês seguinte ao do mês seguinte à data é sempre depois dela.
  return addMonths(base, 2);
}

// ---------------------------------------------------------------------------
// Parcelas
// ---------------------------------------------------------------------------

/** Valor de cada parcela: total ÷ n, com o resto de centavos na primeira. installmentAmounts(10.000, 3) = [3.334, 3.333, 3.333]. */
export function installmentAmounts(totalCents: Cents, count: number): Cents[] {
  if (!isInt(totalCents) || totalCents < 0 || !isInt(count) || count < 1) throw new RangeError(`parcelas inválidas: ${totalCents} em ${count}`);
  const base = Math.floor(totalCents / count);
  const rest = totalCents - base * count;
  return Array.from({ length: count }, (_, i) => (i === 0 ? base + rest : base));
}

/** Parcela de uma compra, já na fatura que ela cai. */
export interface Installment {
  entryId: string;
  /** De 1 a count. */
  number: number;
  count: number;
  amountCents: Cents;
  /** Mês do vencimento da fatura: o da parcela 1 mais k - 1 meses. */
  invoiceMonth: IsoMonth;
}

/** Parcelas de uma compra (uma linha de CardEntry com kind 'compra'): a parcela k cai k - 1 faturas depois da 1ª. */
export function purchaseInstallments(entry: Pick<CardEntry, 'id' | 'amountCents' | 'installments' | 'invoiceMonth'>): Installment[] {
  return installmentAmounts(entry.amountCents, entry.installments).map((amountCents, i) => ({
    entryId: entry.id,
    number: i + 1,
    count: entry.installments,
    amountCents,
    invoiceMonth: addMonths(entry.invoiceMonth, i),
  }));
}

/** Fatura da 1ª parcela de uma compra feita na data (fixada ao gravar). */
export function purchaseFirstInvoiceMonth(card: CardDays, purchasedOn: IsoDate): IsoMonth {
  return invoiceMonthOf(card, purchasedOn);
}

// ---------------------------------------------------------------------------
// Validação (mesma ordem das funções do banco)
// ---------------------------------------------------------------------------

export const CARD_INPUT_CODE_ORDER = [
  'apelido_invalido',
  'final_invalido',
  'dia_de_fechamento_invalido',
  'dia_de_vencimento_invalido',
  'limite_invalido',
] as const;
export type CardInputErrorCode = (typeof CARD_INPUT_CODE_ORDER)[number];

/** Primeiro erro dos campos do cartão, na ordem do banco. Textos já aparados (apelido sem espaços nas pontas). */
export function cardInputError(input: CardInput): CardInputErrorCode | null {
  const name = input.name;
  if (typeof name !== 'string' || name !== name.trim() || charCount(name) < 1 || charCount(name) > CARD_NAME_MAX) return 'apelido_invalido';
  // O apelido não é lugar de número de cartão: 13 a 19 dígitos seguidos (ignorando espaço, ponto e hífen) são recusados.
  if (looksLikeCardNumber(name)) return 'apelido_invalido';
  if (input.lastDigits !== null && (typeof input.lastDigits !== 'string' || !/^\d{4}$/.test(input.lastDigits))) return 'final_invalido';
  if (!isInt(input.closingDay) || input.closingDay < 1 || input.closingDay > 31) return 'dia_de_fechamento_invalido';
  if (!isInt(input.dueDay) || input.dueDay < 1 || input.dueDay > 31) return 'dia_de_vencimento_invalido';
  if (input.limitCents !== null && (!isInt(input.limitCents) || input.limitCents < CARD_LIMIT_MIN_CENTS || input.limitCents > CARD_LIMIT_MAX_CENTS)) {
    return 'limite_invalido';
  }
  return null;
}

/** 13 a 19 dígitos seguidos, ignorando espaço, ponto e hífen: parece número de cartão (nunca guardado). */
export function looksLikeCardNumber(text: string): boolean {
  return /[0-9]{13,19}/.test(text.replace(/[ .-]/g, ''));
}

/** Campos do cartão como o banco os grava: apelido e final aparados (final vazio vira nulo), ausentes viram nulos. */
export function normalizeCardInput(input: CardInput): CardInput {
  const digits = typeof input.lastDigits === 'string' ? input.lastDigits.trim() : input.lastDigits;
  return {
    name: typeof input.name === 'string' ? input.name.trim() : input.name,
    lastDigits: digits === '' || digits === undefined ? null : digits,
    closingDay: input.closingDay,
    dueDay: input.dueDay,
    limitCents: input.limitCents ?? null,
  };
}

/** Data de compra mais antiga aceita em compras novas: o primeiro dia do mês 48 meses antes do mês de hoje. */
export function purchaseMinDate(today: IsoDate): IsoDate {
  return `${addMonths(monthOf(today), -PURCHASE_MONTHS_BACK)}-01`;
}

/** Valor, descrição e categoria dos lançamentos com texto (mesma ordem de clarevo_validate_record). */
function textAmountError(
  amountCents: Cents,
  description: string,
  category: string | null,
): 'valor_invalido' | 'valor_acima_do_limite' | 'descricao_obrigatoria' | 'descricao_longa' | 'categoria_invalida' | null {
  if (!isInt(amountCents) || amountCents < 1) return 'valor_invalido';
  if (amountCents > MAX_RECORD_CENTS) return 'valor_acima_do_limite';
  if (typeof description !== 'string' || description.length === 0) return 'descricao_obrigatoria';
  if (charCount(description) > DESCRIPTION_MAX) return 'descricao_longa';
  if (category && charCount(category) > CATEGORY_MAX) return 'categoria_invalida';
  return null;
}

export const CARD_PURCHASE_CODE_ORDER = [
  'valor_invalido',
  'valor_acima_do_limite',
  'descricao_obrigatoria',
  'descricao_longa',
  'categoria_invalida',
  'parcelas_invalidas',
  'data_invalida',
  'data_futura',
] as const;
export type CardPurchaseErrorCode = (typeof CARD_PURCHASE_CODE_ORDER)[number];

/**
 * Primeiro erro da compra no cartão, na ordem de clarevo_validate_purchase. Descrição já aparada. checkRange: a data não passa
 * de 48 meses atrás (conferida ao criar e, na edição, só quando a data muda; data_invalida).
 */
export function cardPurchaseError(input: CardPurchaseInput, today: IsoDate, checkRange = true): CardPurchaseErrorCode | null {
  const base = textAmountError(input.totalCents, input.description, input.category);
  if (base) return base;
  if (!isInt(input.installments) || input.installments < CARD_INSTALLMENTS_MIN || input.installments > CARD_INSTALLMENTS_MAX || input.totalCents < input.installments) {
    return 'parcelas_invalidas';
  }
  if (typeof input.purchasedOn !== 'string' || !isValidIsoDate(input.purchasedOn) || (checkRange && input.purchasedOn < purchaseMinDate(today))) {
    return 'data_invalida';
  }
  if (input.purchasedOn > today) return 'data_futura';
  return null;
}

/**
 * Mês de fatura de encargo ou estorno (clarevo_validate_invoice_month): formato e, com checkRange (fatura nova ou que muda), de
 * 48 meses antes a 48 meses depois do mês de hoje. Tudo é mes_invalido.
 */
export function invoiceMonthError(month: IsoMonth, today: IsoDate, checkRange = true): 'mes_invalido' | null {
  if (typeof month !== 'string' || !isValidIsoMonth(month)) return 'mes_invalido';
  if (!checkRange) return null;
  const current = monthOf(today);
  return month < addMonths(current, -INVOICE_MONTHS_BACK) || month > addMonths(current, INVOICE_MONTHS_AHEAD) ? 'mes_invalido' : null;
}

export const CARD_CHARGE_CODE_ORDER = ['tipo_de_encargo_invalido', 'valor_invalido', 'valor_acima_do_limite', 'mes_invalido'] as const;
export type CardChargeErrorCode = (typeof CARD_CHARGE_CODE_ORDER)[number];

/** Tipo, valor e fatura (add_card_charge). checkRange: false na edição quando a fatura não muda. */
export function cardChargeError(input: CardChargeInput, today: IsoDate, checkRange = true): CardChargeErrorCode | null {
  if (!CARD_CHARGE_TYPES.includes(input.chargeType)) return 'tipo_de_encargo_invalido';
  if (!isInt(input.amountCents) || input.amountCents < 1) return 'valor_invalido';
  if (input.amountCents > MAX_RECORD_CENTS) return 'valor_acima_do_limite';
  return invoiceMonthError(input.invoiceMonth, today, checkRange);
}

export const CARD_REFUND_CODE_ORDER = [
  'valor_invalido',
  'valor_acima_do_limite',
  'descricao_obrigatoria',
  'descricao_longa',
  'categoria_invalida',
  'mes_invalido',
] as const;
export type CardRefundErrorCode = (typeof CARD_REFUND_CODE_ORDER)[number];

/** Valor, descrição, categoria e fatura (add_card_refund). */
export function cardRefundError(input: CardRefundInput, today: IsoDate, checkRange = true): CardRefundErrorCode | null {
  return textAmountError(input.amountCents, input.description, input.category) ?? invoiceMonthError(input.invoiceMonth, today, checkRange);
}

export const INVOICE_PAYMENT_CODE_ORDER = ['valor_invalido', 'valor_acima_da_fatura', 'data_invalida', 'data_futura'] as const;
export type InvoicePaymentErrorCode = (typeof INVOICE_PAYMENT_CODE_ORDER)[number];

/**
 * Valor de R$ 0,01 até o total da fatura; data até hoje e não antes de 1 ano (mesma data do ano anterior, limitada ao fim do
 * mês). Ordem de pay_invoice: valor_invalido, valor_acima_da_fatura, data_invalida (inválida ou há mais de 1 ano), data_futura.
 */
export function invoicePaymentError(input: { amountCents: Cents; totalCents: Cents; paidOn: IsoDate }, today: IsoDate): InvoicePaymentErrorCode | null {
  if (!isInt(input.amountCents) || input.amountCents < 1) return 'valor_invalido';
  if (input.amountCents > input.totalCents) return 'valor_acima_da_fatura';
  if (typeof input.paidOn !== 'string' || !isValidIsoDate(input.paidOn) || input.paidOn < addYearsClamped(today, -1)) return 'data_invalida';
  if (input.paidOn > today) return 'data_futura';
  return null;
}

/**
 * Chave de acesso da nota fiscal (NF-e ou NFC-e): 44 dígitos com o dígito verificador certo (módulo 11, pesos de 2 a 9 da
 * direita para a esquerda; resto 0 ou 1 dá dígito 0). Mesma regra de clarevo_receipt_key_valid.
 */
export function receiptKeyValid(key: string): boolean {
  if (typeof key !== 'string' || !/^[0-9]{44}$/.test(key)) return false;
  let sum = 0;
  for (let i = 0; i < 43; i++) sum += Number(key[42 - i]) * (2 + (i % 8));
  const r = sum % 11;
  return (r === 0 || r === 1 ? 0 : 11 - r) === Number(key[43]);
}

/** Descrições e categoria como o banco as grava (aparadas; categoria vazia vira nula). */
export function normalizePurchaseInput(input: CardPurchaseInput): CardPurchaseInput {
  return {
    description: typeof input.description === 'string' ? input.description.trim() : input.description,
    category: input.category?.trim() ? input.category.trim() : null,
    purchasedOn: input.purchasedOn,
    totalCents: input.totalCents,
    installments: input.installments,
    receiptKey: input.receiptKey?.trim() ? input.receiptKey.trim() : null,
  };
}

export function normalizeRefundInput(input: CardRefundInput): CardRefundInput {
  return {
    description: typeof input.description === 'string' ? input.description.trim() : input.description,
    category: input.category?.trim() ? input.category.trim() : null,
    amountCents: input.amountCents,
    invoiceMonth: input.invoiceMonth,
  };
}

// ---------------------------------------------------------------------------
// Fatura: composição, total e situação
// ---------------------------------------------------------------------------

export type InvoiceSituation = 'aberta' | 'fechada' | 'paga' | 'paga_em_parte';
export type InvoiceLineKind = 'parcela' | 'encargo' | 'estorno' | 'saldo_anterior' | 'credito_anterior';

/** Linha da fatura. O valor tem sinal: estorno e crédito levado são negativos. */
export interface InvoiceLine {
  /** Chave estável: id do lançamento (e o número da parcela) ou "credito". */
  key: string;
  /** Lançamento de origem (editar, excluir). O crédito levado e o saldo anterior são automáticos: não se editam. */
  entryId: string | null;
  kind: InvoiceLineKind;
  description: string;
  category: string | null;
  amountCents: Cents;
  chargeType: CardChargeType | null;
  installmentNumber: number | null;
  installmentCount: number | null;
  purchasedOn: IsoDate | null;
  /** "parcela 3 de 10" nas compras parceladas. */
  label: string | null;
  /** Versão do lançamento (expectedVersion de update_card_entry e delete_card_entry). */
  version: number | null;
}

/** Parte da fatura por categoria (encargos à parte), para dividir o pagamento. */
export interface InvoiceMix {
  category: string | null;
  charges: boolean;
  cents: Cents;
}

export interface Invoice {
  cardId: string;
  /** Mês do vencimento. */
  month: IsoMonth;
  closingOn: IsoDate;
  dueOn: IsoDate;
  periodStartOn: IsoDate;
  periodEndOn: IsoDate;
  lines: InvoiceLine[];
  /** Parcelas que caem nela. */
  installmentsCents: Cents;
  chargesCents: Cents;
  /** Saldo anterior (pagamento parcial da fatura anterior). */
  balanceCents: Cents;
  /** Soma dos estornos manuais, em valor positivo. */
  refundsCents: Cents;
  /** Crédito levado da fatura anterior (estorno automático), em valor positivo. */
  creditInCents: Cents;
  /** Soma com sinal, pode ser negativa. */
  rawCents: Cents;
  /** Total a pagar: nunca negativo. */
  totalCents: Cents;
  /** Crédito levado para a fatura seguinte (total negativo): vira o estorno automático dela. */
  creditOutCents: Cents;
  situation: InvoiceSituation;
  /** Aberta: o valor pode mudar com novas compras. */
  estimated: boolean;
  /** O período da fatura ainda não começou. */
  isFuture: boolean;
  /** Conta a pagar da fatura (existe quando o total é maior que zero); null sem ela. */
  commitmentId: string | null;
  /** expectedVersion de pay_invoice e undo_invoice_payment. */
  commitmentVersion: number | null;
  paidCents: Cents | null;
  paidOn: IsoDate | null;
  paymentRecordId: string | null;
  paidAccountId: string | null;
  /** Pagamento parcial: o que ficou para a fatura seguinte; 0 nos outros casos. */
  remainingCents: Cents;
  /** Composição por categoria do total (soma igual ao total). */
  mix: InvoiceMix[];
  /** Parte da composição que ficou para a fatura seguinte no pagamento parcial (soma igual a remainingCents). */
  unpaidMix: InvoiceMix[];
}

/** O que buildInvoices usa do cartão. */
export type InvoiceCard = Pick<Card, 'id' | 'closingDay' | 'dueDay'>;
/** O que buildInvoices usa de cada conta de fatura (listInvoiceCommitments). */
export type InvoiceCommitmentView = Pick<Commitment, 'id' | 'version' | 'status' | 'payment' | 'amountCents' | 'invoice'>;

const LINE_ORDER: Record<InvoiceLineKind, number> = { saldo_anterior: 0, credito_anterior: 1, parcela: 2, encargo: 3, estorno: 4 };

/** Chave do balde de composição. */
const mixKey = (m: Pick<InvoiceMix, 'category' | 'charges'>) => (m.charges ? '\u0000encargos' : m.category === null ? '\u0000sem' : m.category);

function addMix(buckets: Map<string, InvoiceMix>, bucket: Pick<InvoiceMix, 'category' | 'charges'>, cents: Cents) {
  const key = mixKey(bucket);
  const current = buckets.get(key);
  if (current) current.cents += cents;
  else buckets.set(key, { category: bucket.charges ? null : bucket.category, charges: bucket.charges, cents });
}

/**
 * Composição por categoria: estornos abatem a categoria deles; o que ficar negativo (estorno maior que as compras da
 * categoria, ou crédito levado) é abatido das outras categorias na proporção (maior resto). Soma igual ao total quando ele é
 * maior que zero; total zero ou negativo: vazio. Ordem: valor decrescente, empate pelo nome, "Sem categoria" por último.
 */
function normalizeMix(buckets: Map<string, InvoiceMix>): InvoiceMix[] {
  const all = [...buckets.values()];
  const positive = all.filter((b) => b.cents > 0).map((b) => ({ ...b }));
  const deficit = all.filter((b) => b.cents < 0).reduce((acc, b) => acc - b.cents, 0);
  const positiveSum = positive.reduce((acc, b) => acc + b.cents, 0);
  if (positiveSum <= deficit) return [];
  if (deficit > 0) {
    const cuts = sharesCents(
      deficit,
      positive.map((b) => b.cents),
    );
    positive.forEach((b, i) => {
      b.cents -= cuts[i]!;
    });
  }
  return positive.filter((b) => b.cents > 0).sort(compareMix);
}

function compareMix(a: InvoiceMix, b: InvoiceMix): number {
  const rank = (m: InvoiceMix) => (m.category === null && !m.charges ? 1 : 0);
  if (rank(a) !== rank(b)) return rank(a) - rank(b);
  return b.cents - a.cents || mixLabel(a).localeCompare(mixLabel(b), 'pt-BR');
}

const mixLabel = (m: Pick<InvoiceMix, 'category' | 'charges'>) => (m.charges ? CARD_CHARGES_CATEGORY : (m.category ?? NO_CATEGORY_LABEL));

/** Parte do pagamento de uma fatura em cada categoria (ou nos encargos). */
export interface PaymentShare {
  category: string | null;
  charges: boolean;
  cents: Cents;
}

/**
 * Divide um pagamento de fatura pelas categorias dela, na proporção dos valores, pelo maior resto: a soma é sempre o valor
 * pago. Encargos ficam à parte (charges). Sem composição (fatura vazia ou dado antigo), tudo em "Sem categoria".
 */
export function distributeInvoicePayment(paymentCents: Cents, mix: readonly InvoiceMix[]): PaymentShare[] {
  if (!isInt(paymentCents) || paymentCents < 0) throw new RangeError(`pagamento inválido: ${paymentCents}`);
  const weights = mix.map((m) => m.cents);
  if (paymentCents === 0) return [];
  if (weights.reduce((a, b) => a + b, 0) <= 0) return [{ category: null, charges: false, cents: paymentCents }];
  const shares = sharesCents(paymentCents, weights);
  return mix.map((m, i) => ({ category: m.category, charges: m.charges, cents: shares[i]! })).filter((s) => s.cents > 0);
}

const lineOfEntry = (e: CardEntry, extra: Partial<InvoiceLine>): InvoiceLine => ({
  key: e.id,
  entryId: e.id,
  kind: 'parcela',
  description: e.description ?? '',
  category: e.category,
  amountCents: e.amountCents,
  chargeType: null,
  installmentNumber: null,
  installmentCount: null,
  purchasedOn: null,
  label: null,
  version: e.version,
  ...extra,
});

/** Situação: com pagamento, paga (valor igual ao total) ou paga em parte; sem ele, aberta até o dia do fechamento e fechada depois. */
export function invoiceSituation(args: { closingOn: IsoDate; today: IsoDate; totalCents: Cents; paidCents: Cents | null }): InvoiceSituation {
  if (args.paidCents !== null) return args.paidCents >= args.totalCents ? 'paga' : 'paga_em_parte';
  return args.today <= args.closingOn ? 'aberta' : 'fechada';
}

interface InvoiceBase {
  card: InvoiceCard;
  month: IsoMonth;
  today: IsoDate;
}

function makeInvoice(
  { card, month, today }: InvoiceBase,
  parts: { lines: InvoiceLine[]; mix: InvoiceMix[]; commitment: InvoiceCommitmentView | null },
): Invoice {
  const { lines, commitment } = parts;
  const sum = (kind: InvoiceLineKind) => lines.filter((l) => l.kind === kind).reduce((acc, l) => acc + l.amountCents, 0);
  const installmentsCents = sum('parcela');
  const chargesCents = sum('encargo');
  const balanceCents = sum('saldo_anterior');
  const refundsCents = 0 - sum('estorno');
  const creditInCents = 0 - sum('credito_anterior');
  const rawCents = installmentsCents + chargesCents + balanceCents - refundsCents - creditInCents;
  const totalCents = Math.max(0, rawCents);
  const closingOn = invoiceClosingOn(card, month);
  const period = invoicePeriod(card, month);
  const payment = commitment && commitment.status === 'quitado' ? commitment.payment : null;
  const situation = invoiceSituation({ closingOn, today, totalCents, paidCents: payment ? payment.amountCents : null });
  const remainingCents = situation === 'paga_em_parte' ? totalCents - payment!.amountCents : 0;
  const mix = totalCents > 0 ? parts.mix : [];
  let unpaidMix: InvoiceMix[] = [];
  if (situation === 'paga_em_parte') {
    const paidShares = distributeInvoicePayment(payment!.amountCents, mix);
    const paid = new Map(paidShares.map((s) => [mixKey(s), s.cents]));
    unpaidMix = mix.map((m) => ({ ...m, cents: m.cents - (paid.get(mixKey(m)) ?? 0) })).filter((m) => m.cents > 0);
  }
  return {
    cardId: card.id,
    month,
    closingOn,
    dueOn: invoiceDueOn(card, month),
    periodStartOn: period.startOn,
    periodEndOn: period.endOn,
    lines,
    installmentsCents,
    chargesCents,
    balanceCents,
    refundsCents,
    creditInCents,
    rawCents,
    totalCents,
    creditOutCents: Math.max(0, -rawCents),
    situation,
    estimated: situation === 'aberta',
    isFuture: period.startOn > today,
    commitmentId: commitment ? commitment.id : null,
    commitmentVersion: commitment ? commitment.version : null,
    paidCents: payment ? payment.amountCents : null,
    paidOn: payment ? payment.paidOn : null,
    paymentRecordId: payment ? payment.recordId : null,
    paidAccountId: payment ? payment.accountId : null,
    remainingCents,
    mix,
    unpaidMix,
  };
}

/**
 * Faturas do cartão com lançamento ou conta a pagar, do mês mais antigo ao mais recente.
 * - entries: listCardEntries(cartão) (vivos, de todos os meses; o estorno automático e o saldo anterior já vêm gravados);
 * - commitments: listInvoiceCommitments(cartão) (a conta de cada fatura com total maior que zero, abertas e pagas);
 * - today: o dia da pessoa (situação).
 * O saldo anterior de um pagamento parcial herda a composição por categoria da parte que ficou sem pagar.
 */
export function buildInvoices(
  card: InvoiceCard,
  entries: readonly CardEntry[],
  commitments: readonly InvoiceCommitmentView[],
  today: IsoDate,
): Invoice[] {
  const byMonth = new Map<IsoMonth, InvoiceLine[]>();
  const push = (month: IsoMonth, line: InvoiceLine) => byMonth.set(month, [...(byMonth.get(month) ?? []), line]);
  const ordered = entries.filter((e) => e.cardId === card.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  for (const e of ordered) {
    switch (e.kind) {
      case 'compra':
        for (const p of purchaseInstallments(e)) {
          push(
            p.invoiceMonth,
            lineOfEntry(e, {
              key: `${e.id}:${p.number}`,
              kind: 'parcela',
              amountCents: p.amountCents,
              installmentNumber: p.number,
              installmentCount: p.count,
              purchasedOn: e.purchasedOn,
              label: p.count > 1 ? `parcela ${p.number} de ${p.count}` : null,
            }),
          );
        }
        break;
      case 'encargo':
        push(e.invoiceMonth, lineOfEntry(e, { kind: 'encargo', description: e.chargeType ? CARD_CHARGE_LABEL[e.chargeType] : 'Encargo', chargeType: e.chargeType }));
        break;
      case 'estorno':
        // Estorno automático (sourceMonth): o crédito da fatura anterior, levado a esta.
        if (e.sourceMonth) push(e.invoiceMonth, lineOfEntry(e, { kind: 'credito_anterior', description: CREDIT_DESCRIPTION, category: null, amountCents: -e.amountCents }));
        else push(e.invoiceMonth, lineOfEntry(e, { kind: 'estorno', amountCents: -e.amountCents }));
        break;
      case 'saldo_anterior':
        push(e.invoiceMonth, lineOfEntry(e, { kind: 'saldo_anterior', description: BALANCE_DESCRIPTION, category: null }));
        break;
      default:
        break;
    }
  }
  const commitmentOf = new Map<IsoMonth, InvoiceCommitmentView>();
  for (const c of commitments) if (c.invoice && c.invoice.cardId === card.id) commitmentOf.set(c.invoice.month, c);
  const months = [...new Set([...byMonth.keys(), ...commitmentOf.keys()])].sort();
  if (months.length === 0) return [];
  const last = months[months.length - 1]!;
  const out: Invoice[] = [];
  let previous: Invoice | null = null;
  for (let month = months[0]!; month <= last; month = addMonths(month, 1)) {
    const lines = [...(byMonth.get(month) ?? [])].sort(
      (a, b) =>
        LINE_ORDER[a.kind] - LINE_ORDER[b.kind] ||
        (a.kind === 'parcela' && b.kind === 'parcela' ? (a.purchasedOn ?? '').localeCompare(b.purchasedOn ?? '') : 0),
    );
    const commitment = commitmentOf.get(month) ?? null;
    if (lines.length === 0 && !commitment) {
      previous = null;
      continue;
    }
    const buckets = new Map<string, InvoiceMix>();
    const balanceCents = lines.filter((l) => l.kind === 'saldo_anterior').reduce((acc, l) => acc + l.amountCents, 0);
    for (const l of lines) {
      if (l.kind === 'parcela' || l.kind === 'estorno') addMix(buckets, { category: l.category, charges: false }, l.amountCents);
      else if (l.kind === 'encargo') addMix(buckets, { category: null, charges: true }, l.amountCents);
      else if (l.kind === 'credito_anterior') addMix(buckets, { category: null, charges: false }, l.amountCents);
    }
    // Saldo anterior: herda a composição do que ficou sem pagar da fatura anterior; sem ela, "Sem categoria".
    if (balanceCents > 0) {
      const inherited = previous && previous.remainingCents === balanceCents && previous.month === addMonths(month, -1) ? previous.unpaidMix : null;
      if (inherited) for (const m of inherited) addMix(buckets, m, m.cents);
      else addMix(buckets, { category: null, charges: false }, balanceCents);
    }
    const invoice = makeInvoice({ card, month, today }, { lines, mix: normalizeMix(buckets), commitment });
    out.push(invoice);
    previous = invoice;
  }
  return out;
}

/** A fatura do mês: a calculada ou, sem lançamento nenhum, uma vazia (para mostrar a fatura atual de um cartão novo). */
export function invoiceFor(card: InvoiceCard, invoices: readonly Invoice[], month: IsoMonth, today: IsoDate): Invoice {
  return (
    invoices.find((i) => i.month === month) ??
    makeInvoice({ card, month, today }, { lines: [], mix: [], commitment: null })
  );
}

/** Limite usado: totais das faturas ainda não pagas (abertas e fechadas, de todos os meses, inclusive as futuras com parcelas). */
export function cardLimitUsed(invoices: readonly Invoice[]): Cents {
  return invoices.filter((i) => i.situation === 'aberta' || i.situation === 'fechada').reduce((acc, i) => acc + i.totalCents, 0);
}

/** A fatura como a visão invoice_items a devolve (totais sem as linhas). */
export function invoiceItemOf(i: Invoice): InvoiceItem {
  return {
    cardId: i.cardId,
    month: i.month,
    closingOn: i.closingOn,
    dueOn: i.dueOn,
    status: i.situation,
    totalCents: i.rawCents,
    purchasesCents: i.installmentsCents,
    chargesCents: i.chargesCents,
    carriedInCents: i.balanceCents,
    refundsCents: i.refundsCents + i.creditInCents,
    creditCents: i.creditOutCents,
    entryCount: i.lines.length,
    commitmentId: i.commitmentId,
    commitmentVersion: i.commitmentVersion,
    amountIsEstimate: i.estimated,
    toPayCents: i.commitmentId !== null && i.paidCents === null ? i.totalCents : 0,
    paidRecordId: i.paymentRecordId,
    paidCents: i.paidCents,
    paidOn: i.paidOn,
    paidAccountId: i.paidAccountId,
    leftOverCents: i.paidCents === null ? null : i.totalCents - i.paidCents,
  };
}

export interface CardSummary {
  card: Card;
  /** Fatura que acumula as compras de hoje (o período contém hoje). */
  current: Invoice;
  /** Faturas fechadas, ainda sem pagamento e com total maior que zero, da mais antiga à mais nova. */
  closedUnpaid: Invoice[];
  limitUsedCents: Cents;
  /** Limite menos usado; negativo quando o usado passa do limite. null sem limite. */
  limitLeftCents: Cents | null;
}

export function summarizeCard(card: Card, invoices: readonly Invoice[], today: IsoDate): CardSummary {
  const used = cardLimitUsed(invoices);
  return {
    card,
    current: invoiceFor(card, invoices, invoiceMonthOf(card, today), today),
    closedUnpaid: invoices.filter((i) => i.situation === 'fechada' && i.totalCents > 0),
    limitUsedCents: used,
    limitLeftCents: card.limitCents === null ? null : card.limitCents - used,
  };
}

// ---------------------------------------------------------------------------
// Leitura a partir do repositório
// ---------------------------------------------------------------------------

type CardReader = Pick<RecordsRepository, 'listCardEntries' | 'listInvoiceCommitments'>;

/** Faturas de um cartão: lançamentos e contas de fatura do repositório, montadas por buildInvoices. */
export async function loadInvoices(repo: CardReader, card: InvoiceCard, today: IsoDate): Promise<Invoice[]> {
  const [entries, commitments] = await Promise.all([repo.listCardEntries(card.id), repo.listInvoiceCommitments(card.id)]);
  return buildInvoices(card, entries, commitments, today);
}

/**
 * Faturas pagas pelos gastos de uma lista (os de pagamento de fatura), para "Por categoria": só os cartões que aparecem.
 * records: o Pago do mês. Cartão excluído ou sem leitura fica de fora (o gasto cai na categoria dele).
 */
export async function loadInvoicesOfRecords(
  repo: CardReader & Pick<RecordsRepository, 'getCard'>,
  records: readonly Pick<FinancialRecord, 'invoice'>[],
  today: IsoDate,
): Promise<Invoice[]> {
  const ids = [...new Set(records.flatMap((r) => (r.invoice ? [r.invoice.cardId] : [])))];
  const out: Invoice[] = [];
  for (const id of ids) {
    const card = await repo.getCard(id);
    if (card) out.push(...(await loadInvoices(repo, card, today)));
  }
  return out;
}

/** O gasto é pagamento de fatura? ("Pagamento de fatura" como origem na lista de registros.) */
export function isInvoicePayment(r: Pick<FinancialRecord, 'invoice'>): boolean {
  return r.invoice !== null && r.invoice !== undefined;
}

/** A conta a pagar é a fatura de um cartão? (Sem "Já paguei", editar nem excluir: abre a fatura.) */
export function isInvoiceCommitment(c: Pick<Commitment, 'invoice'>): boolean {
  return c.invoice !== null && c.invoice !== undefined;
}

/**
 * Partes do pagamento de um gasto de fatura em cada categoria, pela composição da fatura paga; null quando o gasto não é
 * pagamento de fatura ou a fatura não está na lista (o gasto cai na categoria dele).
 */
export function recordShares(r: Pick<FinancialRecord, 'invoice' | 'amountCents'>, invoices: readonly Pick<Invoice, 'cardId' | 'month' | 'mix'>[]): PaymentShare[] | null {
  if (!r.invoice) return null;
  const invoice = invoices.find((i) => i.cardId === r.invoice!.cardId && i.month === r.invoice!.month);
  return invoice ? distributeInvoicePayment(r.amountCents, invoice.mix) : null;
}

// ---------------------------------------------------------------------------
// Formulários (rascunhos digitados) e links
// ---------------------------------------------------------------------------

export type CardField = 'name' | 'lastDigits' | 'closingDay' | 'dueDay' | 'limitText';
export type CardFieldErrors = Partial<Record<CardField, string>>;
export const CARD_FIELD_ORDER: CardField[] = ['name', 'lastDigits', 'closingDay', 'dueDay', 'limitText'];

export interface CardDraft {
  name: string;
  lastDigits: string;
  closingDay: string;
  dueDay: string;
  limitText: string;
}

const FIELD_OF_CODE: Record<CardInputErrorCode, CardField> = {
  apelido_invalido: 'name',
  final_invalido: 'lastDigits',
  dia_de_fechamento_invalido: 'closingDay',
  dia_de_vencimento_invalido: 'dueDay',
  limite_invalido: 'limitText',
};

/** Cartão preenchido na tela de cadastro. "Final" aceita só 4 dígitos (qualquer outro tamanho é recusado, nunca guardado). */
export function validateCardDraft(draft: CardDraft): { ok: true; input: CardInput } | { ok: false; errors: CardFieldErrors; code: CardInputErrorCode } {
  const digits = draft.lastDigits.trim();
  const closing = /^\d{1,2}$/.test(draft.closingDay.trim()) ? Number(draft.closingDay.trim()) : Number.NaN;
  const due = /^\d{1,2}$/.test(draft.dueDay.trim()) ? Number(draft.dueDay.trim()) : Number.NaN;
  const limitText = draft.limitText.trim();
  const limit = limitText === '' ? null : parseBRL(limitText);
  const input: CardInput = {
    name: draft.name.trim(),
    lastDigits: digits === '' ? null : digits,
    closingDay: closing,
    dueDay: due,
    limitCents: limitText === '' ? null : (limit ?? Number.NaN),
  };
  const errors: CardFieldErrors = {};
  // Todos os erros de uma vez, na ordem dos campos; o código devolvido é o primeiro, como no banco.
  for (const code of CARD_INPUT_CODE_ORDER) {
    const probe = { ...DUMMY_CARD, [CODE_PROBE_FIELD[code]]: input[CODE_PROBE_FIELD[code]] } as CardInput;
    if (cardInputError(probe) === code) errors[FIELD_OF_CODE[code]] = CARD_ERROR_TEXT[code];
  }
  const code = cardInputError(input);
  return code ? { ok: false, errors, code } : { ok: true, input };
}

const DUMMY_CARD: CardInput = { name: 'Cartão', lastDigits: null, closingDay: 1, dueDay: 10, limitCents: null };
const CODE_PROBE_FIELD: Record<CardInputErrorCode, keyof CardInput> = {
  apelido_invalido: 'name',
  final_invalido: 'lastDigits',
  dia_de_fechamento_invalido: 'closingDay',
  dia_de_vencimento_invalido: 'dueDay',
  limite_invalido: 'limitCents',
};

export type CardPurchaseField = 'description' | 'amountText' | 'dateText' | 'installmentsText';
export type CardPurchaseFieldErrors = Partial<Record<CardPurchaseField, string>>;

export interface CardPurchaseDraft {
  description: string;
  amountText: string;
  dateText: string;
  category: string | null;
  /** "Em quantas vezes?" (1 a 48). Vazio vale 1. */
  installmentsText: string;
}

/** Compra no cartão digitada em "Anotar gasto" (Forma de pagamento: Cartão de crédito). */
export function validateCardPurchaseDraft(
  draft: CardPurchaseDraft,
  today: IsoDate,
): { ok: true; input: CardPurchaseInput } | { ok: false; errors: CardPurchaseFieldErrors; code: CardPurchaseErrorCode } {
  const total = parseBRL(draft.amountText);
  const purchasedOn = parseDateBR(draft.dateText);
  const text = draft.installmentsText.trim();
  const installments = text === '' ? 1 : /^\d{1,3}$/.test(text) ? Number(text) : Number.NaN;
  const input: CardPurchaseInput = {
    description: draft.description.trim(),
    category: draft.category?.trim() ? draft.category.trim() : null,
    purchasedOn: purchasedOn ?? '',
    totalCents: total ?? Number.NaN,
    installments,
  };
  const code = cardPurchaseError(input, today);
  if (!code) return { ok: true, input };
  const errors: CardPurchaseFieldErrors = {};
  const field: Record<CardPurchaseErrorCode, CardPurchaseField> = {
    valor_invalido: 'amountText',
    valor_acima_do_limite: 'amountText',
    descricao_obrigatoria: 'description',
    descricao_longa: 'description',
    categoria_invalida: 'description',
    parcelas_invalidas: 'installmentsText',
    data_invalida: 'dateText',
    data_futura: 'dateText',
  };
  errors[field[code]] = CARD_ERROR_TEXT[code];
  return { ok: false, errors, code };
}

export interface InvoicePaymentDraft {
  /** 'total' paga o total da fatura; 'outro' usa amountText. */
  mode: 'total' | 'outro';
  amountText: string;
  dateText: string;
}

/** "Pagar fatura": total ou "Outro valor", e a data do pagamento. */
export function validateInvoicePaymentDraft(
  draft: InvoicePaymentDraft,
  invoice: Pick<Invoice, 'totalCents'>,
  today: IsoDate,
): { ok: true; amountCents: Cents; paidOn: IsoDate; partial: boolean } | { ok: false; errors: Partial<Record<'amountText' | 'dateText', string>>; code: InvoicePaymentErrorCode } {
  const amountCents = draft.mode === 'total' ? invoice.totalCents : (parseBRL(draft.amountText) ?? Number.NaN);
  const paidOn = parseDateBR(draft.dateText) ?? '';
  const code = invoicePaymentError({ amountCents, totalCents: invoice.totalCents, paidOn }, today);
  if (code) {
    const field = code === 'valor_invalido' || code === 'valor_acima_da_fatura' ? 'amountText' : 'dateText';
    return { ok: false, errors: { [field]: CARD_ERROR_TEXT[code] }, code };
  }
  return { ok: true, amountCents, paidOn, partial: amountCents < invoice.totalCents };
}

export interface CardChargeDraft {
  chargeType: CardChargeType | null;
  amountText: string;
}

/** "Informar encargos" de uma fatura: tipo e valor. */
export function validateCardChargeDraft(
  draft: CardChargeDraft,
  invoiceMonth: IsoMonth,
  today: IsoDate,
): { ok: true; input: CardChargeInput } | { ok: false; errors: Partial<Record<'chargeType' | 'amountText' | 'month', string>>; code: CardChargeErrorCode } {
  const input: CardChargeInput = {
    chargeType: draft.chargeType as CardChargeType,
    amountCents: parseBRL(draft.amountText) ?? Number.NaN,
    invoiceMonth,
  };
  const code = cardChargeError(input, today);
  if (!code) return { ok: true, input };
  const field = code === 'tipo_de_encargo_invalido' ? 'chargeType' : code === 'mes_invalido' ? 'month' : 'amountText';
  return { ok: false, errors: { [field]: CARD_ERROR_TEXT[code] }, code };
}

export interface CardRefundDraft {
  description: string;
  amountText: string;
  category: string | null;
}

/** "Registrar estorno" numa fatura: descrição, valor e categoria que ele abate. */
export function validateCardRefundDraft(
  draft: CardRefundDraft,
  invoiceMonth: IsoMonth,
  today: IsoDate,
): { ok: true; input: CardRefundInput } | { ok: false; errors: Partial<Record<'description' | 'amountText' | 'month', string>>; code: CardRefundErrorCode } {
  const input = normalizeRefundInput({
    description: draft.description,
    category: draft.category,
    amountCents: parseBRL(draft.amountText) ?? Number.NaN,
    invoiceMonth,
  });
  const code = cardRefundError(input, today);
  if (!code) return { ok: true, input };
  const field = code === 'valor_invalido' || code === 'valor_acima_do_limite' ? 'amountText' : code === 'mes_invalido' ? 'month' : 'description';
  return { ok: false, errors: { [field]: CARD_ERROR_TEXT[code] }, code };
}

/**
 * "Quanto custa pagar só uma parte?": a calculadora "Quanto custa uma dívida?" no modo rotativo com o valor que ficou
 * para a fatura seguinte. O app abre /calcular/custo-da-divida com estes parâmetros. A taxa nunca vem preenchida.
 */
export function partialPaymentCalcLink(remainingCents: Cents): { slug: 'custo-da-divida'; params: Record<string, string> } {
  return { slug: 'custo-da-divida', params: calcLinkParams('custo-da-divida', { tipo: 'rotativo', valorCents: remainingCents, origem: 'fatura' }) };
}

// ---------------------------------------------------------------------------
// Textos
// ---------------------------------------------------------------------------

/** Mês por extenso no texto: "novembro" e, em outro ano que o de hoje, "janeiro de 2027". */
export function invoiceMonthLabel(month: IsoMonth, today: IsoDate): string {
  const name = formatMonthName(month);
  return month.slice(0, 4) === today.slice(0, 4) ? name : `${name} de ${month.slice(0, 4)}`;
}

/** "Fatura Nubank": descrição da conta a pagar da fatura. */
export function invoiceCommitmentDescription(cardName: string): string {
  return `Fatura ${cardName}`;
}

/**
 * "Fatura Nubank (outubro)": descrição do gasto do pagamento da fatura. Com a fatura em outro ano que o do pagamento, o ano
 * entra: "Fatura Nubank (janeiro de 2027)".
 */
export function invoiceRecordDescription(cardName: string, month: IsoMonth, paidOn: IsoDate): string {
  const year = month.slice(0, 4) === paidOn.slice(0, 4) ? '' : ` de ${month.slice(0, 4)}`;
  return `Fatura ${cardName} (${formatMonthName(month)}${year})`;
}

/** "Nubank · final 1234" ou "Nubank". */
export function cardTitle(card: Pick<Card, 'name' | 'lastDigits'>): string {
  return card.lastDigits ? `${card.name} · final ${card.lastDigits}` : card.name;
}

export const INVOICE_SITUATION_LABEL: Readonly<Record<InvoiceSituation, string>> = {
  aberta: 'Aberta',
  fechada: 'Fechada',
  paga: 'Paga',
  paga_em_parte: 'Paga em parte',
};

export const CARD_STATUS_LABEL: Readonly<Record<CardStatus, string>> = { ativo: 'Ativo', arquivado: 'Arquivado' };

/** "Fecha hoje", "Fechou em 03/10" ou "Fecha em 03/11". */
export function closesText(closingOn: IsoDate, today: IsoDate): string {
  if (closingOn === today) return 'Fecha hoje';
  return closingOn < today ? `Fechou em ${formatDayMonth(closingOn)}` : `Fecha em ${formatDayMonth(closingOn)}`;
}

/** "Vence hoje", "Venceu em 10/10" ou "Vence em 10/11". */
export function dueTextOf(dueOn: IsoDate, today: IsoDate): string {
  if (dueOn === today) return 'Vence hoje';
  return dueOn < today ? `Venceu em ${formatDayMonth(dueOn)}` : `Vence em ${formatDayMonth(dueOn)}`;
}

/** "Limite usado: R$ 2.300,00 de R$ 5.000,00" ou, sem limite, "Limite usado: R$ 2.300,00". */
export function limitUsedText(usedCents: Cents, limitCents: Cents | null): string {
  return limitCents === null ? `Limite usado: ${formatBRL(usedCents)}` : `Limite usado: ${formatBRL(usedCents)} de ${formatBRL(limitCents)}`;
}

/** "Esta compra entra na fatura de novembro do Nubank e conta em Pago quando a fatura for paga." */
export function purchaseNotice(invoiceMonth: IsoMonth, cardName: string, today: IsoDate): string {
  return `Esta compra entra na fatura de ${invoiceMonthLabel(invoiceMonth, today)} do ${cardName} e conta em Pago quando a fatura for paga.`;
}

/** Complemento do aviso nas compras parceladas: "A parcela 1 de 10 entra nessa fatura; as outras 9 entram nas faturas seguintes." */
export function installmentsNotice(installments: number, perInstallmentCents: Cents): string {
  if (installments <= 1) return '';
  return `${installments} parcelas, a primeira de ${formatBRL(perInstallmentCents)}. As outras ${installments - 1} entram nas faturas seguintes.`;
}

/** "Ficaram R$ 300,00 para a fatura de dezembro. Juros e encargos do banco entram quando você informar a fatura de dezembro." */
export function partialPaymentText(remainingCents: Cents, nextMonth: IsoMonth, today: IsoDate): string {
  const month = invoiceMonthLabel(nextMonth, today);
  return `Ficaram ${formatBRL(remainingCents)} para a fatura de ${month}. Juros e encargos do banco entram quando você informar a fatura de ${month}.`;
}

/** "Crédito de R$ 80,00 para a próxima fatura" (total negativo). */
export function creditText(creditCents: Cents): string {
  return `Crédito de ${formatBRL(creditCents)} para a próxima fatura`;
}

/** Linha de lançamento na fatura: "Tênis · parcela 3 de 10 · R$ 200,00", "Juros · R$ 12,00", "Estorno · − R$ 30,00". */
export function invoiceLineText(line: InvoiceLine): string {
  const amount = line.amountCents < 0 ? `− ${formatBRL(-line.amountCents)}` : formatBRL(line.amountCents);
  return [line.description, line.label, amount].filter((x): x is string => !!x).join(' · ');
}

/** Textos de uma fatura para a tela, no dia de hoje. */
export interface InvoiceTexts {
  /** "Fatura de novembro" */
  title: string;
  /** "Aberta", "Fechada", "Paga" ou "Paga em parte" */
  situation: string;
  /** "R$ 550,00" (aberta: com "estimado" à parte) */
  total: string;
  /** "Valor estimado: pode mudar com novas compras." quando aberta com total maior que zero; senão null */
  estimated: string | null;
  closes: string;
  due: string;
  /** "Período: 04/10 a 03/11" */
  period: string;
  /** "Pago R$ 250,00 em 08/11/2026" ou null */
  paid: string | null;
  /** Texto do saldo que ficou, com o link da calculadora na tela; null fora do pagamento parcial */
  partial: string | null;
  credit: string | null;
  empty: string | null;
  a11yLabel: string;
}

export function invoiceTexts(invoice: Invoice, today: IsoDate): InvoiceTexts {
  const month = invoiceMonthLabel(invoice.month, today);
  const situation = INVOICE_SITUATION_LABEL[invoice.situation];
  const title = `Fatura de ${month}`;
  const total = formatBRL(invoice.totalCents);
  const closes = closesText(invoice.closingOn, today);
  const due = dueTextOf(invoice.dueOn, today);
  const paid = invoice.paidCents !== null && invoice.paidOn ? `Pago ${formatBRL(invoice.paidCents)} em ${formatDateBR(invoice.paidOn)}` : null;
  return {
    title,
    situation,
    total,
    estimated: invoice.estimated && invoice.totalCents > 0 ? CARDS_TEXT.estimatedNote : null,
    closes,
    due,
    period: `Período: ${formatDayMonth(invoice.periodStartOn)} a ${formatDayMonth(invoice.periodEndOn)}`,
    paid,
    partial: invoice.situation === 'paga_em_parte' ? partialPaymentText(invoice.remainingCents, addMonths(invoice.month, 1), today) : null,
    credit: invoice.creditOutCents > 0 ? creditText(invoice.creditOutCents) : null,
    empty: invoice.lines.length === 0 ? CARDS_TEXT.invoiceEmpty : null,
    a11yLabel: `${title}, ${situation.toLowerCase()}, ${total}. ${closes}. ${due}.`,
  };
}

/** Textos de um cartão na lista. */
export interface CardSummaryTexts {
  title: string;
  /** "Fatura de novembro · R$ 550,00 · Aberta" */
  invoiceLine: string;
  closes: string;
  due: string;
  limit: string;
  /** "Fatura fechada de outubro: R$ 300,00. Vence em 10/10" por fatura fechada sem pagamento */
  closed: string[];
  archived: string | null;
  a11yLabel: string;
}

export function cardSummaryTexts(s: CardSummary, today: IsoDate): CardSummaryTexts {
  const t = invoiceTexts(s.current, today);
  const title = cardTitle(s.card);
  const limit = limitUsedText(s.limitUsedCents, s.card.limitCents);
  const invoiceLine = `${t.title} · ${t.total} · ${t.situation}`;
  const closed = s.closedUnpaid.map((i) => `Fatura fechada de ${invoiceMonthLabel(i.month, today)}: ${formatBRL(i.totalCents)}. ${dueTextOf(i.dueOn, today)}`);
  return {
    title,
    invoiceLine,
    closes: t.closes,
    due: t.due,
    limit,
    closed,
    archived: s.card.status === 'arquivado' ? CARDS_TEXT.archivedBadge : null,
    a11yLabel: `${title}. ${invoiceLine}. ${t.closes}. ${t.due}. ${limit}.${closed.length ? ` ${closed.join('. ')}.` : ''}`,
  };
}

/** Mensagens de erro de cartões, faturas e lançamentos (códigos do banco). Sem "disponível" nem julgamento. */
export const CARD_ERROR_TEXT = {
  ...ERROR_TEXT,
  apelido_invalido: 'Dê um apelido de 1 a 30 caracteres, como Nubank. Não use o número do cartão.',
  final_invalido: 'Informe só os 4 últimos dígitos, sem o número completo.',
  dia_de_fechamento_invalido: 'Informe o dia do fechamento, de 1 a 31.',
  dia_de_vencimento_invalido: 'Informe o dia do vencimento, de 1 a 31.',
  limite_invalido: 'Informe um limite de R$ 1,00 a R$ 9.999.999,99 ou deixe em branco.',
  limite_de_cartoes: 'Você chegou a 20 cartões ativos. Arquive algum para cadastrar outro.',
  cartao_arquivado: 'Este cartão está arquivado. Reative o cartão para anotar compras nele.',
  cartao_com_lancamentos: 'Este cartão tem lançamentos. Arquive o cartão em vez de excluir.',
  descricao_obrigatoria: 'Dê um nome para este lançamento.',
  valor_acima_do_limite: 'O valor máximo por lançamento é R$ 9.999.999,99.',
  parcelas_invalidas: 'Informe de 1 a 48 parcelas, com pelo menos R$ 0,01 em cada.',
  data_invalida: 'Confira a data informada. Ela precisa ser de até 4 anos atrás para compras e de até 1 ano atrás para pagamentos.',
  data_futura: 'Use uma data até hoje. Aqui entram só compras e pagamentos já feitos.',
  tipo_de_encargo_invalido: 'Escolha o tipo do encargo.',
  mes_invalido: 'Escolha uma fatura entre quatro anos atrás e quatro anos à frente.',
  compromisso_quitado: 'Esta fatura já foi paga.',
  compromisso_aberto: 'Este pagamento já foi desfeito.',
  limite_de_lancamentos: 'Este cartão chegou a 5.000 lançamentos. Exclua os que não precisa mais para anotar outros.',
  chave_de_nota_invalida: 'Não foi possível ler a chave da nota. Confira os 44 números ou escaneie de novo.',
  nota_ja_anotada: 'Esta nota já foi anotada.',
  campo_nao_se_aplica: ERROR_TEXT.salvar_falhou,
  valor_acima_da_fatura: 'O valor pago não pode passar do total da fatura.',
  fatura_paga: 'Esta fatura já foi paga. Para mudar os lançamentos dela, desfaça o pagamento da fatura.',
  fatura_seguinte_paga: 'A fatura do mês seguinte já foi paga. Desfaça o pagamento dela antes.',
  conta_de_fatura: 'Esta conta é a fatura de um cartão. Abra a fatura para alterar ou pagar.',
  pagamento_de_fatura: 'Este gasto é o pagamento de uma fatura: só a data e a conta de saída mudam aqui. Para o resto, abra a fatura e desfaça o pagamento.',
  lancamento_automatico: 'O saldo anterior vem do pagamento parcial da fatura anterior. Para mudar, desfaça esse pagamento.',
  situacao_invalida: ERROR_TEXT.salvar_falhou,
  tipo_invalido: ERROR_TEXT.salvar_falhou,
  versao_desatualizada: 'Este cartão ou lançamento foi alterado em outro aparelho. Confira a versão atual antes de salvar.',
  nao_encontrado: 'Este cartão ou lançamento foi excluído. Confira a lista atual.',
  pagar_falhou: 'Não foi possível registrar o pagamento da fatura. Seu preenchimento foi mantido. Tente novamente.',
  desfazer_falhou: 'Não foi possível desfazer o pagamento da fatura. Tente novamente.',
} as const;

/** Texto do código; código desconhecido: falha genérica. */
export function cardErrorText(code: string): string {
  const texts: Record<string, string> = CARD_ERROR_TEXT;
  return code in texts ? texts[code]! : ERROR_TEXT.salvar_falhou;
}

/** Textos fixos e montados de cartões, faturas e compras no cartão. */
export const CARDS_TEXT = {
  title: 'Cartões',
  /** Linha em Movimentos > Organizar. */
  organizeRow: 'Cartões',
  organizeHint: 'Faturas, compras no cartão e limite',
  newCard: 'Cadastrar cartão',
  emptyTitle: 'Nenhum cartão cadastrado',
  emptyBody: 'Cadastre um cartão para anotar as compras na fatura. Elas só contam em Pago quando você pagar a fatura.',
  privacy: 'Guardamos só o apelido e os 4 últimos dígitos. Nunca digite o número completo, o código de segurança nem a validade.',
  archivedBadge: 'Arquivado',
  archivedTitle: 'Cartões arquivados',

  // Formulário do cartão.
  form: {
    newTitle: 'Novo cartão',
    editTitle: 'Editar cartão',
    name: 'Apelido do cartão',
    nameHint: 'Por exemplo: Nubank ou Cartão do mercado',
    lastDigits: 'Últimos 4 dígitos (opcional)',
    lastDigitsHint: 'Só os 4 últimos dígitos. Nunca o número completo, o código de segurança nem a validade.',
    closingDay: 'Dia do fechamento',
    closingHint: 'Compras depois desse dia entram na fatura seguinte.',
    dueDay: 'Dia do vencimento',
    dueHint: 'Se o mês for mais curto, usamos o último dia dele.',
    limit: 'Limite (opcional)',
    save: 'Salvar cartão',
    saved: 'Cartão salvo.',
    archive: 'Arquivar cartão',
    archiveTitle: 'Arquivar este cartão?',
    archiveBody: 'Ele sai da escolha de compras novas. As faturas e o histórico continuam aqui, e você pode reativar quando quiser.',
    archived: 'Cartão arquivado.',
    reactivate: 'Reativar cartão',
    reactivated: 'Cartão reativado.',
    delete: 'Excluir cartão',
    deleteTitle: 'Excluir este cartão?',
    deleteBody: 'Só dá para excluir um cartão sem lançamentos. Com lançamentos, arquive.',
    deleted: 'Cartão excluído.',
    cancel: 'Cancelar',
  },

  // Lista e cartão.
  currentInvoice: 'Fatura atual',
  invoicesTitle: 'Faturas',
  previousInvoices: 'Faturas anteriores',
  nextInvoices: 'Próximas faturas',
  noInvoices: 'Nenhuma compra neste cartão ainda.',
  estimatedNote: 'Valor estimado: pode mudar com novas compras.',
  limitNote: 'O limite usado soma as parcelas das faturas que ainda não foram pagas.',
  openInvoice: 'Abrir fatura',

  // Anotar gasto.
  expense: {
    paymentMethod: 'Forma de pagamento',
    cash: 'Dinheiro, débito ou Pix',
    credit: 'Cartão de crédito',
    chooseCard: 'Escolha o cartão',
    registerCard: 'Cadastrar cartão',
    installments: 'Em quantas vezes?',
    installmentsHint: 'De 1 a 48 parcelas.',
    save: 'Anotar compra no cartão',
    saved: 'Compra anotada no cartão.',
    savedFor: (invoiceMonth: IsoMonth, today: IsoDate) => `Compra anotada na fatura de ${invoiceMonthLabel(invoiceMonth, today)}.`,
  },

  // Fatura.
  invoice: {
    payInvoice: 'Pagar fatura',
    payTotal: 'Pagar o total',
    payOther: 'Outro valor',
    payAmount: 'Valor pago',
    payDate: 'Data do pagamento',
    confirmPay: 'Confirmar pagamento',
    paid: 'Fatura paga.',
    paidPartial: 'Pagamento registrado.',
    addCharges: 'Informar encargos',
    chargesHint: 'Juros, multa, IOF, anuidade ou tarifa que o banco cobrou nesta fatura. O Clarevo não calcula juros sozinho.',
    chargeType: 'Tipo do encargo',
    chargeAmount: 'Valor do encargo',
    addRefund: 'Registrar estorno',
    refundHint: 'Estorno ou devolução de uma compra. O valor abate a categoria escolhida.',
    refundDescription: 'Descrição do estorno',
    refundAmount: 'Valor do estorno',
    refundCategory: 'Categoria que o estorno abate',
    undoPayment: 'Desfazer pagamento',
    undoTitle: 'Desfazer o pagamento desta fatura?',
    undoBody: 'O gasto do pagamento é apagado e a fatura volta a ficar em aberto. O saldo anterior criado na fatura seguinte também sai.',
    undone: 'Pagamento desfeito.',
    calcLink: 'Quanto custa pagar só uma parte?',
    chargesLabel: 'Encargos',
    totalLabel: 'Total da fatura',
    entryDeleted: 'Lançamento excluído.',
    entryDelete: 'Excluir lançamento',
    entryDeleteTitle: 'Excluir este lançamento?',
    entryEdit: 'Editar lançamento',
    automaticEntry: 'Criado pelo pagamento parcial da fatura anterior.',
    derivedCredit: 'Calculado a partir do crédito da fatura anterior.',
    closedInvoiceNote: 'Fatura fechada: o valor só muda se você informar encargos, estornos ou novos lançamentos.',
    paidInvoiceNote: 'Fatura paga: para mudar os lançamentos, desfaça o pagamento.',
    invoiceFormula: 'Total = parcelas + encargos + saldo anterior - estornos',
  },
  invoiceEmpty: 'Sem lançamentos nesta fatura.',

  // Pago e Por categoria.
  paymentOrigin: 'Pagamento de fatura',
  paidNote: 'Compras no cartão só entram em Pago quando a fatura é paga, na data do pagamento.',
  /** Pagamento de fatura nas barras de "Por categoria". */
  chargesCategory: CARD_CHARGES_CATEGORY,
  /** Uma linha na lista de registros: "Fatura Nubank (outubro)". */
  recordLine: (cardName: string, month: IsoMonth, paidOn: IsoDate) => invoiceRecordDescription(cardName, month, paidOn),

  // Aprender: parágrafo do tema "fatura" sobre o cadastro de cartões.
  topicParagraph:
    'Com o cartão cadastrado, as compras vão para a fatura e só contam em Pago quando a fatura é paga. Sem cartão cadastrado, anotar a fatura como conta a pagar continua valendo.',
  /** Links das telas. */
  links: {
    calculator: 'Quanto custa pagar só uma parte?',
    whoSees: 'Quem vê estes dados?',
  },
} as const;
