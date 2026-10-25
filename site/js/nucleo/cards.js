// Gerado por scripts/gerar-site.js a partir de packages/core/src/cards.ts. Não edite: rode "node scripts/gerar-site.js".
import { addDays, addMonths, addYearsClamped, dateInMonth, formatDateBR, formatDayMonth, formatMonthName, isValidIsoDate, isValidIsoMonth, monthOf, parseDateBR, } from './dates.js';
import { effectiveOverdue, nextBusinessDayDueText } from './dia-util.js';
import { sharesCents } from './learn/math.js';
import { MAX_RECORD_CENTS, formatBRL, parseBRL } from './money.js';
import { NO_CATEGORY_LABEL } from './records.js';
import { CATEGORY_MAX, DESCRIPTION_MAX, ERROR_TEXT, charCount } from './validation.js';
import { calcLinkParams } from './calculators/links.js';
export const CARD_NAME_MAX = 30;
export const CARD_LIMIT_MIN_CENTS = 100;
export const CARD_LIMIT_MAX_CENTS = MAX_RECORD_CENTS;
export const CARDS_ACTIVE_MAX = 20;
export const CARD_INSTALLMENTS_MIN = 1;
export const CARD_INSTALLMENTS_MAX = 48;
export const INVOICE_MONTHS_BACK = 48;
export const INVOICE_MONTHS_AHEAD = 48;
export const PURCHASE_MONTHS_BACK = 48;
export const CARD_ENTRIES_MAX = 5000;
export const CARD_CHARGES_CATEGORY = 'Encargos do cartão';
export const CARD_STATUSES = ['ativo', 'arquivado'];
export const CARD_CHARGE_TYPES = ['juros', 'multa', 'iof', 'anuidade', 'tarifa'];
export const CARD_ENTRY_KINDS = ['compra', 'encargo', 'estorno', 'saldo_anterior'];
export const CARD_CHARGE_LABEL = {
    juros: 'Juros',
    multa: 'Multa',
    iof: 'IOF',
    anuidade: 'Anuidade',
    tarifa: 'Tarifa',
};
export const BALANCE_DESCRIPTION = 'Saldo anterior';
export const CREDIT_DESCRIPTION = 'Crédito da fatura anterior';
const isInt = (n) => typeof n === 'number' && Number.isSafeInteger(n);
export function invoiceClosingMonth(card, month) {
    return card.dueDay > card.closingDay ? month : addMonths(month, -1);
}
export function invoiceClosingOn(card, month) {
    return dateInMonth(invoiceClosingMonth(card, month), card.closingDay);
}
export function invoiceDueOn(card, month) {
    return dateInMonth(month, card.dueDay);
}
export function invoicePeriod(card, month) {
    return { startOn: addDays(invoiceClosingOn(card, addMonths(month, -1)), 1), endOn: invoiceClosingOn(card, month) };
}
export function invoiceMonthOf(card, date) {
    const base = monthOf(date);
    for (let i = 0; i <= 2; i++) {
        const month = addMonths(base, i);
        if (date <= invoiceClosingOn(card, month))
            return month;
    }
    return addMonths(base, 2);
}
export function installmentAmounts(totalCents, count) {
    if (!isInt(totalCents) || totalCents < 0 || !isInt(count) || count < 1)
        throw new RangeError(`parcelas inválidas: ${totalCents} em ${count}`);
    const base = Math.floor(totalCents / count);
    const rest = totalCents - base * count;
    return Array.from({ length: count }, (_, i) => (i === 0 ? base + rest : base));
}
export function purchaseInstallments(entry) {
    return installmentAmounts(entry.amountCents, entry.installments).map((amountCents, i) => ({
        entryId: entry.id,
        number: i + 1,
        count: entry.installments,
        amountCents,
        invoiceMonth: addMonths(entry.invoiceMonth, i),
    }));
}
export function purchaseFirstInvoiceMonth(card, purchasedOn, ..._legacy) {
    return invoiceMonthOf(card, purchasedOn);
}
export function paidInvoiceMonths(invoices) {
    return invoices.filter((i) => i.situation === 'paga' || i.situation === 'paga_em_parte').map((i) => i.month);
}
export function purchaseBlockedByPaidInvoice(firstMonth, installments, paidMonths) {
    const paid = new Set(paidMonths);
    const count = Math.max(1, installments);
    for (let k = 0; k < count; k++)
        if (paid.has(addMonths(firstMonth, k)))
            return true;
    return false;
}
export function purchasePreview(card, purchasedOn, installments, paidMonths, today) {
    const first = invoiceMonthOf(card, purchasedOn);
    if (purchaseBlockedByPaidInvoice(first, installments, paidMonths))
        return { text: CARDS_TEXT.expense.paidInvoicePurchase, blocked: true };
    return { text: purchaseNotice(first, card.name, today), blocked: false };
}
export const REFUND_EDIT_MAX = 3;
export function refundEditChoices(entries, paidMonths, refundMonth, max = REFUND_EDIT_MAX) {
    const paid = new Set(paidMonths);
    return entries
        .filter((e) => e.kind === 'compra' && e.invoiceMonth <= refundMonth && !purchaseBlockedByPaidInvoice(e.invoiceMonth, e.installments, paid))
        .sort((a, b) => (b.purchasedOn ?? '').localeCompare(a.purchasedOn ?? '') || (a.description ?? '').localeCompare(b.description ?? '', 'pt-BR') || a.id.localeCompare(b.id))
        .slice(0, Math.max(0, max))
        .map((e) => ({ entryId: e.id, description: e.description ?? '', amountCents: e.amountCents, installments: e.installments, invoiceMonth: e.invoiceMonth }));
}
export function invoiceCanBePaid(invoice) {
    return invoice.situation === 'fechada' && invoice.commitmentId !== null && invoice.totalCents > 0;
}
export const CARD_INPUT_CODE_ORDER = [
    'apelido_invalido',
    'final_invalido',
    'dia_de_fechamento_invalido',
    'dia_de_vencimento_invalido',
    'limite_invalido',
];
export function cardInputError(input) {
    const name = input.name;
    if (typeof name !== 'string' || name !== name.trim() || charCount(name) < 1 || charCount(name) > CARD_NAME_MAX)
        return 'apelido_invalido';
    if (looksLikeCardNumber(name))
        return 'apelido_invalido';
    if (input.lastDigits !== null && (typeof input.lastDigits !== 'string' || !/^\d{4}$/.test(input.lastDigits)))
        return 'final_invalido';
    if (!isInt(input.closingDay) || input.closingDay < 1 || input.closingDay > 31)
        return 'dia_de_fechamento_invalido';
    if (!isInt(input.dueDay) || input.dueDay < 1 || input.dueDay > 31)
        return 'dia_de_vencimento_invalido';
    if (input.limitCents !== null && (!isInt(input.limitCents) || input.limitCents < CARD_LIMIT_MIN_CENTS || input.limitCents > CARD_LIMIT_MAX_CENTS)) {
        return 'limite_invalido';
    }
    return null;
}
export function looksLikeCardNumber(text) {
    for (const chain of text.match(/[0-9]{3,}(?:[ .,/_-][0-9]{3,})*/g) ?? []) {
        const sizes = chain.split(/[^0-9]/).map((g) => g.length);
        for (let i = 0; i < sizes.length; i++) {
            let sum = 0;
            for (let j = i; j < sizes.length; j++) {
                sum += sizes[j];
                if (sum >= 13 && (sum <= 19 || j === i))
                    return true;
                if (sum > 19)
                    break;
            }
        }
    }
    return false;
}
export function normalizeCardInput(input) {
    const digits = typeof input.lastDigits === 'string' ? input.lastDigits.trim() : input.lastDigits;
    return {
        name: typeof input.name === 'string' ? input.name.trim() : input.name,
        lastDigits: digits === '' || digits === undefined ? null : digits,
        closingDay: input.closingDay,
        dueDay: input.dueDay,
        limitCents: input.limitCents ?? null,
    };
}
export function purchaseMinDate(today) {
    return `${addMonths(monthOf(today), -PURCHASE_MONTHS_BACK)}-01`;
}
function textAmountError(amountCents, description, category) {
    if (!isInt(amountCents) || amountCents < 1)
        return 'valor_invalido';
    if (amountCents > MAX_RECORD_CENTS)
        return 'valor_acima_do_limite';
    if (typeof description !== 'string' || description.length === 0)
        return 'descricao_obrigatoria';
    if (charCount(description) > DESCRIPTION_MAX)
        return 'descricao_longa';
    if (category && charCount(category) > CATEGORY_MAX)
        return 'categoria_invalida';
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
];
export function cardPurchaseError(input, today, checkRange = true) {
    const base = textAmountError(input.totalCents, input.description, input.category);
    if (base)
        return base;
    if (!isInt(input.installments) || input.installments < CARD_INSTALLMENTS_MIN || input.installments > CARD_INSTALLMENTS_MAX || input.totalCents < input.installments) {
        return 'parcelas_invalidas';
    }
    if (typeof input.purchasedOn !== 'string' || !isValidIsoDate(input.purchasedOn) || (checkRange && input.purchasedOn < purchaseMinDate(today))) {
        return 'data_invalida';
    }
    if (input.purchasedOn > today)
        return 'data_futura';
    return null;
}
export function invoiceMonthError(month, today, checkRange = true) {
    if (typeof month !== 'string' || !isValidIsoMonth(month))
        return 'mes_invalido';
    if (!checkRange)
        return null;
    const current = monthOf(today);
    return month < addMonths(current, -INVOICE_MONTHS_BACK) || month > addMonths(current, INVOICE_MONTHS_AHEAD) ? 'mes_invalido' : null;
}
export const CARD_CHARGE_CODE_ORDER = ['tipo_de_encargo_invalido', 'valor_invalido', 'valor_acima_do_limite', 'mes_invalido'];
export function cardChargeError(input, today, checkRange = true) {
    if (!CARD_CHARGE_TYPES.includes(input.chargeType))
        return 'tipo_de_encargo_invalido';
    if (!isInt(input.amountCents) || input.amountCents < 1)
        return 'valor_invalido';
    if (input.amountCents > MAX_RECORD_CENTS)
        return 'valor_acima_do_limite';
    return invoiceMonthError(input.invoiceMonth, today, checkRange);
}
export const CARD_REFUND_CODE_ORDER = [
    'valor_invalido',
    'valor_acima_do_limite',
    'descricao_obrigatoria',
    'descricao_longa',
    'categoria_invalida',
    'mes_invalido',
];
export function cardRefundError(input, today, checkRange = true) {
    return textAmountError(input.amountCents, input.description, input.category) ?? invoiceMonthError(input.invoiceMonth, today, checkRange);
}
export const INVOICE_PAYMENT_CODE_ORDER = ['valor_invalido', 'valor_acima_da_fatura', 'data_invalida', 'data_futura'];
export function invoicePaymentError(input, today) {
    if (!isInt(input.amountCents) || input.amountCents < 1)
        return 'valor_invalido';
    if (input.amountCents > input.totalCents)
        return 'valor_acima_da_fatura';
    const oneYearAgo = addYearsClamped(today, -1);
    const earliest = input.periodStartOn && input.periodStartOn < oneYearAgo ? input.periodStartOn : oneYearAgo;
    if (typeof input.paidOn !== 'string' || !isValidIsoDate(input.paidOn) || input.paidOn < earliest)
        return 'data_invalida';
    if (input.paidOn > today)
        return 'data_futura';
    return null;
}
export function receiptKeyValid(digest) {
    return typeof digest === 'string' && /^[0-9a-f]{64}$/.test(digest);
}
export function normalizePurchaseInput(input) {
    return {
        description: typeof input.description === 'string' ? input.description.trim() : input.description,
        category: input.category?.trim() ? input.category.trim() : null,
        purchasedOn: input.purchasedOn,
        totalCents: input.totalCents,
        installments: input.installments,
        receiptKey: input.receiptKey?.trim() ? input.receiptKey.trim() : null,
    };
}
export function normalizeRefundInput(input) {
    return {
        description: typeof input.description === 'string' ? input.description.trim() : input.description,
        category: input.category?.trim() ? input.category.trim() : null,
        amountCents: input.amountCents,
        invoiceMonth: input.invoiceMonth,
    };
}
const LINE_ORDER = { saldo_anterior: 0, credito_anterior: 1, parcela: 2, encargo: 3, estorno: 4 };
const mixKey = (m) => (m.charges ? '\u0000encargos' : m.category === null ? '\u0000sem' : m.category);
function addMix(buckets, bucket, cents) {
    const key = mixKey(bucket);
    const current = buckets.get(key);
    if (current)
        current.cents += cents;
    else
        buckets.set(key, { category: bucket.charges ? null : bucket.category, charges: bucket.charges, cents });
}
function normalizeMix(buckets) {
    const all = [...buckets.values()];
    const positive = all.filter((b) => b.cents > 0).map((b) => ({ ...b }));
    const deficit = all.filter((b) => b.cents < 0).reduce((acc, b) => acc - b.cents, 0);
    const positiveSum = positive.reduce((acc, b) => acc + b.cents, 0);
    if (positiveSum <= deficit)
        return [];
    if (deficit > 0) {
        const cuts = sharesCents(deficit, positive.map((b) => b.cents));
        positive.forEach((b, i) => {
            b.cents -= cuts[i];
        });
    }
    return positive.filter((b) => b.cents > 0).sort(compareMix);
}
function compareMix(a, b) {
    const rank = (m) => (m.category === null && !m.charges ? 1 : 0);
    if (rank(a) !== rank(b))
        return rank(a) - rank(b);
    return b.cents - a.cents || mixLabel(a).localeCompare(mixLabel(b), 'pt-BR');
}
const mixLabel = (m) => (m.charges ? CARD_CHARGES_CATEGORY : (m.category ?? NO_CATEGORY_LABEL));
export function distributeInvoicePayment(paymentCents, mix) {
    if (!isInt(paymentCents) || paymentCents < 0)
        throw new RangeError(`pagamento inválido: ${paymentCents}`);
    const weights = mix.map((m) => m.cents);
    if (paymentCents === 0)
        return [];
    if (weights.reduce((a, b) => a + b, 0) <= 0)
        return [{ category: null, charges: false, cents: paymentCents }];
    const shares = sharesCents(paymentCents, weights);
    return mix.map((m, i) => ({ category: m.category, charges: m.charges, cents: shares[i] })).filter((s) => s.cents > 0);
}
const lineOfEntry = (e, extra) => ({
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
export function invoiceSituation(args) {
    if (args.paidCents !== null)
        return args.paidCents >= args.totalCents ? 'paga' : 'paga_em_parte';
    return args.today <= args.closingOn ? 'aberta' : 'fechada';
}
function makeInvoice({ card, month, today }, parts) {
    const { lines, commitment } = parts;
    const sum = (kind) => lines.filter((l) => l.kind === kind).reduce((acc, l) => acc + l.amountCents, 0);
    const installmentsCents = sum('parcela');
    const chargesCents = sum('encargo');
    const balanceCents = sum('saldo_anterior');
    const refundsCents = 0 - sum('estorno');
    const creditInCents = 0 - sum('credito_anterior');
    const rawCents = installmentsCents + chargesCents + balanceCents - refundsCents - creditInCents;
    const totalCents = Math.max(0, rawCents);
    const closingOn = commitment?.invoice ? commitment.invoice.closingOn : invoiceClosingOn(card, month);
    const dueOn = commitment ? commitment.dueOn : invoiceDueOn(card, month);
    const period = { startOn: invoicePeriod(card, month).startOn, endOn: closingOn };
    const payment = commitment && commitment.status === 'quitado' ? commitment.payment : null;
    const situation = invoiceSituation({ closingOn, today, totalCents, paidCents: payment ? payment.amountCents : null });
    const remainingCents = situation === 'paga_em_parte' ? totalCents - payment.amountCents : 0;
    const mix = totalCents > 0 ? parts.mix : [];
    let unpaidMix = [];
    if (situation === 'paga_em_parte') {
        const paidShares = distributeInvoicePayment(payment.amountCents, mix);
        const paid = new Map(paidShares.map((s) => [mixKey(s), s.cents]));
        unpaidMix = mix.map((m) => ({ ...m, cents: m.cents - (paid.get(mixKey(m)) ?? 0) })).filter((m) => m.cents > 0);
    }
    return {
        cardId: card.id,
        month,
        closingOn,
        dueOn,
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
        overdue: situation === 'fechada' && totalCents > 0 && effectiveOverdue(dueOn, 'fatura', today),
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
export function buildInvoices(card, entries, commitments, today) {
    const byMonth = new Map();
    const push = (month, line) => byMonth.set(month, [...(byMonth.get(month) ?? []), line]);
    const ordered = entries.filter((e) => e.cardId === card.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    for (const e of ordered) {
        switch (e.kind) {
            case 'compra':
                for (const p of purchaseInstallments(e)) {
                    push(p.invoiceMonth, lineOfEntry(e, {
                        key: `${e.id}:${p.number}`,
                        kind: 'parcela',
                        amountCents: p.amountCents,
                        installmentNumber: p.number,
                        installmentCount: p.count,
                        purchasedOn: e.purchasedOn,
                        label: p.count > 1 ? `parcela ${p.number} de ${p.count}` : null,
                    }));
                }
                break;
            case 'encargo':
                push(e.invoiceMonth, lineOfEntry(e, { kind: 'encargo', description: e.chargeType ? CARD_CHARGE_LABEL[e.chargeType] : 'Encargo', chargeType: e.chargeType }));
                break;
            case 'estorno':
                if (e.sourceMonth)
                    push(e.invoiceMonth, lineOfEntry(e, { kind: 'credito_anterior', description: CREDIT_DESCRIPTION, category: null, amountCents: -e.amountCents }));
                else
                    push(e.invoiceMonth, lineOfEntry(e, { kind: 'estorno', amountCents: -e.amountCents }));
                break;
            case 'saldo_anterior':
                push(e.invoiceMonth, lineOfEntry(e, { kind: 'saldo_anterior', description: BALANCE_DESCRIPTION, category: null }));
                break;
            default:
                break;
        }
    }
    const commitmentOf = new Map();
    for (const c of commitments)
        if (c.invoice && c.invoice.cardId === card.id)
            commitmentOf.set(c.invoice.month, c);
    const months = [...new Set([...byMonth.keys(), ...commitmentOf.keys()])].sort();
    if (months.length === 0)
        return [];
    const last = months[months.length - 1];
    const out = [];
    let previous = null;
    for (let month = months[0]; month <= last; month = addMonths(month, 1)) {
        const lines = [...(byMonth.get(month) ?? [])].sort((a, b) => LINE_ORDER[a.kind] - LINE_ORDER[b.kind] ||
            (a.kind === 'parcela' && b.kind === 'parcela' ? (a.purchasedOn ?? '').localeCompare(b.purchasedOn ?? '') : 0));
        const commitment = commitmentOf.get(month) ?? null;
        if (lines.length === 0 && !commitment) {
            previous = null;
            continue;
        }
        const buckets = new Map();
        const balanceCents = lines.filter((l) => l.kind === 'saldo_anterior').reduce((acc, l) => acc + l.amountCents, 0);
        for (const l of lines) {
            if (l.kind === 'parcela' || l.kind === 'estorno')
                addMix(buckets, { category: l.category, charges: false }, l.amountCents);
            else if (l.kind === 'encargo')
                addMix(buckets, { category: null, charges: true }, l.amountCents);
            else if (l.kind === 'credito_anterior')
                addMix(buckets, { category: null, charges: false }, l.amountCents);
        }
        if (balanceCents > 0) {
            const inherited = previous && previous.remainingCents === balanceCents && previous.month === addMonths(month, -1) ? previous.unpaidMix : null;
            if (inherited)
                for (const m of inherited)
                    addMix(buckets, m, m.cents);
            else
                addMix(buckets, { category: null, charges: false }, balanceCents);
        }
        const invoice = makeInvoice({ card, month, today }, { lines, mix: normalizeMix(buckets), commitment });
        out.push(invoice);
        previous = invoice;
    }
    return out;
}
export function invoiceFor(card, invoices, month, today) {
    return (invoices.find((i) => i.month === month) ??
        makeInvoice({ card, month, today }, { lines: [], mix: [], commitment: null }));
}
export function cardLimitUsed(invoices) {
    return invoices.filter((i) => i.situation === 'aberta' || i.situation === 'fechada').reduce((acc, i) => acc + i.totalCents, 0);
}
export function invoiceItemOf(i) {
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
export function currentInvoiceOf(card, invoices, today) {
    return invoiceFor(card, invoices, invoiceMonthOf(card, today), today);
}
export function summarizeCard(card, invoices, today) {
    const used = cardLimitUsed(invoices);
    return {
        card,
        current: currentInvoiceOf(card, invoices, today),
        closedUnpaid: invoices.filter((i) => i.situation === 'fechada' && i.totalCents > 0),
        limitUsedCents: used,
        limitLeftCents: card.limitCents === null ? null : card.limitCents - used,
    };
}
export async function loadInvoices(repo, card, today) {
    const [entries, commitments] = await Promise.all([repo.listCardEntries(card.id), repo.listInvoiceCommitments(card.id)]);
    return buildInvoices(card, entries, commitments, today);
}
export async function loadInvoicesOfRecords(repo, records, today) {
    const ids = [...new Set(records.flatMap((r) => (r.invoice ? [r.invoice.cardId] : [])))];
    const out = [];
    for (const id of ids) {
        const card = await repo.getCard(id);
        if (card)
            out.push(...(await loadInvoices(repo, card, today)));
    }
    return out;
}
export function isInvoicePayment(r) {
    return r.invoice !== null && r.invoice !== undefined;
}
export function isInvoiceCommitment(c) {
    return c.invoice !== null && c.invoice !== undefined;
}
export function recordShares(r, invoices) {
    if (!r.invoice)
        return null;
    const invoice = invoices.find((i) => i.cardId === r.invoice.cardId && i.month === r.invoice.month);
    return invoice ? distributeInvoicePayment(r.amountCents, invoice.mix) : null;
}
export const CARD_FIELD_ORDER = ['name', 'lastDigits', 'closingDay', 'dueDay', 'limitText'];
const FIELD_OF_CODE = {
    apelido_invalido: 'name',
    final_invalido: 'lastDigits',
    dia_de_fechamento_invalido: 'closingDay',
    dia_de_vencimento_invalido: 'dueDay',
    limite_invalido: 'limitText',
};
export function validateCardDraft(draft) {
    const digits = draft.lastDigits.trim();
    const closing = /^\d{1,2}$/.test(draft.closingDay.trim()) ? Number(draft.closingDay.trim()) : Number.NaN;
    const due = /^\d{1,2}$/.test(draft.dueDay.trim()) ? Number(draft.dueDay.trim()) : Number.NaN;
    const limitText = draft.limitText.trim();
    const limit = limitText === '' ? null : parseBRL(limitText);
    const input = {
        name: draft.name.trim(),
        lastDigits: digits === '' ? null : digits,
        closingDay: closing,
        dueDay: due,
        limitCents: limitText === '' ? null : (limit ?? Number.NaN),
    };
    const errors = {};
    for (const code of CARD_INPUT_CODE_ORDER) {
        const probe = { ...DUMMY_CARD, [CODE_PROBE_FIELD[code]]: input[CODE_PROBE_FIELD[code]] };
        if (cardInputError(probe) === code)
            errors[FIELD_OF_CODE[code]] = cardErrorText(code, { nickname: input.name });
    }
    const code = cardInputError(input);
    return code ? { ok: false, errors, code } : { ok: true, input };
}
const DUMMY_CARD = { name: 'Cartão', lastDigits: null, closingDay: 1, dueDay: 10, limitCents: null };
const CODE_PROBE_FIELD = {
    apelido_invalido: 'name',
    final_invalido: 'lastDigits',
    dia_de_fechamento_invalido: 'closingDay',
    dia_de_vencimento_invalido: 'dueDay',
    limite_invalido: 'limitCents',
};
export function validateCardPurchaseDraft(draft, today, checkRange = true) {
    const total = parseBRL(draft.amountText);
    const purchasedOn = parseDateBR(draft.dateText);
    const text = draft.installmentsText.trim();
    const installments = text === '' ? 1 : /^\d{1,3}$/.test(text) ? Number(text) : Number.NaN;
    const input = {
        description: draft.description.trim(),
        category: draft.category?.trim() ? draft.category.trim() : null,
        purchasedOn: purchasedOn ?? '',
        totalCents: total ?? Number.NaN,
        installments,
    };
    const code = cardPurchaseError(input, today, checkRange);
    if (!code)
        return { ok: true, input };
    const errors = {};
    const field = {
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
export function validateInvoicePaymentDraft(draft, invoice, today) {
    const amountCents = draft.mode === 'total' ? invoice.totalCents : (parseBRL(draft.amountText) ?? Number.NaN);
    const paidOn = parseDateBR(draft.dateText) ?? '';
    const code = invoicePaymentError({ amountCents, totalCents: invoice.totalCents, paidOn, periodStartOn: invoice.periodStartOn }, today);
    if (code) {
        const field = code === 'valor_invalido' || code === 'valor_acima_da_fatura' ? 'amountText' : 'dateText';
        return { ok: false, errors: { [field]: CARD_ERROR_TEXT[code] }, code };
    }
    return { ok: true, amountCents, paidOn, partial: amountCents < invoice.totalCents };
}
export function validateCardChargeDraft(draft, invoiceMonth, today) {
    const input = {
        chargeType: draft.chargeType,
        amountCents: parseBRL(draft.amountText) ?? Number.NaN,
        invoiceMonth,
    };
    const code = cardChargeError(input, today);
    if (!code)
        return { ok: true, input };
    const field = code === 'tipo_de_encargo_invalido' ? 'chargeType' : code === 'mes_invalido' ? 'month' : 'amountText';
    return { ok: false, errors: { [field]: CARD_ERROR_TEXT[code] }, code };
}
export function validateCardRefundDraft(draft, invoiceMonth, today) {
    const input = normalizeRefundInput({
        description: draft.description,
        category: draft.category,
        amountCents: parseBRL(draft.amountText) ?? Number.NaN,
        invoiceMonth,
    });
    const code = cardRefundError(input, today);
    if (!code)
        return { ok: true, input };
    const field = code === 'valor_invalido' || code === 'valor_acima_do_limite' ? 'amountText' : code === 'mes_invalido' ? 'month' : 'description';
    return { ok: false, errors: { [field]: CARD_ERROR_TEXT[code] }, code };
}
export function partialPaymentCalcLink(remainingCents) {
    return { slug: 'custo-da-divida', params: calcLinkParams('custo-da-divida', { tipo: 'rotativo', valorCents: remainingCents, origem: 'fatura' }) };
}
export function invoiceMonthLabel(month, today) {
    const name = formatMonthName(month);
    return month.slice(0, 4) === today.slice(0, 4) ? name : `${name} de ${month.slice(0, 4)}`;
}
export function invoiceCommitmentDescription(cardName) {
    return `Fatura ${cardName}`;
}
export function invoiceRecordDescription(cardName, month, paidOn) {
    const year = month.slice(0, 4) === paidOn.slice(0, 4) ? '' : ` de ${month.slice(0, 4)}`;
    return `Fatura ${cardName} (${formatMonthName(month)}${year})`;
}
export function cardTitle(card) {
    return card.lastDigits ? `${card.name} · final ${card.lastDigits}` : card.name;
}
export const INVOICE_SITUATION_LABEL = {
    aberta: 'Aberta',
    fechada: 'Fechada',
    paga: 'Paga',
    paga_em_parte: 'Paga em parte',
};
export const INVOICE_OVERDUE_LABEL = 'Vencida';
export function invoiceSituationLabel(invoice) {
    return invoice.overdue ? INVOICE_OVERDUE_LABEL : INVOICE_SITUATION_LABEL[invoice.situation];
}
export const CARD_STATUS_LABEL = { ativo: 'Ativo', arquivado: 'Arquivado' };
export function closesText(closingOn, today) {
    if (closingOn === today)
        return 'Fecha hoje';
    return closingOn < today ? `Fechou em ${formatDayMonth(closingOn)}` : `Fecha em ${formatDayMonth(closingOn)}`;
}
export function dueTextOf(dueOn, today) {
    const grace = nextBusinessDayDueText(dueOn, 'fatura', today);
    if (grace)
        return grace;
    if (dueOn === today)
        return 'Vence hoje';
    return dueOn < today ? `Venceu em ${formatDayMonth(dueOn)}` : `Vence em ${formatDayMonth(dueOn)}`;
}
export function limitUsedText(usedCents, limitCents) {
    return limitCents === null ? `Limite usado: ${formatBRL(usedCents)}` : `Limite usado: ${formatBRL(usedCents)} de ${formatBRL(limitCents)}`;
}
export function purchaseNotice(invoiceMonth, cardName, today) {
    return `Esta compra entra na fatura de ${invoiceMonthLabel(invoiceMonth, today)} do ${cardName} e conta em Pago quando a fatura for paga.`;
}
export function installmentsNotice(installments, perInstallmentCents) {
    if (installments <= 1)
        return '';
    return `${installments} parcelas, a primeira de ${formatBRL(perInstallmentCents)}. As outras ${installments - 1} entram nas faturas seguintes.`;
}
export function partialPaymentText(remainingCents, nextMonth, today) {
    const month = invoiceMonthLabel(nextMonth, today);
    return `Ficaram ${formatBRL(remainingCents)} para a fatura de ${month}. Juros e encargos do banco entram quando você informar a fatura de ${month}.`;
}
export function creditText(creditCents) {
    return `Crédito de ${formatBRL(creditCents)} para a próxima fatura`;
}
export function invoiceLineText(line) {
    const amount = line.amountCents < 0 ? `− ${formatBRL(-line.amountCents)}` : formatBRL(line.amountCents);
    return [line.description, line.label, amount].filter((x) => !!x).join(' · ');
}
export function invoiceTexts(invoice, today) {
    const month = invoiceMonthLabel(invoice.month, today);
    const situation = invoiceSituationLabel(invoice);
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
        payHint: invoice.situation === 'aberta' && invoice.commitmentId !== null && invoice.totalCents > 0 ? CARDS_TEXT.invoice.payAfterClosing(invoice.closingOn) : null,
        a11yLabel: `${title}, ${situation.toLowerCase()}, ${total}. ${closes}. ${due}.`,
    };
}
export function cardSummaryTexts(s, today) {
    const t = invoiceTexts(s.current, today);
    const title = cardTitle(s.card);
    const limit = limitUsedText(s.limitUsedCents, s.card.limitCents);
    const invoiceLine = `${t.title} · ${t.total} · ${t.situation}`;
    const closed = s.closedUnpaid.map((i) => `Fatura ${i.overdue ? 'vencida' : 'fechada'} de ${invoiceMonthLabel(i.month, today)}: ${formatBRL(i.totalCents)}. ${dueTextOf(i.dueOn, today)}`);
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
export const CARD_ERROR_TEXT = {
    ...ERROR_TEXT,
    apelido_invalido: 'Dê um apelido de 1 a 30 caracteres, como Nubank.',
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
    data_invalida: 'Confira a data informada. Compras podem ser de até 4 anos atrás. Pagamentos, de até 1 ano atrás ou, numa fatura mais antiga, a partir do começo do período dela.',
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
    fatura_aberta: 'Esta fatura ainda está aberta. Registre o pagamento depois do fechamento. Se você já pagou antes, use a data em que pagou.',
    fatura_seguinte_paga: 'A fatura do mês seguinte já foi paga. Desfaça o pagamento dela antes.',
    dias_com_fatura_paga: 'Há uma fatura paga neste período. Para mudar os dias de fechamento e vencimento, desfaça esse pagamento ou espere a próxima fatura.',
    conta_de_fatura: 'Esta conta é a fatura de um cartão. Abra a fatura para alterar ou pagar.',
    pagamento_de_fatura: 'Este gasto é o pagamento de uma fatura: só a data e a conta de saída mudam aqui. Para o resto, abra a fatura e desfaça o pagamento.',
    lancamento_automatico: 'O saldo anterior vem do pagamento parcial da fatura anterior. Para mudar, desfaça esse pagamento.',
    situacao_invalida: ERROR_TEXT.salvar_falhou,
    tipo_invalido: ERROR_TEXT.salvar_falhou,
    versao_desatualizada: 'Este cartão ou lançamento foi alterado em outro aparelho. Confira a versão atual antes de salvar.',
    nao_encontrado: 'Este cartão ou lançamento foi excluído. Confira a lista atual.',
    pagar_falhou: 'Não foi possível registrar o pagamento da fatura. Seu preenchimento foi mantido. Tente novamente.',
    desfazer_falhou: 'Não foi possível desfazer o pagamento da fatura. Tente novamente.',
};
export function cardErrorText(code, context = {}) {
    if (code === 'apelido_invalido' && typeof context.nickname === 'string' && looksLikeCardNumber(context.nickname)) {
        return CARDS_TEXT.form.nameHasNumber;
    }
    if (code === 'fatura_paga' && context.purchase)
        return CARDS_TEXT.expense.paidInvoicePurchase;
    if (code === 'fatura_aberta' && context.closingOn)
        return CARDS_TEXT.invoice.payAfterClosing(context.closingOn);
    const texts = CARD_ERROR_TEXT;
    return code in texts ? texts[code] : ERROR_TEXT.salvar_falhou;
}
export const CARDS_TEXT = {
    title: 'Cartões',
    organizeRow: 'Cartões',
    organizeHint: 'Faturas, compras no cartão e limite',
    newCard: 'Cadastrar cartão',
    emptyTitle: 'Nenhum cartão cadastrado',
    emptyBody: 'Cadastre um cartão para anotar as compras na fatura. Elas só contam em Pago quando você pagar a fatura.',
    privacy: 'Guardamos só o apelido e os 4 últimos dígitos. Nunca digite o número completo, o código de segurança nem a validade.',
    archivedBadge: 'Arquivado',
    archivedTitle: 'Cartões arquivados',
    form: {
        newTitle: 'Novo cartão',
        editTitle: 'Editar cartão',
        name: 'Apelido do cartão',
        nameHint: 'Por exemplo: Nubank ou Cartão do mercado',
        nameHasNumber: 'Não use o número do cartão no apelido. Use os 4 últimos dígitos no campo próprio.',
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
    currentInvoice: 'Fatura atual',
    invoicesTitle: 'Faturas',
    previousInvoices: 'Faturas anteriores',
    nextInvoices: 'Próximas faturas',
    noInvoices: 'Nenhuma compra neste cartão ainda.',
    estimatedNote: 'Valor estimado: pode mudar com novas compras.',
    limitNote: 'O limite usado soma as parcelas das faturas que ainda não foram pagas.',
    openInvoice: 'Abrir fatura',
    expense: {
        paymentMethod: 'Forma de pagamento',
        cash: 'Dinheiro, débito ou Pix',
        credit: 'Cartão de crédito',
        chooseCard: 'Escolha o cartão',
        paidInvoicePurchase: 'Esta compra é de uma fatura já paga. Se o banco cobrou depois, registre como encargo ou ajuste na fatura atual, em Informar encargos.',
        registerCard: 'Cadastrar cartão',
        installments: 'Em quantas vezes?',
        installmentsHint: 'De 1 a 48 parcelas.',
        save: 'Anotar compra no cartão',
        saved: 'Compra anotada no cartão.',
        savedFor: (invoiceMonth, today) => `Compra anotada na fatura de ${invoiceMonthLabel(invoiceMonth, today)}.`,
    },
    invoice: {
        payInvoice: 'Pagar fatura',
        payAfterClosing: (closingOn) => `Esta fatura ainda está aberta. Registre o pagamento depois do fechamento, em ${formatDateBR(closingOn)}. Se você já pagou antes, use a data em que pagou.`,
        payTotal: 'Pagar o total',
        payOther: 'Outro valor',
        payAmount: 'Valor pago',
        payDate: 'Data do pagamento',
        confirmPay: 'Confirmar pagamento',
        paid: 'Fatura paga.',
        paidPartial: 'Pagamento registrado.',
        addCharges: 'Informar encargos',
        chargesHint: 'Juros, multa, IOF, anuidade ou tarifa que o banco cobrou nesta fatura. A Clarevo não calcula juros sozinha.',
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
        purchaseEdit: 'Editar compra',
        automaticEntry: 'Criado pelo pagamento parcial da fatura anterior.',
        derivedCredit: 'Calculado a partir do crédito da fatura anterior.',
        closedInvoiceNote: 'Fatura fechada: o valor só muda se você informar encargos, estornos ou novos lançamentos.',
        paidInvoiceNote: 'Fatura paga: só a descrição e a categoria das compras mudam. Para mudar o resto, desfaça o pagamento.',
        purchaseEditPaid: 'Editar descrição e categoria',
        invoiceFormula: 'Total = parcelas + encargos + saldo anterior - estornos',
    },
    invoiceEmpty: 'Sem lançamentos nesta fatura.',
    refundBudget: {
        rule: 'O estorno conta no mês da fatura em que foi informado e, por isso, o usado do mês da compra no orçamento não diminui.',
        editInstead: 'Se nenhuma fatura da compra foi paga, corrija o valor em Editar compra, em vez de registrar um estorno.',
        editA11y: (description, amountCents, installments) => `Editar compra ${description}, ${formatBRL(amountCents)}${installments > 1 ? ` em ${installments} vezes` : ''}`,
        editCaption: (amountCents, installments) => `${formatBRL(amountCents)}${installments > 1 ? ` em ${installments}x` : ''}`,
    },
    paymentOrigin: 'Pagamento de fatura',
    paidNote: 'Compras no cartão só entram em Pago quando a fatura é paga, na data do pagamento.',
    chargesCategory: CARD_CHARGES_CATEGORY,
    recordLine: (cardName, month, paidOn) => invoiceRecordDescription(cardName, month, paidOn),
    topicParagraph: 'Com o cartão cadastrado, as compras vão para a fatura e só contam em Pago quando a fatura é paga. Sem cartão cadastrado, anotar a fatura como conta a pagar continua valendo.',
    rotativoParagraph: 'Na Clarevo, se você paga só uma parte da fatura, o que ficou aparece como saldo anterior na fatura seguinte, sem juros. Os juros e encargos entram quando você informar a fatura do banco. A Clarevo não calcula juros sozinha.',
    links: {
        calculator: 'Quanto custa pagar só uma parte?',
        whoSees: 'Quem vê estes dados?',
    },
    screens: {
        listIntro: 'Cadastre seus cartões para anotar as compras na fatura. Elas só contam em Pago quando você paga a fatura.',
        openCardHint: 'Abre o cartão e as faturas',
        openInvoiceHint: 'Abre a fatura',
        cardHeader: 'Cartão',
        invoiceHeader: 'Fatura',
        organizeNone: 'Nenhum cadastrado. Anote compras na fatura',
        noteOnCard: 'Anotar compra neste cartão',
        deleteBlocked: 'Um cartão com lançamentos não pode ser excluído. Arquive em vez de excluir.',
        futureLegend: 'As parcelas das compras já anotadas entram nas faturas seguintes.',
        entriesTitle: 'Lançamentos',
        compositionTitle: 'Como o total é formado',
        installmentsLine: 'Parcelas de compras',
        chargesLine: 'Encargos',
        balanceLine: 'Saldo anterior',
        refundsLine: 'Estornos',
        creditLine: 'Crédito da fatura anterior',
        totalLine: 'Total da fatura',
        noPayable: 'Esta fatura não tem valor a pagar.',
        entryMenuTitle: 'Lançamento',
        entryDeleteBody: 'O valor sai da fatura e o total dela é recalculado.',
        entryDeletePurchaseBody: 'A compra inteira sai das faturas, com todas as parcelas, e os totais são recalculados.',
        editEntryHint: 'Abre as ações do lançamento',
        payTitle: 'Pagar fatura',
        payMonthNote: 'O valor pago entra em Pago no mês da data do pagamento, e a fatura sai de Ainda a pagar.',
        payAccount: 'Conta de onde saiu o pagamento',
        chargeTitle: 'Informar encargos',
        chargeEditTitle: 'Editar encargo',
        chargeSave: 'Salvar encargo',
        chargeSaved: 'Encargo anotado na fatura.',
        chargeUpdated: 'Encargo atualizado.',
        refundTitle: 'Registrar estorno',
        refundEditTitle: 'Editar estorno',
        refundSave: 'Salvar estorno',
        refundSaved: 'Estorno registrado na fatura.',
        refundUpdated: 'Estorno atualizado.',
        refundDescriptionPlaceholder: 'Ex.: Devolução do tênis',
        purchaseEditTitle: 'Editar compra',
        purchaseSave: 'Salvar compra',
        purchaseUpdated: 'Compra alterada. As parcelas foram recalculadas.',
        purchaseTextUpdated: 'Compra alterada.',
        purchaseEditPaidNote: 'Esta compra tem parcelas em uma fatura já paga. Aqui você muda só a descrição e a categoria. Para mudar valor, data ou parcelas, desfaça o pagamento da fatura.',
        purchaseEditNote: 'Mudar o valor, a data ou as parcelas recalcula as parcelas e pode mudar as faturas em que a compra aparece.',
        purchaseFromReceipt: 'Compra anotada com a leitura de uma nota fiscal.',
        noCardsInline: 'Você ainda não cadastrou um cartão.',
        cardPurchaseNote: 'Compra no cartão não entra em Pago agora: ela entra quando a fatura for paga.',
        payHow: 'Como você pagou?',
        paymentRecordNote: 'Este gasto é o pagamento de uma fatura. Para mudar ou desfazer o pagamento, abra a fatura.',
        notStarted: 'Ainda não começou',
        purchaseDateLabel: 'Data da compra',
        purchaseSituation: 'Compra no cartão',
        registerHint: 'Depois de cadastrar, você volta para anotar a compra.',
        archivedNote: 'Este cartão está arquivado. As faturas e o histórico continuam aqui.',
        categoryInvoiceNote: 'O pagamento de uma fatura entra dividido pelas categorias das compras dela. Juros, multa e outras cobranças do banco ficam em Encargos do cartão.',
    },
};
