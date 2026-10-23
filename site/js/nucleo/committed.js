// Gerado por scripts/gerar-site.js a partir de packages/core/src/committed.ts. Não edite: rode "node scripts/gerar-site.js".
import { addMonths, formatMonthBR, formatMonthName, formatMonthYearBR, isValidIsoMonth, monthOf, monthRange } from './dates.js';
import { formatInteger } from './learn/format.js';
import { monthlyShareCents, percentTenths, sharesCents } from './learn/math.js';
import { MAX_RECORD_CENTS, formatBRL, parseBRL, roundDiv } from './money.js';
import { DEBT_NATURES } from './records.js';
import { isCommitmentOverdue } from './dia-util.js';
import { annualYearOf, projectSeries, seriesMonthOf, seriesYearlyTotal, termFor } from './series.js';
import { ERROR_TEXT } from './validation.js';
export const UPCOMING_COMMITTED_MONTHS = 6;
export const REFERENCE_MONTHS_BACK = 24;
export const REFERENCE_MONTHS_AHEAD = 12;
export const DEBT_REFERENCE = {
    permille: 300,
    publisher: 'Serasa',
    description: 'página sobre comprometimento de renda',
    url: 'https://www.serasa.com.br/credito/blog/comprometimento-renda/',
    consultedOn: '2026-10-09',
};
export const COMMITTED_GROUPS = ['fixos', 'anuais', 'parcelamentos', 'faturas', 'outras'];
function unknownKind(kind) {
    throw new Error(`serie_inconsistente: ${String(kind)}`);
}
function groupOfKind(kind) {
    switch (kind) {
        case null:
            return 'outras';
        case 'mensal':
            return 'fixos';
        case 'anual':
            return 'anuais';
        case 'parcelada':
            return 'parcelamentos';
        default:
            return unknownKind(kind);
    }
}
export function committedGroupOf(c) {
    if (c.invoice)
        return 'faturas';
    return groupOfKind(c.series ? c.series.kind : null);
}
const isDebtNature = (nature) => DEBT_NATURES.includes(nature);
export function isDebtCommitment(c) {
    return c.series !== null && c.series.kind === 'parcelada' && isDebtNature(c.series.nature);
}
export function committedValueOf(c) {
    return c.status === 'quitado' && c.payment ? c.payment.amountCents : c.amountCents;
}
export function referenceFor(refs, month) {
    let best = null;
    for (const r of refs)
        if (r.fromMonth <= month && (!best || r.fromMonth > best.fromMonth))
            best = r;
    return best;
}
export function committedPermille(cents, referenceCents) {
    return referenceCents === null ? null : percentTenths(cents, referenceCents);
}
export function formatPermille(permille, committedCents) {
    if (!Number.isSafeInteger(permille) || permille < 0)
        throw new RangeError(`milésimos inválidos: ${permille}`);
    if (committedCents > 0 && permille === 0)
        return 'menos de 0,1%';
    return `${formatInteger(Math.floor(permille / 10))},${permille % 10}%`;
}
export function annualShare(series, today) {
    const { totalCents, estimatedCents } = seriesYearlyTotal(series, today);
    if (totalCents <= 0)
        return null;
    return { yearlyCents: totalCents, monthlyCents: monthlyShareCents(totalCents, 12), estimated: estimatedCents > 0 };
}
export function committedMeter(paidCents, openCents, referenceCents) {
    if (referenceCents === null || referenceCents <= 0)
        return null;
    const total = Math.min(1000, percentTenths(paidCents + openCents, referenceCents));
    const paid = Math.min(total, percentTenths(paidCents, referenceCents));
    return { paidPermille: paid, openPermille: total - paid, over: paidCents + openCents > referenceCents };
}
const emptyTotals = () => ({ fixos: 0, anuais: 0, parcelamentos: 0, faturas: 0, outras: 0, debt: 0, committed: 0, paid: 0, open: 0, estimatedOpen: 0 });
function addTo(t, group, debt, value, paid, estimate) {
    t[group] += value;
    if (debt)
        t.debt += value;
    t.committed += value;
    if (paid)
        t.paid += value;
    else {
        t.open += value;
        if (estimate)
            t.estimatedOpen += value;
    }
}
const byDue = (a, b) => a.dueOn.localeCompare(b.dueOn) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
export function summarizeCommitted(list, contextId, month, today, refs, series = []) {
    const isCurrentMonth = monthOf(today) === month;
    const { start } = monthRange(month);
    const own = list.filter((c) => c.contextId === contextId).sort(byDue);
    const inMonth = own.filter((c) => monthOf(c.dueOn) === month);
    const items = { fixos: [], anuais: [], parcelamentos: [], faturas: [], outras: [] };
    const t = emptyTotals();
    for (const c of inMonth) {
        const group = committedGroupOf(c);
        items[group].push(c);
        addTo(t, group, isDebtCommitment(c), committedValueOf(c), c.status === 'quitado', c.amountIsEstimate);
    }
    const overdueBefore = isCurrentMonth ? own.filter((c) => c.status === 'aberto' && c.dueOn < start) : [];
    const reference = referenceFor(refs.filter((r) => r.contextId === contextId), month);
    const ref = reference?.amountCents ?? null;
    return {
        contextId,
        month,
        isCurrentMonth,
        fixedCents: t.fixos,
        annualCents: t.anuais,
        installmentCents: t.parcelamentos,
        debtCents: t.debt,
        cardCents: t.faturas,
        otherCents: t.outras,
        committedCents: t.committed,
        paidPartCents: t.paid,
        openPartCents: t.open,
        estimatedOpenCents: t.estimatedOpen,
        overdueBeforeCents: overdueBefore.reduce((acc, c) => acc + c.amountCents, 0),
        overdueBeforeAllLate: overdueBefore.every((c) => isCommitmentOverdue(c, today)),
        reference,
        referenceCents: ref,
        referenceFrom: reference?.fromMonth ?? null,
        committedPermille: committedPermille(t.committed, ref),
        fixedPermille: committedPermille(t.fixos, ref),
        annualPermille: committedPermille(t.anuais, ref),
        installmentPermille: committedPermille(t.parcelamentos, ref),
        cardPermille: committedPermille(t.faturas, ref),
        otherPermille: committedPermille(t.outras, ref),
        debtPermille: committedPermille(t.debt, ref),
        outsideCents: ref === null ? null : ref - t.committed,
        overReference: ref !== null && t.committed > ref,
        items,
        overdueBefore,
        count: inMonth.length,
        annualShare: annualShare(series.filter((s) => s.contextId === contextId), today),
        needsReview: reference !== null && reference.varies && reference.fromMonth < month,
        meter: committedMeter(t.paid, t.open, ref),
    };
}
export function upcomingCommittedMonths(month, count = UPCOMING_COMMITTED_MONTHS) {
    return Array.from({ length: count }, (_, i) => addMonths(month, i + 1));
}
const MILESTONE_ORDER = ['novo_valor', 'conta_do_ano', 'ultima_conta', 'ultima_parcela'];
const money = (cents, approximate) => (approximate ? `cerca de ${formatBRL(cents)}` : formatBRL(cents));
function milestoneText(m) {
    const when = formatMonthBR(m.month);
    switch (m.kind) {
        case 'novo_valor':
            return `${when}: ${m.description} passa a ${money(m.amountCents, m.approximate)}.`;
        case 'conta_do_ano':
            return m.parts === 1
                ? `${when}: ${m.description}, ${money(m.amountCents, m.approximate)}.`
                : `${when}: ${m.description}, ${m.parts} parcelas de ${money(m.amountCents, m.approximate)}.`;
        case 'ultima_conta':
            return `${when}: última conta de ${m.description} (${money(m.amountCents, m.approximate)}).`;
        case 'ultima_parcela':
            return `${when}: última parcela de ${m.description} (${money(m.amountCents, m.approximate)}).`;
        default:
            return unknownKind(m.kind);
    }
}
function projectionMonth(month, t, planned, reference) {
    const ref = reference?.amountCents ?? null;
    const permille = committedPermille(t.committed, ref);
    const pct = permille === null ? null : formatPermille(permille, t.committed);
    const name = formatMonthBR(month);
    const estimated = t.estimatedOpen > 0 ? `, inclui ${formatBRL(t.estimatedOpen)} em valores estimados` : '';
    return {
        month,
        fixedCents: t.fixos,
        annualCents: t.anuais,
        installmentCents: t.parcelamentos,
        debtCents: t.debt,
        cardCents: t.faturas,
        otherCents: t.outras,
        committedCents: t.committed,
        paidPartCents: t.paid,
        estimatedCents: t.estimatedOpen,
        plannedCents: planned,
        reference,
        committedPermille: permille,
        annualPermille: committedPermille(t.anuais, ref),
        debtPermille: committedPermille(t.debt, ref),
        meter: committedMeter(t.paid, t.open, ref),
        text: pct === null ? `${name} · ${formatBRL(t.committed)}` : `${name} · ${formatBRL(t.committed)} · ${pct}`,
        a11yLabel: `${name}, previsto: ${formatBRL(t.committed)} em contas` +
            (pct === null ? '' : `, ${pct} da renda de referência`) +
            `${estimated}.`,
    };
}
export function projectCommitted(series, dueList, refs, months, today) {
    const sorted = [...new Set(months)].filter(isValidIsoMonth).sort();
    if (sorted.length === 0)
        return { months: [], milestones: [] };
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const current = monthOf(today);
    const byId = new Map(series.map((s) => [s.id, s]));
    const milestones = [];
    const push = (m) => milestones.push({ ...m, text: milestoneText(m) });
    const annualMilestone = (s, n, month, description, amountCents, approximate) => {
        const year = annualYearOf(s, n);
        const firstOfYear = Math.max(year.firstNumber, s.firstNumber);
        if (n !== firstOfYear)
            return;
        const lastOfYear = s.lastNumber === null ? year.lastNumber : Math.min(year.lastNumber, s.lastNumber);
        const skipped = new Set(s.skippedNumbers);
        let parts = 0;
        for (let x = firstOfYear; x <= lastOfYear; x++)
            if (!skipped.has(x))
                parts += 1;
        push({ kind: 'conta_do_ano', month, seriesId: s.id, description, amountCents, approximate, parts: Math.max(parts, 1) });
    };
    const out = sorted.map((month) => {
        const t = emptyTotals();
        let planned = 0;
        for (const c of dueList) {
            if (monthOf(c.dueOn) !== month)
                continue;
            const value = committedValueOf(c);
            addTo(t, committedGroupOf(c), isDebtCommitment(c), value, c.status === 'quitado', c.amountIsEstimate);
            const s = c.series ? byId.get(c.series.id) : undefined;
            if (s && s.kind === 'anual')
                annualMilestone(s, c.series.number, month, c.description, value, c.status === 'aberto' && c.amountIsEstimate);
        }
        if (month >= current) {
            for (const s of series) {
                for (const p of projectSeries(s, dueList, month, month)) {
                    addTo(t, groupOfKind(s.kind), s.kind === 'parcelada' && isDebtNature(s.nature), p.amountCents, false, p.amountIsEstimate);
                    planned += p.amountCents;
                    if (s.kind === 'anual')
                        annualMilestone(s, p.number, month, p.description, p.amountCents, p.amountIsEstimate);
                }
            }
        }
        return projectionMonth(month, t, planned, referenceFor(refs, month));
    });
    for (const s of series) {
        const terms = [...s.terms].sort((a, b) => a.fromNumber - b.fromNumber);
        for (let i = 1; i < terms.length; i++) {
            const term = terms[i];
            if (term.fromNumber <= s.firstNumber || (s.lastNumber !== null && term.fromNumber > s.lastNumber))
                continue;
            if (term.amountCents === terms[i - 1].amountCents)
                continue;
            const month = seriesMonthOf(s, term.fromNumber);
            if (month < first || month > last || month < current)
                continue;
            push({
                kind: 'novo_valor',
                month,
                seriesId: s.id,
                description: term.description,
                amountCents: term.amountCents,
                approximate: term.amountMode === 'variavel',
                parts: 1,
            });
        }
        if (s.kind === 'anual' || s.lastNumber === null || s.lastNumber < s.firstNumber)
            continue;
        const month = seriesMonthOf(s, s.lastNumber);
        if (month < first || month < current)
            continue;
        const term = termFor(s.terms, s.lastNumber);
        if (!term)
            continue;
        push({
            kind: s.kind === 'parcelada' ? 'ultima_parcela' : 'ultima_conta',
            month,
            seriesId: s.id,
            description: term.description,
            amountCents: term.amountCents,
            approximate: term.amountMode === 'variavel',
            parts: 1,
        });
    }
    milestones.sort((a, b) => a.month.localeCompare(b.month) ||
        MILESTONE_ORDER.indexOf(a.kind) - MILESTONE_ORDER.indexOf(b.kind) ||
        a.description.localeCompare(b.description, 'pt-BR'));
    return { months: out, milestones };
}
export const isReimbursement = (category) => category !== null && category.trim().toLocaleLowerCase('pt-BR') === 'reembolso';
export function suggestReference(records, currentMonth) {
    const closed = [-3, -2, -1].map((d) => addMonths(currentMonth, d));
    const totals = new Map();
    for (const r of records) {
        const m = monthOf(r.occurredOn);
        if (r.kind !== 'receita' || !closed.includes(m) || isReimbursement(r.category))
            continue;
        totals.set(m, (totals.get(m) ?? 0) + r.amountCents);
    }
    const months = closed.filter((m) => (totals.get(m) ?? 0) > 0);
    if (months.length === 0)
        return null;
    const sum = months.reduce((acc, m) => acc + totals.get(m), 0);
    return { amountCents: roundDiv(sum, months.length), months };
}
function joinList(items) {
    if (items.length <= 1)
        return items[0] ?? '';
    return `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`;
}
function monthsText(months) {
    const sameYear = months.every((m) => m.slice(0, 4) === months[0].slice(0, 4));
    return joinList(months.map((m) => (sameYear ? formatMonthName(m) : formatMonthYearBR(m))));
}
function monthNear(month, other) {
    return month.slice(0, 4) === other.slice(0, 4) ? formatMonthName(month) : formatMonthYearBR(month);
}
export function referenceMonthBounds(today) {
    const m = monthOf(today);
    return { min: addMonths(m, -REFERENCE_MONTHS_BACK), max: addMonths(m, REFERENCE_MONTHS_AHEAD) };
}
export function referenceMonthError(month, today) {
    if (typeof month !== 'string' || !isValidIsoMonth(month))
        return 'mes_invalido';
    const { min, max } = referenceMonthBounds(today);
    return month < min || month > max ? 'referencia_fora_do_intervalo' : null;
}
export function referenceMonthChoices(today) {
    const m = monthOf(today);
    return [-1, 0, 1].map((d) => {
        const month = addMonths(m, d);
        const name = formatMonthName(month);
        const label = `${name.charAt(0).toUpperCase()}${name.slice(1)}${month.slice(0, 4) === m.slice(0, 4) ? '' : ` de ${month.slice(0, 4)}`}`;
        return { month, label, isDefault: d === 0 };
    });
}
export const INCOME_REFERENCE_ERROR_TEXT = {
    ...ERROR_TEXT,
    valor_invalido: 'Informe um valor maior que zero, como 6.000,00.',
    valor_acima_do_limite: 'O valor máximo é R$ 9.999.999,99.',
    mes_invalido: 'Escolha um mês entre dois anos atrás e os próximos 12 meses.',
    referencia_fora_do_intervalo: 'Escolha um mês entre dois anos atrás e os próximos 12 meses.',
    versao_desatualizada: 'A renda de referência deste mês foi alterada em outro aparelho. Confira o valor atual antes de salvar.',
    nao_encontrado: 'Esta renda de referência foi excluída. Confira as referências atuais.',
    tipo_invalido: ERROR_TEXT.salvar_falhou,
};
export function validateIncomeReferenceDraft(draft, today) {
    const errors = {};
    const monthError = referenceMonthError(draft.fromMonth, today);
    if (monthError)
        errors.fromMonth = INCOME_REFERENCE_ERROR_TEXT[monthError];
    const cents = parseBRL(draft.amountText);
    if (cents === null || cents < 1)
        errors.amountText = INCOME_REFERENCE_ERROR_TEXT.valor_invalido;
    else if (cents > MAX_RECORD_CENTS)
        errors.amountText = INCOME_REFERENCE_ERROR_TEXT.valor_acima_do_limite;
    if (errors.fromMonth || errors.amountText)
        return { ok: false, errors };
    return { ok: true, fromMonth: draft.fromMonth, amountCents: cents, varies: draft.varies };
}
export function paymentsForecast(paidCents, toPay) {
    if (!toPay.isCurrentMonth || toPay.toPayCents <= 0)
        return null;
    const totalCents = paidCents + toPay.toPayCents;
    return {
        month: toPay.month,
        totalCents,
        estimatedCents: toPay.estimatedCents,
        text: COMMITTED_TEXT.forecast(toPay.month, totalCents),
        estimatedText: toPay.estimatedCents > 0 ? COMMITTED_TEXT.forecastEstimated(toPay.estimatedCents) : null,
    };
}
const pctOrNull = (permille, cents) => (permille === null ? null : formatPermille(permille, cents));
export function groupPermilleShares(s) {
    const cents = {
        fixos: Math.max(0, s.fixedCents),
        anuais: Math.max(0, s.annualCents),
        parcelamentos: Math.max(0, s.installmentCents),
        faturas: Math.max(0, s.cardCents),
        outras: Math.max(0, s.otherCents),
    };
    if (s.committedPermille === null)
        return { fixos: null, anuais: null, parcelamentos: null, faturas: null, outras: null };
    const weights = COMMITTED_GROUPS.map((g) => cents[g]);
    const shares = weights.some((w) => w > 0) ? sharesCents(s.committedPermille, weights) : weights.map(() => 0);
    return Object.fromEntries(COMMITTED_GROUPS.map((g, i) => [g, shares[i]]));
}
export const COMMITTED_TEXT = {
    title: 'Renda comprometida',
    planned: 'Previsto',
    retry: 'Tentar novamente',
    loadError: 'Não foi possível calcular a renda comprometida.',
    resumoTitle: (month) => `Renda comprometida em ${formatMonthName(month)}`,
    resumoNoReference: 'Veja quanto da sua renda já está comprometido',
    resumoNoReferenceA11y: 'Veja quanto da sua renda já está comprometido. Abre a renda comprometida.',
    resumoA11y: (month, pct, committedCents, referenceCents) => `Renda comprometida em ${formatMonthName(month)}: ${pct} da renda de referência. ${formatBRL(committedCents)} de ${formatBRL(referenceCents)}. Abre os detalhes.`,
    resumoEmptyA11y: (month) => `Renda comprometida em ${formatMonthName(month)}: 0,0% da renda de referência. Nenhuma conta a pagar com vencimento em ${formatMonthName(month)}. Abre os detalhes.`,
    emptyMonth: (month) => `Nenhuma conta a pagar com vencimento em ${formatMonthName(month)}.`,
    highlightCaption: (month) => `da sua renda de referência em ${formatMonthYearBR(month)}`,
    highlightAmounts: (committedCents, referenceCents) => `${formatBRL(committedCents)} em contas de ${formatBRL(referenceCents)}`,
    meterPaid: (cents) => `Já pago · ${formatBRL(cents)}`,
    meterOpen: (cents) => `Em aberto · ${formatBRL(cents)}`,
    meterA11y: (pct, paidCents, openCents) => `${pct} da renda de referência: já pago ${formatBRL(paidCents)}, em aberto ${formatBRL(openCents)}.`,
    meterOver: '+',
    groupLabel: {
        fixos: 'Gastos fixos',
        anuais: 'Contas do ano',
        parcelamentos: 'Parcelamentos',
        faturas: 'Faturas de cartão',
        outras: 'Outras contas a pagar',
    },
    groupLine: (label, cents, pct) => (pct === null ? `${label} · ${formatBRL(cents)}` : `${label} · ${formatBRL(cents)} · ${pct}`),
    groupA11y: (label, cents, pct) => pct === null ? `${label}: ${formatBRL(cents)}.` : `${label}: ${formatBRL(cents)}, ${pct} da renda de referência.`,
    debtLine: (cents, pct) => (pct === null ? `Dívidas: ${formatBRL(cents)}.` : `Dívidas: ${formatBRL(cents)} · ${pct} da renda de referência.`),
    debtReference: 'Referência usada pela Serasa: até 30% da renda líquida com parcelas de dívidas. É uma referência geral, não uma regra para você.',
    debtReferenceSource: 'Fonte: Serasa, página sobre comprometimento de renda, consultada em 09/10/2026.',
    hideReference: 'Ocultar referência',
    showReference: 'Mostrar referência',
    outside: (cents) => `Fora dos compromissos: ${formatBRL(cents)}`,
    outsideNote: 'Não é saldo: ainda precisa cobrir gastos do dia a dia, como mercado, e não considera o dinheiro que já estava na conta.',
    estimated: (cents) => `Inclui ${formatBRL(cents)} em valores estimados.`,
    overdueBefore: (cents, month, allLate = true) => `Além disso, ${formatBRL(cents)} de contas ${allLate ? 'vencidas' : 'com vencimento'} antes de ${formatMonthName(month)} continuam em aberto. Elas contam no mês do vencimento.`,
    seeOverdue: 'Ver contas vencidas',
    overReference: (cents) => `As contas do mês passam a renda de referência em ${formatBRL(cents)}.`,
    annualShare: (monthlyCents) => `Contas do ano: ${formatBRL(monthlyCents)} por mês se dividir o valor do ano por 12.`,
    annualShareNote: 'Não entra no percentual.',
    annualShareEstimated: 'O valor do ano usa valores estimados.',
    referenceLine: (cents, fromMonth) => `${formatBRL(cents)} por mês, desde ${formatMonthYearBR(fromMonth)}`,
    received: (month, cents) => `Recebido em ${formatMonthName(month)}: ${formatBRL(cents)}`,
    change: 'Alterar',
    reviewHint: (fromMonth, month) => `Referência de ${monthNear(fromMonth, month)}. Revise para ${monthNear(month, fromMonth)}.`,
    review: 'Revisar',
    noReferenceLabel: (month) => `Contas de ${formatMonthName(month)}`,
    noReferenceHint: 'Para ver quanto isso representa da sua renda, informe sua renda de referência.',
    noReferenceButton: 'Informar renda de referência',
    monthBills: 'Contas do mês',
    upcomingTitle: 'Próximos meses',
    upcomingLegend: 'Previsto: contas já criadas e repetições programadas. Valores estimados podem mudar.',
    milestonesTitle: 'O que muda',
    howTitle: 'Como calculamos',
    how: (month) => `Somamos as contas a pagar com vencimento em ${formatMonthName(month)}: o valor pago das que já foram pagas e o valor previsto das que estão em aberto. ` +
        'Gastos anotados sem conta a pagar, como mercado, ficam fora. Por isso este número é diferente de Pago e de Ainda a pagar.',
    howLink: 'Como ler este número',
    invoiceNote: 'Compras no cartão entram pela fatura, no mês do vencimento dela. A linha de dívidas continua só com financiamento e compra parcelada.',
    links: {
        series: 'Gastos fixos e parcelamentos',
        payables: 'Contas a pagar',
        whoSees: 'Quem vê estes dados?',
    },
    reference: {
        title: 'Renda de referência',
        intro: 'Quanto costuma cair na sua conta por mês, já com descontos. Usamos esse valor só para calcular percentuais. Ele não conta como recebido.',
        amountLabel: 'Valor por mês',
        suggestion: (cents, months) => `Nos meses com recebimentos anotados, a média foi ${formatBRL(cents)} (${monthsText(months)}). Reembolsos ficam fora.`,
        useSuggestion: (cents) => `Usar ${formatBRL(cents)}`,
        fromLabel: 'Vale a partir de',
        fixed: 'Minha renda é fixa',
        varies: 'Minha renda varia',
        variesHint: 'Vamos pedir uma revisão no começo de cada mês.',
        save: 'Salvar renda de referência',
        delete: 'Excluir esta referência',
        deleteTitle: (fromMonth) => `Excluir a renda de referência de ${formatMonthName(fromMonth)}?`,
        deleteBody: 'A referência anterior volta a valer. Sem nenhuma, mostramos só os valores em reais.',
        deleteConfirm: 'Excluir referência',
        cancel: 'Cancelar',
        saved: (fromMonth) => `Renda de referência salva. Ela vale a partir de ${formatMonthName(fromMonth)}.`,
        deleted: 'Renda de referência excluída.',
        monthError: 'Escolha um mês entre dois anos atrás e os próximos 12 meses.',
    },
    forecast: (month, cents) => `Se pagar tudo o que está em aberto, os pagamentos de ${formatMonthName(month)} chegam a ${formatBRL(cents)}.`,
    forecastEstimated: (cents) => `Inclui ${formatBRL(cents)} estimados.`,
    savedInGoals: (month, cents) => `Guardado em metas em ${formatMonthName(month)}: ${formatBRL(cents)}`,
    withdrawnFromGoals: (month, cents) => `Em ${formatMonthName(month)}, os resgates de metas passaram os aportes em ${formatBRL(cents)}.`,
    plannedForGoals: (cents) => `Planejado para metas: ${formatBRL(cents)} por mês`,
    outsideAfterPlanned: (cents) => `Fora dos compromissos depois do planejado: ${formatBRL(cents)}`,
    plannedOverReference: (cents) => `As contas do mês e o planejado para metas passam a renda de referência em ${formatBRL(cents)}.`,
    goalsNote: 'Metas não entram no percentual: guardar não é conta a pagar.',
};
export function committedGoalLines(s, savedInMonthCents, plannedCents) {
    const after = s.outsideCents === null || plannedCents <= 0 ? null : s.outsideCents - plannedCents;
    return {
        savedInMonthCents,
        plannedCents,
        outsideAfterPlannedCents: after,
        saved: savedInMonthCents >= 0
            ? COMMITTED_TEXT.savedInGoals(s.month, savedInMonthCents)
            : COMMITTED_TEXT.withdrawnFromGoals(s.month, -savedInMonthCents),
        planned: plannedCents > 0 ? COMMITTED_TEXT.plannedForGoals(plannedCents) : null,
        outsideAfterPlanned: after === null ? null : after >= 0 ? COMMITTED_TEXT.outsideAfterPlanned(after) : COMMITTED_TEXT.plannedOverReference(-after),
        note: COMMITTED_TEXT.goalsNote,
    };
}
export function committedLine(s) {
    if (s.referenceCents === null || s.committedPermille === null || s.meter === null) {
        return { kind: 'sem_referencia', title: COMMITTED_TEXT.resumoNoReference, a11yLabel: COMMITTED_TEXT.resumoNoReferenceA11y };
    }
    const value = formatPermille(s.committedPermille, s.committedCents);
    const empty = s.count === 0;
    return {
        kind: 'percentual',
        title: COMMITTED_TEXT.resumoTitle(s.month),
        value,
        caption: empty ? COMMITTED_TEXT.emptyMonth(s.month) : null,
        meter: s.meter,
        a11yLabel: empty
            ? COMMITTED_TEXT.resumoEmptyA11y(s.month)
            : COMMITTED_TEXT.resumoA11y(s.month, value, s.committedCents, s.referenceCents),
    };
}
export function committedTexts(s, receivedCents = null) {
    const ref = s.referenceCents;
    const pct = pctOrNull(s.committedPermille, s.committedCents);
    const groupCents = {
        fixos: s.fixedCents,
        anuais: s.annualCents,
        parcelamentos: s.installmentCents,
        faturas: s.cardCents,
        outras: s.otherCents,
    };
    const groupPermille = groupPermilleShares(s);
    const groups = COMMITTED_GROUPS.filter((g) => (g !== 'anuais' || s.annualCents > 0 || s.items.anuais.length > 0) && (g !== 'faturas' || s.cardCents > 0 || s.items.faturas.length > 0)).map((group) => {
        const label = COMMITTED_TEXT.groupLabel[group];
        const cents = groupCents[group];
        const percentText = pctOrNull(groupPermille[group], cents);
        return {
            group,
            label,
            cents,
            permille: groupPermille[group],
            percentText,
            line: COMMITTED_TEXT.groupLine(label, cents, percentText),
            a11yLabel: COMMITTED_TEXT.groupA11y(label, cents, percentText),
        };
    });
    return {
        highlight: pct,
        highlightCaption: ref === null ? null : COMMITTED_TEXT.highlightCaption(s.month),
        highlightAmounts: ref === null ? null : COMMITTED_TEXT.highlightAmounts(s.committedCents, ref),
        meterPaid: COMMITTED_TEXT.meterPaid(s.paidPartCents),
        meterOpen: COMMITTED_TEXT.meterOpen(s.openPartCents),
        meterA11y: pct === null ? null : COMMITTED_TEXT.meterA11y(pct, s.paidPartCents, s.openPartCents),
        groups,
        debt: s.debtCents > 0 ? COMMITTED_TEXT.debtLine(s.debtCents, pctOrNull(s.debtPermille, s.debtCents)) : null,
        outside: s.outsideCents === null || s.outsideCents < 0 ? null : COMMITTED_TEXT.outside(s.outsideCents),
        outsideNote: s.outsideCents === null || s.outsideCents < 0 ? null : COMMITTED_TEXT.outsideNote,
        estimated: s.estimatedOpenCents > 0 ? COMMITTED_TEXT.estimated(s.estimatedOpenCents) : null,
        invoiceNote: s.items.faturas.length > 0 ? COMMITTED_TEXT.invoiceNote : null,
        overdueBefore: s.overdueBeforeCents > 0 ? COMMITTED_TEXT.overdueBefore(s.overdueBeforeCents, s.month, s.overdueBeforeAllLate) : null,
        overReference: s.overReference && ref !== null ? COMMITTED_TEXT.overReference(s.committedCents - ref) : null,
        annualShare: s.annualShare ? COMMITTED_TEXT.annualShare(s.annualShare.monthlyCents) : null,
        annualShareNote: s.annualShare ? COMMITTED_TEXT.annualShareNote : null,
        reference: s.reference ? COMMITTED_TEXT.referenceLine(s.reference.amountCents, s.reference.fromMonth) : null,
        received: s.reference && receivedCents !== null ? COMMITTED_TEXT.received(s.month, receivedCents) : null,
        review: s.needsReview && s.reference ? COMMITTED_TEXT.reviewHint(s.reference.fromMonth, s.month) : null,
        noReference: ref === null
            ? {
                label: COMMITTED_TEXT.noReferenceLabel(s.month),
                amount: formatBRL(s.committedCents),
                hint: COMMITTED_TEXT.noReferenceHint,
                button: COMMITTED_TEXT.noReferenceButton,
            }
            : null,
        empty: s.count === 0 ? COMMITTED_TEXT.emptyMonth(s.month) : null,
        how: COMMITTED_TEXT.how(s.month),
    };
}
