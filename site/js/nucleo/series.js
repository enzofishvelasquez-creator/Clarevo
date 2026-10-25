// Gerado por scripts/gerar-site.js a partir de packages/core/src/series.ts. Não edite: rode "node scripts/gerar-site.js".
import { addMonths, dateInMonth, formatDateBR, formatDayMonth, formatMonthName, formatMonthSpanBR, formatMonthYearBR, monthOf, monthsBetween, } from './dates.js';
import { dueKindOfSeries, effectiveOverdue, nextBusinessDayWhen } from './dia-util.js';
import { formatBRL, roundDiv } from './money.js';
import { ANNUAL_LEAD_MONTHS, PARTS_PER_YEAR_MAX } from './records.js';
export const SERIES_LIMIT = 100;
export const SERIES_MAX_MONTHS = 600;
export const INSTALLMENTS_MIN = 2;
export const INSTALLMENTS_MAX = 480;
export const ANNUAL_MAX_YEARS = 50;
export const SERIES_NATURE_SHORT = {
    conta: 'gasto fixo',
    financiamento: 'financiamento',
    compra_parcelada: 'compra parcelada',
    outro_parcelamento: 'outro parcelamento',
};
export const SERIES_NATURE_LABEL = {
    conta: 'Gasto fixo',
    financiamento: 'Financiamento ou empréstimo',
    compra_parcelada: 'Compra parcelada (boleto ou crediário)',
    outro_parcelamento: 'Outro (imposto, taxa, matrícula, consórcio)',
};
export const SERIES_KIND_NAME = {
    mensal: 'o gasto fixo',
    parcelada: 'o parcelamento',
    anual: 'a conta do ano',
};
function unknownKind(kind) {
    throw new Error(`serie_inconsistente: ${String(kind)}`);
}
const mod = (a, b) => ((a % b) + b) % b;
function partsOf(s) {
    const k = s.partsPerYear;
    if (k === null || !Number.isSafeInteger(k) || k < 1 || k > PARTS_PER_YEAR_MAX)
        throw new Error('serie_inconsistente');
    return k;
}
function anchorOf(s) {
    return addMonths(s.firstDueMonth, -(s.firstNumber - 1));
}
function annualPosition(s, month) {
    const k = partsOf(s);
    const d = monthsBetween(anchorOf(s), month);
    const a = Math.floor(d / 12);
    return { k, a, p: d - 12 * a };
}
export function seriesMonthOf(s, n) {
    switch (s.kind) {
        case 'mensal':
        case 'parcelada':
            return addMonths(s.firstDueMonth, n - s.firstNumber);
        case 'anual': {
            const k = partsOf(s);
            return addMonths(anchorOf(s), 12 * Math.floor((n - 1) / k) + mod(n - 1, k));
        }
        default:
            return unknownKind(s.kind);
    }
}
export function numberOfMonth(s, month) {
    if (s.kind !== 'anual')
        return s.firstNumber + monthsBetween(s.firstDueMonth, month);
    const { k, a, p } = annualPosition(s, month);
    return p < k ? a * k + p + 1 : null;
}
export function numberAtOrAfter(s, month) {
    if (s.kind !== 'anual')
        return s.firstNumber + monthsBetween(s.firstDueMonth, month);
    const { k, a, p } = annualPosition(s, month);
    return p < k ? a * k + p + 1 : (a + 1) * k + 1;
}
export function numberAtOrBefore(s, month) {
    if (s.kind !== 'anual')
        return s.firstNumber + monthsBetween(s.firstDueMonth, month);
    const { k, a, p } = annualPosition(s, month);
    return p < k ? a * k + p + 1 : a * k + k;
}
export function termFor(terms, n) {
    let best = null;
    for (const t of terms)
        if (t.fromNumber <= n && (!best || t.fromNumber > best.fromNumber))
            best = t;
    return best;
}
function requireTerm(s, n) {
    const t = termFor(s.terms, n);
    if (!t)
        throw new Error('serie_inconsistente');
    return t;
}
export function seriesDueOn(s, n) {
    return dateInMonth(seriesMonthOf(s, n), requireTerm(s, n).dueDay);
}
export function seriesEndMonth(s) {
    return s.lastNumber === null ? null : seriesMonthOf(s, s.lastNumber);
}
export function seriesStartMonth(s) {
    return seriesMonthOf(s, s.firstNumber);
}
export function seriesEnded(s, today) {
    if (s.lastNumber === null)
        return false;
    return s.lastNumber < s.firstNumber || seriesMonthOf(s, s.lastNumber) < monthOf(today);
}
export function seriesCountsTowardLimit(s, today) {
    return s.lastNumber === null || seriesMonthOf(s, s.lastNumber) >= generationWindow(today).floor;
}
export function lastNumberFromEndMonth(s, month) {
    return numberAtOrBefore(s, month);
}
export function lastNumberFromEndYear(s, year) {
    const k = partsOf(s);
    return k * (year - Number(anchorOf(s).slice(0, 4)) + 1);
}
export function annualLastMonth(input, year) {
    const k = partsOf(input);
    const anchor = anchorOf(input);
    return addMonths(anchor, 12 * (year - Number(anchor.slice(0, 4))) + k - 1);
}
export function editFromMaxNumber(s, today) {
    if (s.lastNumber !== null)
        return s.lastNumber;
    const top = addMonths(monthOf(today), 12);
    switch (s.kind) {
        case 'mensal':
        case 'parcelada':
            return s.firstNumber + monthsBetween(s.firstDueMonth, top);
        case 'anual':
            return (Math.floor(Math.max(0, monthsBetween(seriesMonthOf(s, 1), top)) / 12) + 1) * partsOf(s);
        default:
            return unknownKind(s.kind);
    }
}
export function generationWindow(today) {
    const m = monthOf(today);
    return { floor: addMonths(m, -1), top: addMonths(m, 1), annualTop: addMonths(m, ANNUAL_LEAD_MONTHS) };
}
function planned(s, n) {
    const t = requireTerm(s, n);
    const month = seriesMonthOf(s, n);
    return {
        number: n,
        month,
        dueOn: dateInMonth(month, t.dueDay),
        description: t.description,
        category: t.category,
        amountCents: t.amountCents,
        amountIsEstimate: t.amountMode === 'variavel',
    };
}
function knownFrom(s, live) {
    const total = (s.paidCount ?? 0) + (s.openCount ?? 0);
    return live.size >= total ? s.firstNumber : Math.min(...live.keys());
}
function liveByNumber(s, list) {
    const out = new Map();
    for (const c of list)
        if (c.series && c.series.id === s.id)
            out.set(c.series.number, c);
    return out;
}
export function mergeOccurrences(...lists) {
    const byId = new Map();
    for (const list of lists) {
        for (const c of list) {
            const seen = byId.get(c.id);
            if (!seen || c.version > seen.version)
                byId.set(c.id, c);
        }
    }
    return [...byId.values()].sort((a, b) => (b.series?.number ?? 0) - (a.series?.number ?? 0) || a.id.localeCompare(b.id));
}
export function occurrencesToMaterialize(s, existing, today) {
    if (!s.generating)
        return [];
    const { floor, top, annualTop } = generationWindow(today);
    let from;
    let to;
    switch (s.kind) {
        case 'mensal':
        case 'parcelada':
            from = Math.max(s.firstNumber, s.firstNumber + monthsBetween(s.firstDueMonth, floor));
            to = s.firstNumber + monthsBetween(s.firstDueMonth, top);
            break;
        case 'anual': {
            const k = partsOf(s);
            const anchor = anchorOf(s);
            if (annualTop < anchor)
                return [];
            const yearTop = Math.floor(monthsBetween(anchor, annualTop) / 12);
            from = Math.max(s.firstNumber, (yearTop - 1) * k + 1);
            to = (yearTop + 1) * k;
            break;
        }
        default:
            return unknownKind(s.kind);
    }
    if (s.lastNumber !== null)
        to = Math.min(to, s.lastNumber);
    const live = liveByNumber(s, existing);
    const skipped = new Set(s.skippedNumbers);
    const out = [];
    for (let n = from; n <= to; n++) {
        if (seriesMonthOf(s, n) < floor)
            continue;
        if (!live.has(n) && !skipped.has(n))
            out.push(planned(s, n));
    }
    return out;
}
export function projectSeries(s, existing, fromMonth, toMonth) {
    const live = liveByNumber(s, existing);
    const maxLive = Math.max(s.firstNumber - 1, ...live.keys());
    const from = Math.max(s.firstNumber, numberAtOrAfter(s, fromMonth), maxLive + 1);
    const toN = numberAtOrBefore(s, toMonth);
    const to = s.lastNumber === null ? toN : Math.min(toN, s.lastNumber);
    const skipped = new Set(s.skippedNumbers);
    const out = [];
    for (let n = from; n <= to; n++)
        if (!skipped.has(n))
            out.push(planned(s, n));
    return out;
}
function yearLabel(firstMonth, lastMonth) {
    const a = firstMonth.slice(0, 4);
    const b = lastMonth.slice(0, 4);
    return a === b ? a : `${a}/${b}`;
}
export function annualYearOf(s, n) {
    const k = partsOf(s);
    const index = Math.floor((n - 1) / k);
    const firstNumber = index * k + 1;
    const lastNumber = index * k + k;
    const firstMonth = seriesMonthOf(s, firstNumber);
    const lastMonth = seriesMonthOf(s, lastNumber);
    return { index, part: mod(n - 1, k) + 1, firstNumber, lastNumber, firstMonth, lastMonth, label: yearLabel(firstMonth, lastMonth) };
}
export function annualYearLabel(s, a) {
    return annualYearOf(s, a * partsOf(s) + 1).label;
}
export function annualYearLabelOf(c) {
    if (!c.series || c.series.kind !== 'anual')
        return null;
    const k = c.series.partsPerYear ?? 1;
    const first = addMonths(monthOf(c.dueOn), -mod(c.series.number - 1, k));
    return yearLabel(first, addMonths(first, k - 1));
}
function partOf(c) {
    if (!c.series || c.series.kind !== 'anual')
        return null;
    return mod(c.series.number - 1, c.series.partsPerYear ?? 1) + 1;
}
export function occurrenceLabel(c) {
    if (!c.series)
        return null;
    switch (c.series.kind) {
        case 'parcelada':
            return `Parcela ${c.series.number} de ${c.series.installmentTotal}`;
        case 'mensal':
            return 'Todo mês';
        case 'anual': {
            const k = c.series.partsPerYear ?? 1;
            const label = c.dueOn ? annualYearLabelOf({ series: c.series, dueOn: c.dueOn }) : null;
            const year = label ? ` de ${label}` : '';
            return k === 1 ? `Conta do ano${year}` : `Parcela ${partOf(c)} de ${k}${year}`;
        }
        default:
            return unknownKind(c.series.kind);
    }
}
function currentNumber(s, today) {
    if (today === undefined) {
        if (s.lastNumber !== null)
            return Math.max(s.firstNumber, s.lastNumber);
        return Math.max(s.firstNumber, ...s.terms.map((t) => t.fromNumber));
    }
    let n = Math.max(s.firstNumber, numberAtOrAfter(s, monthOf(today)));
    if (s.lastNumber !== null)
        n = Math.max(s.firstNumber, Math.min(n, s.lastNumber));
    return n;
}
export function currentTerm(s, today) {
    if (today === undefined)
        return requireTerm(s, s.lastNumber === null ? Number.MAX_SAFE_INTEGER : Math.max(s.firstNumber, s.lastNumber));
    return requireTerm(s, currentNumber(s, today));
}
export function seriesCaption(s, today) {
    switch (s.kind) {
        case 'parcelada': {
            const head = `Parcelamento · ${SERIES_NATURE_SHORT[s.nature]}`;
            const last = s.lastNumber ?? s.firstNumber;
            return last < s.firstNumber ? `${head} · encerrado antes da parcela ${s.firstNumber}` : `${head} · parcelas ${s.firstNumber} a ${last}`;
        }
        case 'mensal': {
            const head = `Todo mês, dia ${currentTerm(s, today).dueDay}`;
            if (s.lastNumber === null)
                return `${head} · desde ${formatMonthYearBR(s.firstDueMonth)}`;
            if (s.lastNumber < s.firstNumber)
                return `${head} · encerrado antes da primeira conta`;
            return `${head} · ${formatMonthSpanBR(s.firstDueMonth, seriesMonthOf(s, s.lastNumber))}`;
        }
        case 'anual': {
            const k = partsOf(s);
            const n = currentNumber(s, today);
            const year = annualYearOf(s, n);
            const head = k === 1
                ? `Todo ano em ${formatDayMonth(seriesDueOn(s, n))}`
                : `Todo ano, ${k} parcelas de ${formatMonthName(year.firstMonth)} a ${formatMonthName(year.lastMonth)}, dia ${requireTerm(s, n).dueDay}`;
            const first = annualYearOf(s, s.firstNumber).label;
            if (s.lastNumber === null)
                return `${head} · desde ${first}`;
            if (s.lastNumber < s.firstNumber)
                return `${head} · encerrada antes da primeira conta`;
            const last = annualYearOf(s, s.lastNumber).label;
            return `${head} · ${first === last ? `em ${first}` : `de ${first} a ${last}`}`;
        }
        default:
            return unknownKind(s.kind);
    }
}
function annualSpan(s, fromN, toN) {
    const k = partsOf(s);
    const from = annualYearOf(s, fromN);
    const fromWhole = from.part === 1 || fromN === s.firstNumber;
    if (toN === null)
        return fromWhole ? `a partir de ${from.label}` : `a partir da parcela ${from.part} de ${from.label}`;
    const to = annualYearOf(s, toN);
    const toWhole = to.part === k;
    if (from.index === to.index) {
        if (fromWhole && toWhole)
            return `em ${from.label}`;
        return from.part === to.part ? `na parcela ${from.part} de ${from.label}` : `nas parcelas ${from.part} a ${to.part} de ${from.label}`;
    }
    const a = fromWhole ? `de ${from.label}` : `da parcela ${from.part} de ${from.label}`;
    const b = toWhole ? `a ${to.label}` : `à parcela ${to.part} de ${to.label}`;
    return `${a} ${b}`;
}
export function termHistory(s) {
    const terms = [...s.terms].sort((a, b) => a.fromNumber - b.fromNumber);
    const annual = s.kind === 'anual';
    const perPart = annual && partsOf(s) > 1 ? ' por parcela' : '';
    return terms
        .map((term, i) => {
        const next = terms[i + 1];
        const untilNext = next ? next.fromNumber - 1 : null;
        const lastN = untilNext === null ? s.lastNumber : s.lastNumber === null ? untilNext : Math.min(untilNext, s.lastNumber);
        const fromMonth = seriesMonthOf(s, term.fromNumber);
        const toMonth = lastN === null ? null : seriesMonthOf(s, lastN);
        const amount = `${formatBRL(term.amountCents)}${perPart}${term.amountMode === 'variavel' ? ' (estimado)' : ''}`;
        const when = annual
            ? annualSpan(s, term.fromNumber, lastN)
            : toMonth === null
                ? `a partir de ${formatMonthYearBR(fromMonth)}`
                : formatMonthSpanBR(fromMonth, toMonth);
        return { term, fromMonth, toMonth, lastN, text: `${amount} ${when}` };
    })
        .filter((h) => h.lastN === null || h.lastN >= h.term.fromNumber)
        .map(({ lastN: _lastN, ...h }) => h);
}
export function installmentProgress(s, occurrences, open, today) {
    const live = liveByNumber(s, mergeOccurrences(occurrences, open));
    let paidInList = 0;
    for (const c of live.values())
        if (c.status === 'quitado')
            paidInList += 1;
    const paidInApp = Math.max(paidInList, s.paidCount ?? 0);
    const base = { total: s.installmentTotal, paidBefore: s.firstNumber - 1, paidInApp };
    if (s.lastNumber === null)
        return { ...base, remaining: null, lastDueOn: null, remainingCents: null, approximate: false };
    const items = remainingInstallments(s, occurrences, open, today);
    const lastDueOn = s.lastNumber >= s.firstNumber ? seriesDueOn(s, s.lastNumber) : null;
    return {
        ...base,
        remaining: items.length,
        lastDueOn,
        remainingCents: items.reduce((acc, x) => acc + x.amountCents, 0),
        approximate: items.some((x) => x.amountIsEstimate),
    };
}
export function remainingInstallments(s, occurrences, open, today) {
    if (s.lastNumber === null)
        return null;
    const listed = liveByNumber(s, occurrences);
    const live = liveByNumber(s, mergeOccurrences(occurrences, open));
    const skipped = new Set(s.skippedNumbers);
    const current = numberAtOrBefore(s, monthOf(today));
    const known = listed.size === 0 ? s.firstNumber : knownFrom(s, listed);
    const out = [];
    for (let n = s.firstNumber; n <= s.lastNumber; n++) {
        const c = live.get(n);
        if (c) {
            if (c.status === 'quitado')
                continue;
            out.push({ number: n, dueOn: c.dueOn, amountCents: c.amountCents, amountIsEstimate: c.amountIsEstimate, commitmentId: c.id });
        }
        else if (!skipped.has(n) && n > current && n >= known) {
            const t = requireTerm(s, n);
            out.push({ number: n, dueOn: seriesDueOn(s, n), amountCents: t.amountCents, amountIsEstimate: t.amountMode === 'variavel', commitmentId: null });
        }
    }
    return out;
}
export function missingMonths(s, occurrences, today) {
    const live = liveByNumber(s, occurrences);
    const skipped = new Set(s.skippedNumbers);
    const current = numberAtOrBefore(s, monthOf(today));
    const to = s.lastNumber === null ? current : Math.min(current, s.lastNumber);
    const out = [];
    for (let n = knownFrom(s, live); n <= to; n++)
        if (!live.has(n) && !skipped.has(n))
            out.push({ number: n, month: seriesMonthOf(s, n) });
    return out;
}
const refs = (xs) => xs.map((c) => ({ id: c.id, version: c.version }));
const byNumber = (a, b) => (a.series?.number ?? 0) - (b.series?.number ?? 0);
const contas = (n) => (n === 1 ? '1 conta' : `${n} contas`);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const money = (cents, approximate) => (approximate ? `cerca de ${formatBRL(cents)}` : formatBRL(cents));
function joinList(items) {
    if (items.length <= 1)
        return items[0] ?? '';
    return `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`;
}
function partsText(parts) {
    const items = [];
    let i = 0;
    while (i < parts.length) {
        let j = i;
        while (j + 1 < parts.length && parts[j + 1] === parts[j] + 1)
            j++;
        if (j - i >= 2)
            items.push(`${parts[i]} a ${parts[j]}`);
        else
            for (let x = i; x <= j; x++)
                items.push(String(parts[x]));
        i = j + 1;
    }
    return joinList(items);
}
const monthOfDue = (c) => formatMonthName(monthOf(c.dueOn));
function annualPartsText(items) {
    const byYear = [];
    for (const c of items) {
        const label = annualYearLabelOf(c);
        const last = byYear[byYear.length - 1];
        if (last && last.label === label)
            last.parts.push(partOf(c));
        else
            byYear.push({ label, parts: [partOf(c)] });
    }
    return joinList(byYear.map((y) => `${y.parts.length === 1 ? 'parcela' : 'parcelas'} ${partsText(y.parts)} de ${y.label}`));
}
function occurrenceName(c) {
    const label = annualYearLabelOf(c);
    if (label === null)
        return monthOfDue(c);
    return (c.series.partsPerYear ?? 1) === 1 ? label : `parcela ${partOf(c)} de ${label}`;
}
export function affectedByEditFrom(list, s, k) {
    const live = [...liveByNumber(s, list).values()].sort(byNumber);
    const chosen = live.find((c) => c.series.number === k) ?? null;
    if (chosen?.status === 'quitado')
        return { ok: false, code: 'inicio_em_conta_paga' };
    const changing = live.filter((c) => c.status === 'aberto' && (c.series.number === k || (c.series.number > k && !c.seriesOverride)));
    const unchanged = live
        .filter((c) => !changing.includes(c) && (c.series.number >= k - 1 || c.status === 'aberto'))
        .map((commitment) => ({
        commitment,
        reason: commitment.status === 'quitado' ? 'paga' : commitment.series.number > k ? 'alterada' : 'anterior',
    }));
    const annual = live[0]?.series?.kind === 'anual';
    const single = annual && (live[0].series.partsPerYear ?? 1) === 1;
    let changingText;
    let unchangedText;
    if (annual && !single) {
        const reasonText = {
            paga: ['paga', 'pagas'],
            alterada: ['valor informado ou alterado à parte', 'valores informados ou alterados à parte'],
            anterior: ['antes da parcela escolhida', 'antes da parcela escolhida'],
        };
        changingText = annualPartsText(changing);
        const groups = ['paga', 'alterada', 'anterior']
            .map((reason) => {
            const items = unchanged.filter((u) => u.reason === reason).map((u) => u.commitment);
            return items.length ? `${annualPartsText(items)} (${reasonText[reason][items.length === 1 ? 0 : 1]})` : null;
        })
            .filter((t) => t !== null);
        unchangedText = joinList(groups);
    }
    else {
        const reasonText = single
            ? { paga: 'paga', alterada: 'valor informado ou alterado só naquele ano', anterior: 'antes do ano escolhido' }
            : { paga: 'paga', alterada: 'alterada só para aquele mês', anterior: 'antes do mês escolhido' };
        changingText = joinList(changing.map((c) => `${occurrenceName(c)} (${formatDayMonth(c.dueOn)})`));
        unchangedText = joinList(unchanged.map((u) => `${occurrenceName(u.commitment)} (${reasonText[u.reason]})`));
    }
    let chosenText = null;
    if (chosen?.seriesOverride) {
        const amount = formatBRL(chosen.amountCents);
        chosenText = !annual
            ? `A conta de ${monthOfDue(chosen)} tinha sido alterada só para aquele mês (${amount}) e passa a seguir o novo valor.`
            : single
                ? `A conta de ${annualYearLabelOf(chosen)} tinha o valor informado ou alterado só naquele ano (${amount}) e passa a seguir o novo valor.`
                : `A ${occurrenceName(chosen)} tinha o valor informado ou alterado à parte (${amount}) e passa a seguir o novo valor.`;
    }
    const parts = [
        changing.length ? `${annual && changing.length === 1 ? 'Vai mudar' : 'Vão mudar'}: ${changingText}.` : null,
        unchanged.length ? `${annual && unchanged.length === 1 ? 'Não muda' : 'Não mudam'}: ${unchangedText}.` : null,
        'As contas criadas depois já seguem o novo valor.',
        chosenText,
    ];
    return { ok: true, affected: refs(changing), changing, unchanged, chosen, text: parts.filter(Boolean).join(' ') };
}
export function affectedByEnd(list, s, last) {
    const after = [...liveByNumber(s, list).values()].filter((c) => last !== null && c.series.number > last).sort(byNumber);
    if (after.some((c) => c.status === 'quitado'))
        return { ok: false, code: 'serie_tem_pagamento_posterior' };
    const n = after.length;
    let text = null;
    if (n > 0 && last !== null) {
        const verb = n === 1 ? 'vai' : 'vão';
        let where = '';
        if (last >= s.firstNumber) {
            if (s.kind === 'anual') {
                const y = annualYearOf(s, last);
                where = y.part === partsOf(s) ? ` depois de ${y.label}` : ` depois da parcela ${y.part} de ${y.label}`;
            }
            else {
                where = ` depois de ${formatMonthName(seriesMonthOf(s, last))}`;
            }
        }
        text = `${contas(n)} em aberto${where} ${verb} sair da lista. As contas pagas continuam no histórico.`;
    }
    return { ok: true, affected: refs(after), removed: after, text };
}
export function affectedByDelete(list, s) {
    const live = [...liveByNumber(s, list).values()].sort(byNumber);
    if (live.some((c) => c.status === 'quitado'))
        return { ok: false, code: 'serie_tem_pagamentos' };
    const n = live.length;
    return { ok: true, affected: refs(live), removed: live, text: n ? `${contas(n)} em aberto ${n === 1 ? 'vai' : 'vão'} sair da lista.` : null };
}
export function suggestedReference(paidOccurrences) {
    const paid = paidOccurrences
        .filter((c) => c.status === 'quitado' && c.payment !== null && c.series !== null)
        .sort((a, b) => b.series.number - a.series.number)
        .slice(0, 3);
    if (paid.length === 0)
        return null;
    const total = paid.reduce((acc, c) => acc + c.payment.amountCents, 0);
    return { amountCents: roundDiv(total, paid.length), count: paid.length };
}
export function seriesMonthlyTotal(list, today) {
    let totalCents = 0;
    let estimatedCents = 0;
    for (const s of list) {
        if (s.kind === 'anual' || seriesEnded(s, today))
            continue;
        const t = currentTerm(s, today);
        totalCents += t.amountCents;
        if (t.amountMode === 'variavel')
            estimatedCents += t.amountCents;
    }
    return { totalCents, estimatedCents };
}
export function seriesYearlyTotal(list, today) {
    let totalCents = 0;
    let estimatedCents = 0;
    for (const s of list) {
        if (s.kind !== 'anual' || seriesEnded(s, today))
            continue;
        const t = currentTerm(s, today);
        const year = partsOf(s) * t.amountCents;
        totalCents += year;
        if (t.amountMode === 'variavel')
            estimatedCents += year;
    }
    return { totalCents, estimatedCents };
}
export function seriesStartingLater(list, today, annual) {
    const now = monthOf(today);
    let count = 0;
    let totalCents = 0;
    let estimatedCents = 0;
    let firstMonth = null;
    for (const s of list) {
        if ((s.kind === 'anual') !== annual || seriesEnded(s, today))
            continue;
        const start = seriesStartMonth(s);
        if (start <= now)
            continue;
        const t = currentTerm(s, today);
        const cents = annual ? partsOf(s) * t.amountCents : t.amountCents;
        count += 1;
        totalCents += cents;
        if (t.amountMode === 'variavel')
            estimatedCents += cents;
        if (firstMonth === null || start < firstMonth)
            firstMonth = start;
    }
    return { count, totalCents, estimatedCents, firstMonth };
}
export const SERIES_TOTALS_TEXT = {
    estimated: (totalCents, estimatedCents) => estimatedCents <= 0 ? '' : estimatedCents >= totalCents ? ' (valor estimado)' : ` (inclui ${formatBRL(estimatedCents)} estimados)`,
    monthly: (totalCents, estimatedCents) => `Gastos fixos, parcelamentos e assinaturas: ${formatBRL(totalCents)} por mês, se os valores não mudarem${SERIES_TOTALS_TEXT.estimated(totalCents, estimatedCents)}.`,
    yearly: (totalCents, estimatedCents) => `Contas do ano (IPVA, IPTU e outras): ${formatBRL(totalCents)} por ano, se os valores não mudarem${SERIES_TOTALS_TEXT.estimated(totalCents, estimatedCents)}.`,
    later: (totalCents, later) => {
        const started = totalCents - later.totalCents;
        const when = later.firstMonth === null ? '' : formatMonthYearBR(later.firstMonth);
        const what = later.count === 1 ? `1 item, em ${when}` : `${later.count} itens, o primeiro em ${when}`;
        return `${started > 0 ? `Já começaram: ${formatBRL(started)}. ` : ''}Começam depois: ${formatBRL(later.totalCents)} (${what}).`;
    },
};
export function seriesTotalsTexts(list, today) {
    const active = list.filter((s) => !seriesEnded(s, today));
    const hasMonthly = active.some((s) => s.kind !== 'anual');
    const hasAnnual = active.some((s) => s.kind === 'anual');
    const monthly = seriesMonthlyTotal(list, today);
    const yearly = seriesYearlyTotal(list, today);
    const monthlyLater = seriesStartingLater(list, today, false);
    const yearlyLater = seriesStartingLater(list, today, true);
    return {
        monthly: hasMonthly ? SERIES_TOTALS_TEXT.monthly(monthly.totalCents, monthly.estimatedCents) : null,
        monthlyLater: hasMonthly && monthlyLater.count > 0 ? SERIES_TOTALS_TEXT.later(monthly.totalCents, monthlyLater) : null,
        yearly: hasAnnual ? SERIES_TOTALS_TEXT.yearly(yearly.totalCents, yearly.estimatedCents) : null,
        yearlyLater: hasAnnual && yearlyLater.count > 0 ? SERIES_TOTALS_TEXT.later(yearly.totalCents, yearlyLater) : null,
    };
}
function seriesFromInput(input) {
    let firstNumber;
    let lastNumber;
    const partsPerYear = input.kind === 'anual' ? input.partsPerYear : null;
    switch (input.kind) {
        case 'mensal':
            firstNumber = 1;
            lastNumber = input.lastMonth === null ? null : 1 + monthsBetween(input.firstDueMonth, input.lastMonth);
            break;
        case 'parcelada':
            firstNumber = input.firstNumber;
            lastNumber = input.installmentTotal;
            break;
        case 'anual': {
            firstNumber = input.firstNumber;
            const k = partsOf(input);
            lastNumber =
                input.lastMonth === null ? null : (Math.floor(monthsBetween(anchorOf(input), input.lastMonth) / 12) + 1) * k;
            break;
        }
        default:
            return unknownKind(input.kind);
    }
    const term = {
        fromNumber: firstNumber,
        description: input.description,
        category: input.category,
        amountCents: input.amountCents,
        amountMode: input.amountMode,
        dueDay: input.dueDay,
    };
    return {
        id: '',
        kind: input.kind,
        firstDueMonth: input.firstDueMonth,
        firstNumber,
        lastNumber,
        partsPerYear,
        terms: [term],
        skippedNumbers: [],
        generating: true,
    };
}
function annualPreviewTexts(input, s, next, createdNow, today) {
    const k = partsOf(s);
    const variable = input.amountMode === 'variavel';
    const first = annualYearOf(s, s.firstNumber);
    const amount = variable ? `cerca de ${formatBRL(input.amountCents)} (estimado)` : formatBRL(input.amountCents);
    const what = k === 1 ? amount : `${k} parcelas de ${amount}`;
    const when = k === 1
        ? `todo ano em ${formatDayMonth(next[0].dueOn)}`
        : `todo dia ${input.dueDay}, de ${formatMonthName(first.firstMonth)} a ${formatMonthName(first.lastMonth)}`;
    const lastLabel = s.lastNumber === null ? null : annualYearOf(s, s.lastNumber).label;
    const span = lastLabel === null ? `a partir de ${first.label}` : lastLabel === first.label ? `em ${first.label}` : `de ${first.label} a ${lastLabel}`;
    const perYear = k > 1 ? ` ${variable ? `Cerca de ${formatBRL(k * input.amountCents)}` : formatBRL(k * input.amountCents)} por ano.` : '';
    const firstYearLast = s.lastNumber === null ? first.lastNumber : Math.min(first.lastNumber, s.lastNumber);
    const inFirstYear = firstYearLast - s.firstNumber + 1;
    let entry;
    let saved;
    if (createdNow.length === 0) {
        const enters = formatMonthYearBR(addMonths(first.firstMonth, -ANNUAL_LEAD_MONTHS));
        if (k === 1) {
            entry = `A conta de ${first.label} entra em Contas a pagar em ${enters}, dois meses antes de vencer, e só entra em Ainda a pagar em ${formatMonthName(first.firstMonth)}.`;
            saved = `A conta de ${first.label} entra em Contas a pagar em ${enters}.`;
        }
        else if (inFirstYear === 1) {
            const part = first.part;
            entry = `A parcela ${part} de ${first.label} entra em Contas a pagar em ${enters} e só entra em Ainda a pagar no mês em que vence.`;
            saved = `A parcela ${part} de ${first.label} entra em Contas a pagar em ${enters}.`;
        }
        else {
            entry = `As ${inFirstYear} parcelas de ${first.label} entram em Contas a pagar em ${enters}; cada uma só entra em Ainda a pagar no mês em que vence.`;
            saved = `As ${inFirstYear} parcelas de ${first.label} entram em Contas a pagar em ${enters}.`;
        }
    }
    else {
        const labels = [...new Set(createdNow.map((o) => annualYearOf(s, o.number).label))];
        if (k === 1) {
            const later = createdNow[0].month > monthOf(today);
            entry = `A conta de ${labels[0]} já entra em Contas a pagar${later ? ', em Próximos meses' : ' e em Ainda a pagar'}.`;
            saved = `A conta de ${labels[0]} já está em Contas a pagar.`;
        }
        else if (labels.length > 1) {
            entry = `As parcelas de ${joinList(labels)} já entram em Contas a pagar; cada uma só entra em Ainda a pagar no mês em que vence.`;
            saved = `As parcelas de ${joinList(labels)} já estão em Contas a pagar.`;
        }
        else if (createdNow.length === 1) {
            const part = annualYearOf(s, createdNow[0].number).part;
            entry = `A parcela ${part} de ${labels[0]} já entra em Contas a pagar e só entra em Ainda a pagar no mês em que vence.`;
            saved = `A parcela ${part} de ${labels[0]} já está em Contas a pagar.`;
        }
        else {
            entry = `As ${createdNow.length} parcelas de ${labels[0]} já entram em Contas a pagar; cada uma só entra em Ainda a pagar no mês em que vence.`;
            saved = `As ${createdNow.length} parcelas de ${labels[0]} já estão em Contas a pagar.`;
        }
    }
    return { text: `${input.description} · ${what} · ${when} · ${span}.${perYear} ${entry}`, savedText: `Conta do ano salva. ${saved}` };
}
export function seriesPreview(input, today) {
    const s = seriesFromInput(input);
    const variable = input.amountMode === 'variavel';
    const fmt = (cents) => (variable ? `cerca de ${formatBRL(cents)}` : formatBRL(cents));
    const lastN = s.lastNumber;
    const count = lastN === null ? null : lastN - s.firstNumber + 1;
    const nextTo = lastN === null ? s.firstNumber + 2 : Math.min(lastN, s.firstNumber + 2);
    const next = [];
    for (let n = s.firstNumber; n <= nextTo; n++)
        next.push(planned(s, n));
    const createdNow = occurrencesToMaterialize(s, [], today);
    const lastDueOn = lastN === null || lastN < s.firstNumber ? null : seriesDueOn(s, lastN);
    const firstMonth = input.firstDueMonth;
    const lastMonth = lastN === null || lastN < s.firstNumber ? null : seriesMonthOf(s, lastN);
    const totalCents = count === null ? null : count * input.amountCents;
    const lines = next.map((o) => `${formatDateBR(o.dueOn)} · ${fmt(o.amountCents)}${variable ? ' (estimado)' : ''}`);
    let text;
    let savedText = null;
    switch (input.kind) {
        case 'parcelada': {
            const first = next[0];
            const sum = `Soma das ${count} parcelas: ${fmt(totalCents)}. Não é o valor para quitar.`;
            text =
                count === 1
                    ? `Parcela ${s.firstNumber} de ${input.installmentTotal}: ${fmt(input.amountCents)}, em ${formatDateBR(first.dueOn)}. Não é o valor para quitar.`
                    : `Parcelas ${s.firstNumber} a ${lastN} de ${fmt(input.amountCents)}, todo dia ${input.dueDay}, de ${formatDateBR(first.dueOn)} a ${formatDateBR(lastDueOn)}. ${sum}`;
            break;
        }
        case 'mensal': {
            const amount = variable ? `${fmt(input.amountCents)} (estimado)` : fmt(input.amountCents);
            const span = lastMonth === null ? `desde ${formatMonthYearBR(firstMonth)}` : `${formatMonthSpanBR(firstMonth, lastMonth)} (${contas(count)})`;
            const months = createdNow.map((o) => formatMonthName(o.month));
            const moreLater = lastN === null || (createdNow[createdNow.length - 1]?.number ?? s.firstNumber - 1) < lastN;
            const tail = moreLater ? '; as próximas aparecem um mês antes de vencer.' : '.';
            const created = months.length === 0
                ? `A primeira conta aparece em Contas a pagar a partir de ${formatMonthYearBR(addMonths(firstMonth, -1))}.`
                : months.length === 1
                    ? `A conta de ${months[0]} já entra em Contas a pagar${tail}`
                    : `As contas de ${joinList(months)} já entram em Contas a pagar${tail}`;
            text = `${input.description} · ${amount} · todo dia ${input.dueDay} · ${span}. ${created}`;
            break;
        }
        case 'anual':
            ({ text, savedText } = annualPreviewTexts(input, s, next, createdNow, today));
            break;
        default:
            return unknownKind(input.kind);
    }
    return {
        input,
        firstNumber: s.firstNumber,
        lastNumber: lastN,
        firstMonth,
        lastMonth,
        next,
        createdNow,
        firstOverdue: next[0] !== undefined && effectiveOverdue(next[0].dueOn, dueKindOfSeries(input.kind), today),
        count,
        totalCents,
        lastDueOn,
        lines,
        text,
        savedText,
    };
}
function whenDue(dueOn, today, withYear, kind) {
    const date = withYear ? formatDateBR(dueOn) : formatDayMonth(dueOn);
    if (effectiveOverdue(dueOn, kind, today))
        return `venceu em ${date}`;
    if (dueOn < today) {
        const grace = nextBusinessDayWhen(dueOn, kind, today);
        if (grace)
            return `vence ${grace.when}`;
    }
    return dueOn === today ? 'vence hoje' : `vence em ${date}`;
}
export function firstMonthChoices(dueDay, today) {
    const current = monthOf(today);
    const months = [current, addMonths(current, 1)];
    const choices = months.map((month) => {
        const dueOn = dateInMonth(month, dueDay);
        const name = formatMonthName(month);
        return { month, dueOn, label: `${name.charAt(0).toUpperCase()}${name.slice(1)} (${whenDue(dueOn, today, false, 'gasto_fixo')})`, isDefault: false };
    });
    const def = choices.find((c) => c.dueOn >= today) ?? choices[choices.length - 1];
    def.isDefault = true;
    return choices;
}
export function annualStartChoices(k, month, day, today) {
    const current = monthOf(today);
    const min = addMonths(current, -1);
    const max = addMonths(current, 23);
    const mm = String(month).padStart(2, '0');
    const y0 = Number(min.slice(0, 4));
    const label = (start) => yearLabel(start, addMonths(start, k - 1));
    const years = [];
    let started = null;
    for (let y = y0 - 1; y <= y0 + 3; y++) {
        const start = `${y}-${mm}`;
        const firstDue = dateInMonth(start, day);
        if (start >= min && start <= max) {
            const when = whenDue(firstDue, today, true, 'conta_do_ano');
            years.push({ firstDueMonth: start, firstNumber: 1, dueOn: firstDue, label: `${label(start)} (${k === 1 ? when : `primeira ${when}`})`, isDefault: false });
        }
        if (k > 1 && firstDue < today && addMonths(start, k - 1) >= min) {
            const parts = [];
            for (let p = 2; p <= k; p++) {
                const m = addMonths(start, p - 1);
                if (m < min)
                    continue;
                const dueOn = dateInMonth(m, day);
                parts.push({ firstDueMonth: m, firstNumber: p, dueOn, label: `Parcela ${p} (${whenDue(dueOn, today, false, 'conta_do_ano')})`, isDefault: false });
            }
            started = {
                yearLabel: label(start),
                title: `Próxima parcela a pagar em ${label(start)}`,
                hint: 'As parcelas anteriores deste ano não viram gastos.',
                parts,
            };
        }
    }
    const all = [...years, ...(started?.parts ?? [])].sort((a, b) => a.dueOn.localeCompare(b.dueOn));
    const def = all.find((c) => c.dueOn >= today) ?? all[all.length - 1];
    if (def)
        def.isDefault = true;
    return { years, started };
}
const sameText = (text) => text.trim().toLocaleLowerCase('pt-BR');
export function findSeriesConflicts(preview, commitments, records, series) {
    const name = sameText(preview.input.description);
    const month = preview.firstMonth;
    const kind = preview.input.kind;
    const record = records.find((r) => r.kind === 'despesa' && monthOf(r.occurredOn) === month && sameText(r.description) === name) ?? null;
    const commitment = commitments.find((c) => c.series === null && monthOf(c.dueOn) === month && sameText(c.description) === name) ?? null;
    let similar = null;
    let similarName = '';
    for (const s of series) {
        const end = seriesEndMonth(s);
        if (end !== null && (s.lastNumber < s.firstNumber || end < month))
            continue;
        const term = s.terms.find((t) => sameText(t.description) === name);
        if (term) {
            similar = s;
            similarName = currentTerm(s).description;
            break;
        }
    }
    const similarText = similar
        ? `Você já tem ${SERIES_KIND_NAME[similar.kind]} ${similarName}. ${kind === 'anual'
            ? 'Quer cadastrar esta conta do ano mesmo assim?'
            : similar.kind === 'anual'
                ? 'Quer cadastrar mesmo assim?'
                : 'Quer cadastrar outro mesmo assim?'}`
        : null;
    if (kind === 'anual') {
        const s = seriesFromInput(preview.input);
        const k = partsOf(s);
        const next = addMonths(annualYearOf(s, s.firstNumber).firstMonth, 12);
        const nextLabel = yearLabel(next, addMonths(next, k - 1));
        return {
            record,
            commitment,
            similar,
            suggestedFirstMonth: next,
            suggestedFirstNumber: 1,
            texts: {
                record: record
                    ? `Você já anotou o gasto ${record.description} em ${formatDateBR(record.occurredOn)} (${formatBRL(record.amountCents)}). Para não contar duas vezes, a conta do ano pode começar em ${nextLabel}.`
                    : null,
                commitment: commitment
                    ? `Você já tem a conta a pagar ${commitment.description} com vencimento em ${formatDateBR(commitment.dueOn)}. Começar a repetição em ${nextLabel}?`
                    : null,
                similar: similarText,
                startNext: `Começar em ${nextLabel}`,
            },
        };
    }
    const next = addMonths(month, 1);
    const nextName = formatMonthName(next);
    const parcelada = kind === 'parcelada';
    const n = preview.input.firstNumber;
    const last = parcelada && n >= (preview.input.installmentTotal ?? n);
    const nextNumber = parcelada && !last ? n + 1 : null;
    const recordTail = !parcelada
        ? `Para não contar duas vezes, o gasto fixo pode começar em ${nextName}.`
        : last
            ? `Se esse gasto foi a parcela ${n}, a última, não há mais parcelas a cadastrar.`
            : `Para não contar duas vezes, o parcelamento pode começar com a parcela ${nextNumber}, em ${nextName}.`;
    const commitmentTail = !parcelada
        ? `Começar a repetição em ${nextName}?`
        : last
            ? `Se ela é a parcela ${n}, a última, não há mais parcelas a cadastrar.`
            : `Começar o parcelamento com a parcela ${nextNumber}, em ${nextName}?`;
    return {
        record,
        commitment,
        similar,
        suggestedFirstMonth: next,
        suggestedFirstNumber: nextNumber,
        texts: {
            record: record
                ? `Você já anotou o gasto ${record.description} em ${formatDayMonth(record.occurredOn)} (${formatBRL(record.amountCents)}). ${recordTail}`
                : null,
            commitment: commitment
                ? `Você já tem a conta a pagar ${commitment.description} com vencimento em ${formatDayMonth(commitment.dueOn)}. ${commitmentTail}`
                : null,
            similar: similarText,
            startNext: !parcelada ? `Começar em ${nextName}` : last ? null : `Começar em ${nextName} (parcela ${nextNumber})`,
        },
    };
}
export function annualYearRange(s, today) {
    const k = partsOf(s);
    const from = Math.floor((s.firstNumber - 1) / k);
    if (s.lastNumber !== null && s.lastNumber < s.firstNumber)
        return { from, to: from - 1 };
    const anchor = anchorOf(s);
    const { annualTop } = generationWindow(today);
    let to = annualTop < anchor ? 0 : Math.floor(monthsBetween(anchor, annualTop) / 12) + 1;
    if (s.lastNumber !== null)
        to = Math.min(to, Math.floor((s.lastNumber - 1) / k));
    return { from, to };
}
export function annualYearSummary(s, occurrences, open, a, today) {
    const k = partsOf(s);
    const year = annualYearOf(s, a * k + 1);
    const listed = liveByNumber(s, occurrences);
    const live = liveByNumber(s, mergeOccurrences(occurrences, open));
    const known = listed.size === 0 ? s.firstNumber : knownFrom(s, listed);
    const skippedSet = new Set(s.skippedNumbers);
    const { floor, annualTop } = generationWindow(today);
    const planned = year.firstMonth > annualTop;
    let count = 0;
    let paid = 0;
    let openCount = 0;
    let skipped = 0;
    let paidBefore = 0;
    let notCreated = 0;
    let unknown = 0;
    let totalCents = 0;
    let approximate = false;
    const missingParts = [];
    for (let n = year.firstNumber; n <= year.lastNumber; n++) {
        if (n < s.firstNumber) {
            paidBefore += 1;
            continue;
        }
        if (s.lastNumber !== null && n > s.lastNumber)
            continue;
        count += 1;
        const c = live.get(n);
        if (c) {
            if (c.status === 'quitado') {
                paid += 1;
                totalCents += c.payment?.amountCents ?? c.amountCents;
            }
            else {
                openCount += 1;
                totalCents += c.amountCents;
                approximate ||= c.amountIsEstimate;
            }
        }
        else if (skippedSet.has(n)) {
            skipped += 1;
        }
        else if (n < known) {
            unknown += 1;
        }
        else if (seriesMonthOf(s, n) < floor) {
            missingParts.push(n - year.firstNumber + 1);
        }
        else {
            notCreated += 1;
            const t = requireTerm(s, n);
            totalCents += t.amountCents;
            approximate ||= t.amountMode === 'variavel';
        }
    }
    const missing = missingParts.length;
    const entersOn = addMonths(year.firstMonth, -ANNUAL_LEAD_MONTHS);
    const Y = year.label;
    const valued = paid + openCount + notCreated > 0;
    let line;
    if (planned) {
        line = `${Y} · previsto · ${money(totalCents, approximate)} · entra em Contas a pagar em ${formatMonthYearBR(entersOn)}`;
    }
    else if (k === 1) {
        const state = paid ? 'paga' : openCount ? 'em aberto' : skipped ? 'não houve' : missing ? 'sem conta registrada' : notCreated ? 'ainda não criada' : null;
        line = [Y, state, valued ? money(totalCents, approximate) : null].filter(Boolean).join(' · ');
    }
    else {
        line = [
            Y,
            plural(count, 'parcela', 'parcelas'),
            paid ? plural(paid, 'paga', 'pagas') : null,
            openCount ? `${openCount} em aberto` : null,
            skipped ? plural(skipped, 'tirada', 'tiradas') : null,
            missing ? `${missing} sem conta registrada` : null,
            notCreated ? plural(notCreated, 'ainda não criada', 'ainda não criadas') : null,
            valued ? money(totalCents, approximate) : null,
        ]
            .filter(Boolean)
            .join(' · ');
    }
    let missingText = null;
    if (missing > 0) {
        const hint = 'Se você pagou, anote o gasto em Anotar gasto.';
        if (k === 1)
            missingText = `${Y}: ficou sem conta registrada. ${hint}`;
        else if (missing === count && count > 1)
            missingText = `${Y}: as ${count} parcelas ficaram sem conta registrada. ${hint}`;
        else if (missing === 1)
            missingText = `${Y}: parcela ${missingParts[0]} sem conta registrada.`;
        else
            missingText = `${Y}: parcelas ${partsText(missingParts)} sem conta registrada.`;
    }
    const paidBeforeText = paidBefore === 0
        ? null
        : paidBefore === 1
            ? `${Y}: parcela 1 paga antes da Clarevo (informado por você).`
            : `${Y}: parcelas 1 a ${paidBefore} pagas antes da Clarevo (informado por você).`;
    return {
        year,
        count,
        paid,
        open: openCount,
        skipped,
        missing,
        paidBefore,
        notCreated,
        unknown,
        missingParts,
        totalCents,
        approximate,
        entersOn,
        planned,
        texts: { line, paidBefore: paidBeforeText, missing: missingText },
    };
}
export function affectedByYear(list, s, n, mode, amountCents) {
    if (s.kind !== 'anual')
        return { ok: false, code: 'tipo_invalido' };
    if (!Number.isSafeInteger(n) || n < s.firstNumber || (s.lastNumber !== null && n > s.lastNumber))
        return { ok: false, code: 'numero_fora_da_serie' };
    const k = partsOf(s);
    const year = annualYearOf(s, n);
    const Y = year.label;
    const inYear = [...liveByNumber(s, list).values()]
        .filter((c) => c.series.number >= year.firstNumber && c.series.number <= year.lastNumber)
        .sort(byNumber);
    const changing = inYear.filter((c) => c.status === 'aberto' && (mode === 'tirar' || c.amountIsEstimate));
    const unchanged = inYear
        .filter((c) => !changing.includes(c))
        .map((commitment) => ({ commitment, reason: commitment.status === 'quitado' ? 'paga' : 'informada' }));
    const paidCents = inYear.reduce((acc, c) => acc + (c.status === 'quitado' ? (c.payment?.amountCents ?? c.amountCents) : 0), 0);
    const N = changing.length;
    const name = (c) => (k === 1 ? `a conta de ${Y}` : `a parcela ${partOf(c)} de ${Y}`);
    if (N === 0) {
        const text = mode === 'informar'
            ? k === 1
                ? `A conta de ${Y} não está em aberto com valor estimado.`
                : `Nenhuma parcela de ${Y} está em aberto com valor estimado.`
            : k === 1
                ? `A conta de ${Y} não está em aberto.`
                : `Nenhuma parcela de ${Y} está em aberto.`;
        return { ok: false, code: 'nada_a_mudar', year, text };
    }
    const one = changing[0];
    let title;
    let text;
    let doneText;
    let totalCents;
    if (mode === 'informar') {
        title = `Informar o valor de ${Y}`;
        const keptOpen = unchanged.reduce((acc, u) => acc + (u.reason === 'informada' ? u.commitment.amountCents : 0), 0);
        totalCents = amountCents === undefined ? null : paidCents + keptOpen + N * amountCents;
        const head = N === 1 ? `Vai mudar: ${name(one)}, em aberto com valor estimado.` : `Vão mudar: as ${N} parcelas de ${Y} em aberto com valor estimado.`;
        const total = totalCents === null ? '' : ` Total de ${Y}: ${formatBRL(totalCents)}.`;
        const rule = k > 1 ? ' Não mudam: parcelas pagas e parcelas com valor já informado.' : '';
        text = `${head}${total}${rule}`;
        doneText =
            k === 1
                ? `Valor de ${Y} informado. A conta deixou de ser estimada.`
                : N === 1
                    ? `Valor de ${Y} informado. A parcela ${partOf(one)} deixou de ser estimada.`
                    : `Valor de ${Y} informado. As parcelas deixaram de ser estimadas.`;
    }
    else {
        totalCents = paidCents;
        title = k === 1 ? `Tirar a conta de ${Y}?` : N === 1 ? `Tirar a parcela ${partOf(one)} de ${Y}?` : `Tirar as ${N} parcelas de ${Y} em aberto?`;
        const continues = s.lastNumber === null || s.lastNumber > year.lastNumber;
        const nextLabel = annualYearLabel(s, year.index + 1);
        text = [
            N === 1 ? 'Ela sai de Contas a pagar e não volta a ser criada.' : 'Elas saem de Contas a pagar e não voltam a ser criadas.',
            unchanged.length > 0 ? 'As parcelas pagas continuam.' : null,
            continues ? `A conta do ano continua em ${nextLabel}.` : null,
        ]
            .filter(Boolean)
            .join(' ');
        doneText =
            k === 1
                ? `A conta de ${Y} saiu de Contas a pagar.`
                : N === 1
                    ? `A parcela ${partOf(one)} de ${Y} saiu de Contas a pagar.`
                    : `${N} parcelas de ${Y} saíram de Contas a pagar.`;
    }
    return { ok: true, year, affected: refs(changing), changing, unchanged, title, text, doneText, totalCents };
}
export function wholeYearPayment(list, s, chosen) {
    if (s.kind !== 'anual' || partsOf(s) === 1 || chosen.status !== 'aberto' || chosen.series?.id !== s.id)
        return null;
    const plan = affectedByYear(list, s, chosen.series.number, 'tirar');
    if (!plan.ok)
        return null;
    const others = plan.changing.filter((c) => c.id !== chosen.id);
    if (others.length === 0)
        return null;
    const Y = plan.year.label;
    const N = others.length;
    return {
        year: plan.year,
        others,
        affectedAfterPayment: refs(others),
        openTotalCents: others.reduce((acc, c) => acc + c.amountCents, chosen.amountCents),
        approximate: chosen.amountIsEstimate || others.some((c) => c.amountIsEstimate),
        label: 'Paguei o ano todo de uma vez (cota única)',
        hint: N === 1
            ? `Informe o valor total pago. A outra parcela de ${Y} em aberto sai de Contas a pagar e não volta, mesmo se você desfizer este pagamento.`
            : `Informe o valor total pago. As outras ${N} parcelas de ${Y} em aberto saem de Contas a pagar e não voltam, mesmo se você desfizer este pagamento.`,
        doneText: N === 1
            ? `Pagamento registrado. A outra parcela de ${Y} saiu de Contas a pagar.`
            : `Pagamento registrado. As outras ${N} parcelas de ${Y} saíram de Contas a pagar.`,
        failedText: `Pagamento registrado. Não foi possível tirar ${N === 1 ? 'a outra parcela' : 'as outras parcelas'} agora. Use Tirar as parcelas de ${Y} na conta do ano.`,
    };
}
export function suggestedAnnualReference(s, occurrences, today) {
    if (s.kind !== 'anual')
        return null;
    const k = partsOf(s);
    const live = [...liveByNumber(s, occurrences).values()];
    const last = live.filter((c) => c.status === 'quitado' && c.payment !== null).sort((a, b) => b.series.number - a.series.number)[0];
    if (!last)
        return null;
    const paidYear = annualYearOf(s, last.series.number);
    if (s.skippedNumbers.some((n) => n >= paidYear.firstNumber && n <= paidYear.lastNumber))
        return null;
    const fromNumber = paidYear.lastNumber + 1;
    if (fromNumber > editFromMaxNumber(s, today))
        return null;
    const nextLast = fromNumber + k - 1;
    if (live.some((c) => c.status === 'aberto' && c.seriesOverride && c.series.number >= fromNumber && c.series.number <= nextLast))
        return null;
    const amountCents = last.payment.amountCents;
    const term = requireTerm(s, fromNumber);
    if (term.amountCents === amountCents)
        return null;
    const fromLabel = annualYearLabel(s, paidYear.index + 1);
    const value = formatBRL(amountCents);
    return {
        amountCents,
        paidYear,
        fromNumber,
        fromLabel,
        edit: {
            nature: s.nature,
            description: term.description,
            category: term.category,
            amountCents,
            amountMode: term.amountMode,
            dueDay: term.dueDay,
        },
        text: k === 1
            ? `Em ${paidYear.label} você pagou ${value}. Usar esse valor como referência a partir de ${fromLabel}?`
            : `Em ${paidYear.label} você pagou ${value} na parcela ${paidYear.part}. Usar esse valor como referência de cada parcela a partir de ${fromLabel}?`,
        action: k === 1 ? `Usar ${value} a partir de ${fromLabel}` : `Usar ${value} por parcela a partir de ${fromLabel}`,
    };
}
export function groupAnnualLater(list) {
    const keyOf = (c) => {
        if (!c.series || c.series.kind !== 'anual')
            return null;
        const k = c.series.partsPerYear ?? 1;
        return `${c.series.id}|${Math.floor((c.series.number - 1) / k)}`;
    };
    const members = new Map();
    for (const c of list) {
        const key = keyOf(c);
        if (key !== null)
            members.set(key, [...(members.get(key) ?? []), c]);
    }
    const out = [];
    const done = new Set();
    for (const c of list) {
        const key = keyOf(c);
        const group = key === null ? undefined : members.get(key);
        if (!group || group.length < 2) {
            out.push({ type: 'conta', commitment: c });
            continue;
        }
        if (done.has(key))
            continue;
        done.add(key);
        const first = group[0];
        const k = first.series.partsPerYear ?? 1;
        const label = annualYearLabelOf(first);
        const dues = group.map((x) => x.dueOn).sort();
        const firstDueOn = dues[0];
        const lastDueOn = dues[dues.length - 1];
        const totalCents = group.reduce((acc, x) => acc + x.amountCents, 0);
        const approximate = group.some((x) => x.amountIsEstimate);
        const count = group.length;
        const span = firstDueOn.slice(0, 4) === lastDueOn.slice(0, 4)
            ? `de ${formatDayMonth(firstDueOn)} a ${formatDateBR(lastDueOn)}`
            : `de ${formatDateBR(firstDueOn)} a ${formatDateBR(lastDueOn)}`;
        const sameAmount = group.every((x) => x.amountCents === first.amountCents);
        const about = approximate ? 'cerca de ' : '';
        const amountPhrase = sameAmount ? ` de ${about}${formatBRL(first.amountCents)}` : `, ${about}${formatBRL(totalCents)} no total`;
        out.push({
            type: 'ano',
            group: {
                seriesId: first.series.id,
                index: Math.floor((first.series.number - 1) / k),
                label,
                description: first.description,
                commitments: group,
                count,
                firstDueOn,
                lastDueOn,
                totalCents,
                approximate,
                allFixed: !approximate,
                title: `${first.description} de ${label}`,
                caption: `${count} parcelas, ${span}${approximate ? ' · estimado' : ''}`,
                a11yLabel: `${first.description} de ${label.replace('/', ' a ')}, ${count} parcelas${amountPhrase}${approximate ? ', valor estimado' : ''}, ` +
                    `de ${formatDateBR(firstDueOn)} a ${formatDateBR(lastDueOn)}, conta do ano. Toque para ver as parcelas.`,
            },
        });
    }
    return out;
}
