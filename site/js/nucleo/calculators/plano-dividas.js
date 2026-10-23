// Gerado por scripts/gerar-site.js a partir de packages/core/src/calculators/plano-dividas.ts. Não edite: rode "node scripts/gerar-site.js".
import { looksLikeCardNumber } from '../cards.js';
import { addMonths, formatMonthYearBR, monthOf } from '../dates.js';
import { effectiveOverdue } from '../dia-util.js';
import { roundDivBig } from '../learn/math.js';
import { centsToInput, formatBRL } from '../money.js';
import { INSTALLMENT_NATURES } from '../records.js';
import { remainingInstallments } from '../series.js';
import { charCount } from '../validation.js';
import { FieldReader, LIMIT_TEXT, countField, moneyField, monthsCount, monthsDuration, rateField } from './common.js';
import { parseCount, parseMoney, parseOptionalMoney, parsePercentBp } from './inputs.js';
export const PLANO_MAX_DEBTS = 10;
export const PLANO_MAX_MONTHS = 600;
export const PLANO_NAME_MAX = 30;
export const PLANO_RATE_RANGE = { parcelada: { min: 0, max: 9_999 }, saldo: { min: 1, max: 9_999 } };
export const PLANO_ESTIMATE_TEXT = 'Estimativa. O valor oficial de cada dívida é o que a instituição informar; peça o valor atualizado.';
export const PLANO_TEXT = {
    emptyList: 'Acrescente as dívidas que você quer comparar.',
    addDebt: 'Acrescentar dívida',
    maxReached: 'Você chegou a 10 dívidas. Tire alguma da conta para acrescentar outra.',
    removeDebt: 'Tirar da conta',
    removeDebtA11y: (name) => `Tirar da conta: ${name}`,
    debtTitle: (index) => `Dívida ${index + 1}`,
    listTitle: 'Suas dívidas',
    listHint: 'De 1 a 10 dívidas. Nada é gravado: tirar uma da conta não apaga nada.',
    prefilledNote: 'Preenchido com os seus parcelamentos em aberto. Informe a taxa ao mês de cada contrato; nada muda neles.',
    prefilledHidden: 'Valor oculto. Mostre os valores para editar.',
    showValues: 'Mostrar valores',
    showValuesA11y: (name) => `Mostrar valores para editar a parcela, ${name}`,
    typeGroup: (name) => `Tipo de dívida, ${name}`,
    loadFailed: 'Não foi possível ler os seus parcelamentos agora. Você pode acrescentar as dívidas à mão.',
    loading: 'Lendo os seus parcelamentos',
    typeHint: 'Parcelada: financiamento, compra parcelada ou outro parcelamento. Saldo com juros: rotativo do cartão, cheque especial ou outra dívida com saldo.',
    balanceStays: 'Com este pagamento, o saldo não diminui.',
    baselineCaption: 'Cada dívida só com os pagamentos de sempre, sem passar nada adiante.',
    balanceStaysNote: (name, interestCents) => `${name} fica fora da comparação até o pagamento ser maior que os juros do primeiro mês (${formatBRL(interestCents)}).`,
    savingsHint: (cents) => `No seu plano de guardar você informou ${formatBRL(cents)} por mês.`,
    noDebtCompared: 'Nenhuma dívida entra na comparação ainda.',
    noEnd: 'Com estes números, as dívidas não terminam em 50 anos.',
    needExtra: 'Informe quanto a mais você consegue pôr por mês para ver o efeito.',
    sequenceTitle: 'Em que ordem cada dívida termina',
    detailsTitle: 'Detalhes de cada ordem',
    scenario: {
        sem_extra: 'Sem valor a mais',
        com_extra: 'Com o valor a mais',
        maior_taxa: 'Maior taxa primeiro',
        menor_divida: 'Menor dívida primeiro',
    },
    sameInterest: 'As duas ordens têm o mesmo total de juros.',
    sameFirst: 'A primeira dívida termina no mesmo mês nas duas ordens.',
    sameEnd: 'Tudo termina no mesmo mês nas duas ordens.',
    hypotheses: {
        fixedRates: 'Taxas fixas, sem novas compras nem atrasos.',
        noFees: 'Sem IOF nem tarifas.',
        endOfMonth: 'Pagamentos no fim de cada mês, a partir do mês seguinte.',
        minimums: 'Cada dívida recebe todo mês a parcela, ou o pagamento que você informou.',
        snowballWithExtra: 'O valor a mais e as parcelas das dívidas já quitadas vão para a primeira dívida da ordem; o restante passa para a seguinte, no mesmo mês.',
        snowballNoExtra: 'As parcelas das dívidas já quitadas vão para a primeira dívida da ordem; o restante passa para a seguinte, no mesmo mês.',
        extraOnly: 'O valor a mais vai para a dívida todo mês, além do pagamento de sempre.',
        baseline: '"Sem valor a mais" paga cada dívida só com os pagamentos de sempre, sem passar nada adiante.',
        presentValue: 'O saldo inicial de uma dívida parcelada é o valor presente das parcelas que faltam, pela taxa informada. A parcela segue a tabela do contrato e o valor a mais abate o saldo.',
        overdueOut: 'Dos seus parcelamentos, entram só as parcelas que vencem de hoje em diante; as já vencidas e em aberto ficam fora desta conta.',
        noRate: (name) => `${name}: sem juros informados, conta só as parcelas.`,
    },
};
export const PLANO_FIELDS = {
    dividas: {
        label: 'Dívidas',
        kind: 'inteiro',
        min: 1,
        max: PLANO_MAX_DEBTS,
        errors: { vazio: PLANO_TEXT.emptyList, fora_da_faixa: 'Compare de 1 a 10 dívidas.' },
    },
    apelido: {
        label: 'Apelido',
        hint: 'Opcional. Até 30 caracteres. Fica só nesta tela.',
        kind: 'texto',
        optional: true,
        errors: {
            longo: 'Use no máximo 30 caracteres.',
            invalido: 'Não use o número do cartão no apelido. Use um nome, como Cartão azul.',
        },
    },
    tipo: {
        label: 'Tipo de dívida',
        kind: 'opcao',
        options: [
            { value: 'parcelada', label: 'Parcelada' },
            { value: 'saldo', label: 'Saldo com juros' },
        ],
        errors: { vazio: 'Escolha o tipo da dívida.' },
    },
    parcela: moneyField('Valor da parcela', 'o valor da parcela', '850,00'),
    restantes: countField('Parcelas que faltam', 'quantas parcelas faltam', 1, 480, 'Use de 1 a 480 parcelas.', 'De 1 a 480'),
    taxaParcelada: {
        ...rateField('Taxa de juros ao mês do contrato (%)', 'a taxa ao mês do contrato', '1,5', PLANO_RATE_RANGE.parcelada.min, PLANO_RATE_RANGE.parcelada.max, 'Use uma taxa de 0,00% a 99,99% ao mês, ou deixe em branco.', 'Opcional. Está no contrato ou no extrato. Em branco: conta só as parcelas.'),
        optional: true,
    },
    saldo: moneyField('Saldo hoje', 'o saldo de hoje', '1.000,00'),
    taxaSaldo: rateField('Taxa de juros ao mês (%)', 'a taxa ao mês', '8', PLANO_RATE_RANGE.saldo.min, PLANO_RATE_RANGE.saldo.max, 'Use uma taxa de 0,01% a 99,99% ao mês.', 'Está na fatura, no extrato ou no contrato.'),
    pagamento: moneyField('Quanto você paga por mês', 'quanto você paga por mês', '200,00'),
    extra: {
        label: 'Quanto a mais você consegue pôr por mês nas dívidas?',
        hint: 'Opcional. Em branco: só os pagamentos de sempre.',
        kind: 'dinheiro',
        optional: true,
        errors: { invalido: 'Confira o valor, como 200,00.', acima_do_limite: LIMIT_TEXT },
    },
};
const BP = 10000n;
function monthInterest(balance, bp) {
    return Number(roundDivBig(BigInt(balance) * BigInt(bp), BP));
}
export function installmentTable(parcela, bp, count) {
    const table = [0];
    if (bp === 0) {
        for (let k = 1; k <= count; k++)
            table.push(parcela * k);
        return table;
    }
    const pay = BigInt(parcela);
    const rate = BigInt(bp);
    const q = BP + rate;
    let qk = 1n;
    let bk = 1n;
    for (let k = 1; k <= count; k++) {
        qk *= q;
        bk *= BP;
        table.push(Number(roundDivBig(pay * BP * (qk - bk), rate * qk)));
    }
    return table;
}
function simulate(debts, pool) {
    const balance = debts.map((d) => d.initial);
    const applied = debts.map(() => 0);
    const closedAt = debts.map(() => 0);
    let totalPaid = 0;
    let interest = 0;
    for (let month = 1; month <= PLANO_MAX_MONTHS; month++) {
        let used = 0;
        for (let i = 0; i < debts.length; i++) {
            const open = balance[i];
            if (open <= 0)
                continue;
            const d = debts[i];
            let pay;
            if (d.table !== null) {
                const grown = applied[i] + monthInterest(applied[i], d.bp);
                const gap = d.table[Math.max(0, d.term - month)] - grown;
                const after = Math.max(0, gap);
                pay = Math.min(d.minimum, Math.max(0, gap + d.minimum));
                applied[i] = grown;
                interest += after + pay - open;
                balance[i] = after;
            }
            else {
                const j = monthInterest(open, d.bp);
                interest += j;
                const owed = open + j;
                pay = Math.min(d.minimum, owed);
                balance[i] = owed - pay;
            }
            totalPaid += pay;
            used += pay;
        }
        if (pool) {
            let rest = Math.max(0, pool.budget - used);
            for (const i of pool.order) {
                if (rest === 0)
                    break;
                const open = balance[i];
                if (open > 0) {
                    const pay = Math.min(rest, open);
                    balance[i] = open - pay;
                    applied[i] = applied[i] + pay;
                    rest -= pay;
                    totalPaid += pay;
                }
            }
        }
        for (let i = 0; i < debts.length; i++)
            if (balance[i] === 0 && closedAt[i] === 0)
                closedAt[i] = month;
        if (closedAt.every((c) => c > 0))
            return { months: month, totalPaid, interest, closedAt };
    }
    return { months: null, totalPaid: 0, interest: 0, closedAt };
}
export function planoDebtStays(d) {
    if (d.tipo !== 'saldo')
        return false;
    const saldo = parseMoney(d.saldo ?? '');
    const bp = parsePercentBp(d.taxaSaldo ?? '', PLANO_RATE_RANGE.saldo);
    const pagamento = parseMoney(d.pagamento ?? '');
    if (!saldo.ok || !bp.ok || !pagamento.ok)
        return false;
    return pagamento.value <= monthInterest(saldo.value, bp.value);
}
export function planoDebtName(apelido, index) {
    const nick = (apelido ?? '').trim();
    return nick !== '' ? nick : PLANO_TEXT.debtTitle(index);
}
const lowerFirst = (text) => text.charAt(0).toLowerCase() + text.slice(1);
const calendarMonth = (today, months) => (today === undefined ? null : addMonths(monthOf(today), months));
function buildScenario(id, sim, included, today, caption = null) {
    const title = PLANO_TEXT.scenario[id];
    if (sim.months === null) {
        return {
            id,
            title,
            months: null,
            endMonth: null,
            firstMonth: null,
            totalPaidCents: null,
            interestCents: null,
            sequence: [],
            summary: `${title}: ${lowerFirst(PLANO_TEXT.noEnd)}`,
            detailLines: [],
            sequenceLines: [],
            caption,
        };
    }
    const sequence = included
        .map((d, k) => ({ index: d.index, name: d.name, month: sim.closedAt[k], calendar: calendarMonth(today, sim.closedAt[k]) }))
        .sort((a, b) => a.month - b.month || a.index - b.index);
    const endMonth = calendarMonth(today, sim.months);
    const interest = sim.interest;
    return {
        id,
        title,
        months: sim.months,
        endMonth,
        firstMonth: sequence[0].month,
        totalPaidCents: sim.totalPaid,
        interestCents: interest,
        sequence,
        summary: `${title}: tudo termina em ${monthsDuration(sim.months)}${endMonth ? `, em ${formatMonthYearBR(endMonth)}` : ''}.`,
        detailLines: [`Total pago: ${formatBRL(sim.totalPaid)}`, `Juros estimados: ${formatBRL(interest)}`],
        sequenceLines: sequence.map((s, k) => `${k + 1}. ${s.name}: termina em ${monthsCount(s.month)}${s.calendar ? ` (${formatMonthYearBR(s.calendar)})` : ''}.`),
        caption,
    };
}
function differences(maior, menor) {
    if (maior.months === null || menor.months === null)
        return [];
    const out = [];
    const interest = menor.interestCents - maior.interestCents;
    if (interest > 0)
        out.push(`${maior.title}: ${formatBRL(interest)} a menos de juros.`);
    else if (interest < 0)
        out.push(`${menor.title}: ${formatBRL(-interest)} a menos de juros.`);
    else
        out.push(PLANO_TEXT.sameInterest);
    const first = menor.firstMonth - maior.firstMonth;
    if (first < 0)
        out.push(`${menor.title}: a primeira dívida termina ${monthsCount(-first)} antes.`);
    else if (first > 0)
        out.push(`${maior.title}: a primeira dívida termina ${monthsCount(first)} antes.`);
    else
        out.push(PLANO_TEXT.sameFirst);
    const end = menor.months - maior.months;
    if (end < 0)
        out.push(`${menor.title}: tudo termina ${monthsCount(-end)} antes.`);
    else if (end > 0)
        out.push(`${maior.title}: tudo termina ${monthsCount(end)} antes.`);
    else
        out.push(PLANO_TEXT.sameEnd);
    return out;
}
export function calcPlanoDividas(input, today) {
    const r = new FieldReader();
    const extra = r.read('extra', parseOptionalMoney(input.extra));
    const list = input.dividas;
    if (list.length === 0)
        return { ok: false, errors: { dividas: 'vazio', ...r.errors } };
    if (list.length > PLANO_MAX_DEBTS)
        return { ok: false, errors: { dividas: 'fora_da_faixa', ...r.errors } };
    const infos = [];
    const tables = new Map();
    list.forEach((d, i) => {
        const nick = (d.apelido ?? '').trim();
        if (charCount(nick) > PLANO_NAME_MAX)
            r.fail(`apelido.${i}`, 'longo');
        else if (looksLikeCardNumber(nick))
            r.fail(`apelido.${i}`, 'invalido');
        const name = planoDebtName(d.apelido, i);
        if (d.tipo === 'parcelada') {
            const parcela = r.read(`parcela.${i}`, parseMoney(d.parcela ?? ''));
            const restantes = r.read(`restantes.${i}`, parseCount(d.restantes ?? '', 1, 480));
            const rateText = d.taxaParcelada ?? '';
            const bp = rateText.trim() === '' ? null : r.read(`taxaParcelada.${i}`, parsePercentBp(rateText, PLANO_RATE_RANGE.parcelada));
            if (parcela === undefined || restantes === undefined || (rateText.trim() !== '' && bp === undefined))
                return;
            const rate = bp ?? null;
            const table = installmentTable(parcela, rate ?? 0, restantes);
            tables.set(i, table);
            const initial = table[restantes];
            infos.push({
                index: i,
                name,
                tipo: 'parcelada',
                initialCents: initial,
                rateBp: rate,
                minimumCents: parcela,
                firstInterestCents: Math.max(0, table[restantes - 1] + parcela - initial),
                restantes,
                excluded: false,
            });
        }
        else if (d.tipo === 'saldo') {
            const saldo = r.read(`saldo.${i}`, parseMoney(d.saldo ?? ''));
            const bp = r.read(`taxaSaldo.${i}`, parsePercentBp(d.taxaSaldo ?? '', PLANO_RATE_RANGE.saldo));
            const pagamento = r.read(`pagamento.${i}`, parseMoney(d.pagamento ?? ''));
            if (saldo === undefined || bp === undefined || pagamento === undefined)
                return;
            const firstInterest = monthInterest(saldo, bp);
            infos.push({
                index: i,
                name,
                tipo: 'saldo',
                initialCents: saldo,
                rateBp: bp,
                minimumCents: pagamento,
                restantes: null,
                firstInterestCents: firstInterest,
                excluded: planoDebtStays(d),
            });
        }
        else {
            r.fail(`tipo.${i}`, 'vazio');
        }
    });
    if (!r.ok || extra === undefined)
        return { ok: false, errors: r.errors };
    const extraCents = extra ?? 0;
    const included = infos.filter((d) => !d.excluded);
    const sim = included.map((d) => ({
        initial: d.initialCents,
        bp: d.rateBp ?? 0,
        minimum: d.minimumCents,
        term: d.restantes,
        table: tables.get(d.index) ?? null,
    }));
    const initialSum = included.reduce((s, d) => s + d.initialCents, 0);
    const budget = extraCents + sim.reduce((s, d) => s + d.minimum, 0);
    const scenarios = [];
    let diff = [];
    const lines = [];
    if (included.length > 0) {
        const baseCaption = included.length > 1 && extraCents === 0 ? PLANO_TEXT.baselineCaption : null;
        const base = buildScenario('sem_extra', simulate(sim, null), included, today, baseCaption);
        scenarios.push(base);
        lines.push(base.summary);
        if (included.length === 1) {
            if (extraCents > 0) {
                const withExtra = buildScenario('com_extra', simulate(sim, { order: [0], budget }), included, today);
                scenarios.push(withExtra);
                lines.push(withExtra.summary);
                if (base.months !== null && withExtra.months !== null) {
                    const saved = base.interestCents - withExtra.interestCents;
                    if (saved > 0)
                        lines.push(`Com o valor a mais: ${formatBRL(saved)} a menos de juros.`);
                    const earlier = base.months - withExtra.months;
                    if (earlier > 0)
                        lines.push(`Com o valor a mais: tudo termina ${monthsCount(earlier)} antes.`);
                }
            }
            else {
                lines.push(PLANO_TEXT.needExtra);
            }
        }
        else {
            const positions = sim.map((_, k) => k);
            const byRate = [...positions].sort((a, b) => sim[b].bp - sim[a].bp || sim[a].initial - sim[b].initial || a - b);
            const bySize = [...positions].sort((a, b) => sim[a].initial - sim[b].initial || sim[b].bp - sim[a].bp || a - b);
            const maior = buildScenario('maior_taxa', simulate(sim, { order: byRate, budget }), included, today);
            const menor = buildScenario('menor_divida', simulate(sim, { order: bySize, budget }), included, today);
            scenarios.push(maior, menor);
            lines.push(maior.summary, menor.summary);
            diff = differences(maior, menor);
            lines.push(...diff);
        }
    }
    else {
        lines.push(PLANO_TEXT.noDebtCompared);
    }
    const H = PLANO_TEXT.hypotheses;
    const hypotheses = [H.fixedRates, H.noFees, H.endOfMonth, H.minimums];
    if (included.length > 1)
        hypotheses.push(extraCents > 0 ? H.snowballWithExtra : H.snowballNoExtra);
    else if (included.length === 1 && extraCents > 0)
        hypotheses.push(H.extraOnly);
    if (included.length > 1)
        hypotheses.push(H.baseline);
    if (included.some((d) => d.tipo === 'parcelada' && d.rateBp !== null))
        hypotheses.push(H.presentValue);
    for (const d of included)
        if (d.tipo === 'parcelada' && d.rateBp === null)
            hypotheses.push(H.noRate(d.name));
    const notes = [PLANO_ESTIMATE_TEXT, ...infos.filter((d) => d.excluded).map((d) => PLANO_TEXT.balanceStaysNote(d.name, d.firstInterestCents))];
    return {
        ok: true,
        result: {
            extraCents,
            debts: infos,
            included: included.length,
            initialSumCents: initialSum,
            scenarios,
            differences: diff,
            resultLines: lines,
            hypotheses,
            notes,
        },
    };
}
export function seriesDebtDrafts(items, today) {
    const out = [];
    for (const { series: s, occurrences, open } of items) {
        if (out.length >= PLANO_MAX_DEBTS)
            break;
        if (s.kind !== 'parcelada' || !INSTALLMENT_NATURES.includes(s.nature))
            continue;
        const next = remainingInstallments(s, occurrences, open, today)?.filter((x) => !effectiveOverdue(x.dueOn, 'parcelamento', today));
        if (!next || next.length === 0 || next.length > 480)
            continue;
        const term = [...s.terms].reverse().find((t) => t.fromNumber <= next[0].number) ?? s.terms[0];
        const raw = [...(term?.description ?? '').trim()].slice(0, PLANO_NAME_MAX).join('').trim();
        out.push({ seriesId: s.id, name: looksLikeCardNumber(raw) ? '' : raw, parcelaCents: next[0].amountCents, restantes: next.length });
    }
    return out;
}
export function draftToInput(d) {
    return { tipo: 'parcelada', apelido: d.name, parcela: centsToInput(d.parcelaCents), restantes: String(d.restantes), taxaParcelada: '' };
}
