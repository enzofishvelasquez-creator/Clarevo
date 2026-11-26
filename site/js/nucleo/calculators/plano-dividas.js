// Gerado por scripts/gerar-site.js a partir de packages/core/src/calculators/plano-dividas.ts. Não edite: rode "node scripts/gerar-site.js".
import { looksLikeCardNumber } from '../cards.js';
import { addMonths, formatMonthYearBR, monthOf } from '../dates.js';
import { effectiveOverdue } from '../dia-util.js';
import { formatInteger } from '../learn/format.js';
import { roundDivBig } from '../learn/math.js';
import { centsToInput, formatBRL } from '../money.js';
import { INSTALLMENT_NATURES } from '../records.js';
import { remainingInstallments } from '../series.js';
import { charCount } from '../validation.js';
import { FieldReader, calcNotes, LIMIT_TEXT, countField, moneyField, monthsCount, monthsDuration, rateField } from './common.js';
import { parseCount, parseMoney, parseOptionalMoney, parsePercentBp } from './inputs.js';
export const PLANO_MAX_DEBTS = 10;
export const PLANO_MAX_MONTHS = 600;
export const PLANO_NAME_MAX = 30;
export const PLANO_RATE_RANGE = { parcelada: { min: 0, max: 9_999 }, saldo: { min: 1, max: 9_999 } };
export const PLANO_ESTIMATE_TEXT = 'Estimativa. O valor oficial de cada dívida é o que a instituição informar; peça o valor atualizado.';
export const PLANO_TEXT = {
    intro: 'Monte um plano para quitar as suas dívidas. Informe cada dívida e quanto consegue pôr a mais por mês: a conta mostra por qual começar, quando cada uma acaba e quanto de juros sai da conta, em duas ordens lado a lado.',
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
    typeHint: 'Parcelada: financiamento, compra parcelada ou outro parcelamento, com parcela fixa até o fim. Saldo com juros: rotativo do cartão, cheque especial ou outra dívida em que os juros entram todo mês sobre o que falta.',
    balanceStays: 'Com este pagamento, o saldo não diminui.',
    baselineCaption: 'Cada dívida só com os pagamentos de sempre, sem passar nada adiante.',
    balanceStaysNote: (name, interestCents) => `${name}: com o pagamento de sempre, o saldo não diminui (juros de ${formatBRL(interestCents)} no primeiro mês). A dívida continua no plano e diminui só com o valor a mais ou com o pagamento de uma dívida que acabe.`,
    unknownRateNote: (names, many, several) => `Sem a taxa de ${names}, a conta usa só as parcelas, como se não houvesse juros. ${many
        ? `O saldo real, os juros estimados e o lugar ${several ? 'dessas dívidas' : 'dessa dívida'} em "Maior taxa primeiro" ficam incertos, e as diferenças entre as ordens valem só com essa hipótese.`
        : 'O saldo real e os juros estimados ficam incertos.'} Informe a taxa do contrato para comparar.`,
    savingsHint: (cents) => `No seu plano de guardar você informou ${formatBRL(cents)} por mês.`,
    noDebtCompared: 'Nenhuma dívida entra na comparação ainda.',
    noEnd: 'Com estes números, as dívidas não terminam em 50 anos.',
    needExtra: 'Informe quanto a mais você consegue pôr por mês para ver o efeito.',
    sequenceTitle: 'Em que ordem cada dívida termina',
    detailsTitle: 'Detalhes de cada ordem',
    scenario: {
        sem_extra: 'Pagamentos atuais, sem repasse',
        com_extra: 'Com o valor a mais',
        maior_taxa: 'Maior taxa primeiro',
        menor_divida: 'Menor dívida primeiro',
    },
    comparisonTitle: 'As duas ordens, lado a lado',
    rows: {
        start: 'Começa por',
        first: 'Primeira a acabar',
        end: 'Tudo termina em',
        interest: 'Juros estimados',
    },
    baselineOne: 'Sem valor a mais',
    rowNever: {
        first: 'nenhuma em 50 anos',
        end: 'mais de 50 anos',
        interest: 'sem estimativa',
    },
    startNone: 'todas acabam juntas',
    planTitle: 'O plano, passo a passo',
    bothTitle: 'As duas ordens',
    bothCaption: 'Maior taxa primeiro e Menor dívida primeiro: com estes números, dão no mesmo.',
    sameOutcome: 'Com estes números, as duas ordens dão no mesmo: o mesmo plano, o mesmo fim e os mesmos juros estimados.',
    hypotheses: {
        fixedRates: 'Taxas fixas, sem novas compras nem atrasos.',
        noFees: 'Sem IOF nem tarifas.',
        endOfMonth: 'Pagamentos no fim de cada mês, a partir do mês seguinte.',
        minimums: 'Cada dívida recebe todo mês a parcela, ou o pagamento que você informou.',
        snowballWithExtra: 'O valor a mais e os pagamentos das dívidas que acabam vão para a primeira dívida da ordem que ainda não acabou; o que sobrar passa para a seguinte, no mesmo mês.',
        snowballNoExtra: 'Os pagamentos das dívidas que acabam vão para a primeira dívida da ordem que ainda não acabou; o que sobrar passa para a seguinte, no mesmo mês.',
        extraOnly: 'O valor a mais vai para a dívida todo mês, além do pagamento de sempre.',
        orders: 'Maior taxa primeiro: o que sobra vai antes para a dívida com a maior taxa ao mês. Menor dívida primeiro: vai antes para a dívida com o menor saldo hoje. Empate: a outra regra, depois a ordem da lista.',
        baseline: 'O ganho é comparado com os pagamentos atuais, sem repasse: cada dívida só com o pagamento de sempre, sem o valor a mais e sem passar adiante o pagamento das que acabam.',
        baselineOne: 'O ganho é comparado com pagar só o de sempre, sem o valor a mais.',
        twoEffects: 'Com valor a mais, o ganho junta o efeito do valor a mais e o de passar adiante os pagamentos das dívidas que acabam; a frase "Só passando adiante os pagamentos" mostra o segundo sozinho.',
        cents: 'Juros de cada mês no centavo, metade para cima; o saldo de uma parcelada segue a tabela do contrato, arredondada uma vez por mês.',
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
        hint: 'Opcional. Até 30 caracteres. É o nome da dívida no plano e fica só nesta tela.',
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
    parcela: moneyField('Valor da parcela', 'o valor da parcela', '850,00', {
        hint: 'O que você já paga por mês nesta dívida. Quando ela acaba, este valor passa para a próxima do plano.',
    }),
    restantes: countField('Parcelas que faltam', 'quantas parcelas faltam', 1, 480, 'Use de 1 a 480 parcelas.', 'De 1 a 480. Diz quando a dívida acaba sem nada a mais.'),
    taxaParcelada: {
        ...rateField('Taxa de juros ao mês do contrato (%)', 'a taxa ao mês do contrato', '1,5', PLANO_RATE_RANGE.parcelada.min, PLANO_RATE_RANGE.parcelada.max, 'Use uma taxa de 0,00% a 99,99% ao mês, ou deixe em branco.', 'Opcional. Está no contrato ou no extrato. Define o lugar da dívida em "Maior taxa primeiro" e quanto de juros o valor a mais evita. Em branco: conta só as parcelas.'),
        optional: true,
    },
    saldo: moneyField('Saldo hoje', 'o saldo de hoje', '1.000,00', {
        hint: 'Quanto falta pagar hoje. Define o lugar da dívida em "Menor dívida primeiro".',
    }),
    taxaSaldo: rateField('Taxa de juros ao mês (%)', 'a taxa ao mês', '8', PLANO_RATE_RANGE.saldo.min, PLANO_RATE_RANGE.saldo.max, 'Use uma taxa de 0,01% a 99,99% ao mês.', 'Está na fatura, no extrato ou no contrato. Define os juros de cada mês e o lugar da dívida em "Maior taxa primeiro".'),
    pagamento: moneyField('Quanto você paga por mês', 'quanto você paga por mês', '200,00', {
        hint: 'O que você já paga por mês. Precisa passar dos juros do mês para o saldo diminuir. Quando ela acaba, este valor passa para a próxima.',
    }),
    extra: {
        label: 'Além do que já paga, quanto a mais por mês você consegue pôr nas dívidas?',
        hint: 'Opcional, como 200,00. Vai todo mês para a dívida por onde o plano começa e encurta o prazo. Em branco: a conta usa só os pagamentos informados acima.',
        kind: 'dinheiro',
        optional: true,
        errors: { invalido: 'Confira o valor, como 200,00.', acima_do_limite: LIMIT_TEXT },
    },
};
const BP = 10000n;
const BALANCE_LIMIT = 10 ** 15;
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
function simulate(debts, pool, trail) {
    const balance = debts.map((d) => d.initial);
    const applied = debts.map(() => 0);
    const closedAt = debts.map(() => 0);
    let totalPaid = 0;
    let interest = 0;
    for (let month = 1; month <= PLANO_MAX_MONTHS; month++) {
        let used = 0;
        const rows = debts.map(() => null);
        for (let i = 0; i < debts.length; i++) {
            const open = balance[i];
            if (open <= 0)
                continue;
            const d = debts[i];
            let pay;
            let j;
            if (d.table !== null) {
                const grown = applied[i] + monthInterest(applied[i], d.bp);
                const gap = d.table[Math.max(0, d.term - month)] - grown;
                const after = Math.max(0, gap);
                pay = Math.min(d.minimum, Math.max(0, gap + d.minimum));
                applied[i] = grown;
                j = after + pay - open;
                balance[i] = after;
            }
            else {
                j = monthInterest(open, d.bp);
                const owed = open + j;
                pay = Math.min(d.minimum, owed);
                balance[i] = owed - pay;
            }
            interest += j;
            totalPaid += pay;
            used += pay;
            if (trail)
                rows[i] = { index: trail.indexes[i], name: trail.names[i], openingCents: open, interestCents: j, paymentCents: pay, extraCents: 0, closingCents: balance[i] };
        }
        let residue = 0;
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
                    const row = rows[i];
                    if (row) {
                        row.extraCents = pay;
                        row.closingCents = balance[i];
                    }
                }
            }
            residue = rest;
        }
        if (trail)
            trail.out.push({ month, rows: rows.filter((r) => r !== null), residueCents: residue });
        for (let i = 0; i < debts.length; i++)
            if (balance[i] === 0 && closedAt[i] === 0)
                closedAt[i] = month;
        if (closedAt.every((c) => c > 0))
            return { months: month, totalPaid, interest, closedAt };
        if (balance.some((b) => b > BALANCE_LIMIT))
            break;
    }
    return { months: null, totalPaid: 0, interest: 0, closedAt };
}
function ordersOf(sim) {
    const positions = sim.map((_, k) => k);
    return {
        byRate: [...positions].sort((a, b) => sim[b].bp - sim[a].bp || sim[a].initial - sim[b].initial || a - b),
        bySize: [...positions].sort((a, b) => sim[a].initial - sim[b].initial || sim[b].bp - sim[a].bp || a - b),
    };
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
function buildScenario(id, sim, included, today, caption = null, withSequence = false) {
    const title = id === 'sem_extra' && included.length === 1 ? PLANO_TEXT.baselineOne : PLANO_TEXT.scenario[id];
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
        sequenceLines: withSequence ? sequence.map((s, k) => `${k + 1}. ${s.name}: termina em ${monthsCount(s.month)}${s.calendar ? ` (${formatMonthYearBR(s.calendar)})` : ''}.`) : [],
        caption,
    };
}
const brl = formatBRL;
function whenText(months, calendar) {
    return `${monthsCount(months)}${calendar ? ` (${formatMonthYearBR(calendar)})` : ''}`;
}
function stepWhen(month, today) {
    const cal = calendarMonth(today, month);
    if (!cal)
        return `Mês ${formatInteger(month)}`;
    const text = formatMonthYearBR(cal);
    return `${text.charAt(0).toUpperCase()}${text.slice(1)} (mês ${formatInteger(month)})`;
}
function namesList(names) {
    return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
}
function differences(maior, menor) {
    if (maior.months === null || menor.months === null)
        return [];
    const out = [];
    const interest = menor.interestCents - maior.interestCents;
    if (interest > 0)
        out.push(`Na ordem ${maior.title}, os juros estimados são ${brl(interest)} menores.`);
    else if (interest < 0)
        out.push(`Na ordem ${menor.title}, os juros estimados são ${brl(-interest)} menores.`);
    const first = menor.firstMonth - maior.firstMonth;
    if (first < 0)
        out.push(`Na ordem ${menor.title}, a primeira dívida acaba ${monthsCount(-first)} antes.`);
    else if (first > 0)
        out.push(`Na ordem ${maior.title}, a primeira dívida acaba ${monthsCount(first)} antes.`);
    const end = menor.months - maior.months;
    if (end < 0)
        out.push(`Na ordem ${menor.title}, tudo termina ${monthsCount(-end)} antes.`);
    else if (end > 0)
        out.push(`Na ordem ${maior.title}, tudo termina ${monthsCount(end)} antes.`);
    return out;
}
function sameOutcome(a, b) {
    return (a.months === b.months &&
        a.interestCents === b.interestCents &&
        a.firstMonth === b.firstMonth &&
        a.sequence.length === b.sequence.length &&
        a.sequence.every((s, i) => s.index === b.sequence[i].index && s.month === b.sequence[i].month));
}
function planStart(order, closedAt, included, extraCents) {
    if (extraCents > 0)
        return included[order[0]].name;
    const first = Math.min(...closedAt);
    const k = order.find((i) => closedAt[i] > first);
    return k === undefined ? null : included[k].name;
}
function buildPlan(id, title, order, sim, included, extraCents, today, base, scenario, repasse = null) {
    const repasseOnly = repasse === null ? null : { months: repasse.months, interestCents: repasse.months === null ? null : repasse.interest };
    if (sim.months === null)
        return { id, title, startName: null, steps: [PLANO_TEXT.noEnd], gain: null, repasseOnly };
    const many = included.length > 1;
    const startName = planStart(order, sim.closedAt, included, extraCents);
    const steps = [];
    const everyone = many ? 'o pagamento de sempre de cada dívida' : 'o pagamento de sempre';
    steps.push(`A partir ${today ? `de ${formatMonthYearBR(calendarMonth(today, 1))} (mês 1)` : 'do mês 1'}: ${everyone}${extraCents > 0 ? ` e os ${brl(extraCents)} a mais em ${included[order[0]].name}` : ''}.`);
    const months = [...new Set(sim.closedAt)].sort((a, b) => a - b);
    const closed = new Set();
    for (const m of months) {
        const group = included.map((_, k) => k).filter((k) => sim.closedAt[k] === m);
        for (const k of group)
            closed.add(k);
        const names = namesList(group.map((k) => included[k].name));
        const verb = group.length === 1 ? 'acaba' : 'acabam';
        const open = order.filter((k) => !closed.has(k));
        if (open.length === 0) {
            steps.push(`${stepWhen(m, today)}: ${names} ${verb}${many ? ', e tudo está quitado' : ''}.`);
            continue;
        }
        const freed = group.reduce((s, k) => s + included[k].minimumCents, 0);
        const receives = extraCents + [...closed].reduce((s, k) => s + included[k].minimumCents, 0);
        const target = included[open[0]].name;
        const their = group.length === 1 ? `O pagamento dela (${brl(freed)})` : `Os pagamentos delas (${brl(freed)})`;
        steps.push(`${stepWhen(m, today)}: ${names} ${verb}. ${their} ${group.length === 1 ? 'passa' : 'passam'} para ${target}${receives !== freed ? `, que fica com ${brl(receives)} por mês além do pagamento de sempre` : ''}.`);
    }
    let gain = null;
    const parts = (months, interestCents) => {
        const earlier = base.months - months;
        const saved = base.interestCents - interestCents;
        return [...(earlier > 0 ? [`${monthsCount(earlier)} antes`] : []), ...(saved > 0 ? [`${brl(saved)} a menos de juros`] : [])];
    };
    if (base.months === null) {
        gain = many
            ? 'Com os pagamentos atuais, sem repasse, as dívidas não terminariam em 50 anos.'
            : 'Só com o de sempre, a dívida não terminaria em 50 anos.';
    }
    else {
        const p = parts(scenario.months, scenario.interestCents);
        if (p.length > 0) {
            const against = !many
                ? 'em relação a pagar só o de sempre'
                : extraCents > 0
                    ? 'em relação aos pagamentos atuais, sem repasse'
                    : 'só por passar adiante os pagamentos das dívidas que acabam, sem dinheiro a mais';
            gain = `Ganho estimado, ${against}: ${p.join(' e ')}.`;
        }
    }
    if (repasseOnly !== null) {
        let line;
        if (repasseOnly.months === null)
            line = 'Só passando adiante os pagamentos, sem o valor a mais, as dívidas não terminariam em 50 anos.';
        else if (base.months === null)
            line = `Só passando adiante os pagamentos, sem o valor a mais, tudo terminaria em ${monthsCount(repasseOnly.months)}.`;
        else {
            const p = parts(repasseOnly.months, repasseOnly.interestCents);
            line =
                p.length > 0
                    ? `Só passando adiante os pagamentos, sem o valor a mais, seriam ${p.join(' e ')}.`
                    : 'Só passando adiante os pagamentos, sem o valor a mais, o fim e os juros seriam os mesmos dos pagamentos atuais.';
        }
        gain = gain === null ? line : `${gain} ${line}`;
    }
    return { id, title, startName, steps, gain, repasseOnly };
}
function buildComparison(orders) {
    const R = PLANO_TEXT.rows;
    const N = PLANO_TEXT.rowNever;
    const firstText = (s) => {
        if (s.months === null)
            return N.first;
        const names = namesList(s.sequence.filter((x) => x.month === s.firstMonth).map((x) => x.name));
        const first = s.sequence[0];
        return `${names}, em ${first.calendar ? formatMonthYearBR(first.calendar) : monthsCount(first.month)}`;
    };
    const endText = (s) => (s.months === null ? N.end : whenText(s.months, s.endMonth));
    const interestText = (s) => (s.interestCents === null ? N.interest : brl(s.interestCents));
    const rows = [
        { label: R.start, values: orders.map((o) => (o.scenario.months === null ? N.first : (o.start ?? PLANO_TEXT.startNone))) },
        { label: R.first, values: orders.map((o) => firstText(o.scenario)) },
        { label: R.end, values: orders.map((o) => endText(o.scenario)) },
        { label: R.interest, values: orders.map((o) => interestText(o.scenario)) },
    ];
    const lines = orders.map(({ scenario: s, start }) => {
        if (s.months === null)
            return `${s.title}: ${lowerFirst(PLANO_TEXT.noEnd)}`;
        const begin = start === null ? 'nada é passado adiante antes de todas acabarem' : `começa por ${start}`;
        const many = s.sequence.filter((x) => x.month === s.firstMonth).length > 1;
        return `${s.title}: ${begin}; ${many ? 'as primeiras a acabar são' : 'a primeira a acabar é'} ${firstText(s)}; tudo termina em ${endText(s)}, com ${interestText(s)} de juros estimados.`;
    });
    return { columns: orders.map((o) => o.scenario.title), rows, lines };
}
function headlineOf(included, extraCents, base, orders) {
    const many = included.length > 1;
    const when = (s) => whenText(s.months, s.endMonth);
    const interestClause = (s) => (s.interestCents > 0 ? `, com ${brl(s.interestCents)} de juros estimados` : '');
    if (orders.length === 0) {
        if (base.months === null)
            return 'Com estes números, a dívida não termina em 50 anos.';
        return `Só com o pagamento de sempre, ${included[0].name} acaba em ${when(base)}${interestClause(base)}.`;
    }
    const ends = orders.filter((o) => o.months !== null);
    if (ends.length === 0) {
        return many ? 'Com estes números, as dívidas não terminam em 50 anos, em nenhuma das duas ordens.' : 'Com estes números, a dívida não termina em 50 anos, nem com o valor a mais.';
    }
    const lead = extraCents > 0 ? `Com ${brl(extraCents)} a mais por mês` : 'Passando adiante o pagamento de cada dívida que acaba';
    if (ends.length < orders.length)
        return `${lead}, tudo termina em ${when(ends[0])} na ordem ${ends[0].title}; na outra, as dívidas não terminam em 50 anos.`;
    const subject = many ? 'tudo termina' : `${included[0].name} acaba`;
    const sorted = [...orders].sort((a, b) => a.months - b.months);
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const monthsDiffer = first.months !== last.months;
    const endText = monthsDiffer ? `${when(first)} ou ${when(last)}` : when(first);
    if (base.months === null) {
        return `${lead}, ${subject} em ${endText}${monthsDiffer ? ', conforme a ordem' : ''}; sem isso, ${many ? 'as dívidas não terminariam' : 'a dívida não terminaria'} em 50 anos.`;
    }
    const savings = orders.map((o) => base.interestCents - o.interestCents);
    const low = Math.min(...savings);
    const high = Math.max(...savings);
    const earlier = base.months > last.months;
    if (!earlier && high <= 0) {
        return `Só com os pagamentos de sempre, ${subject} em ${when(base)}${interestClause(base)}.`;
    }
    const instead = earlier ? `, em vez de ${when(base)}` : '';
    const saved = high <= 0 ? '' : low === high ? `, com ${brl(high)} a menos de juros estimados` : low <= 0 ? `, com até ${brl(high)} a menos de juros estimados` : `, com ${brl(low)} a ${brl(high)} a menos de juros estimados`;
    const differ = monthsDiffer || (high > 0 && low !== high);
    return `${lead}, ${subject} em ${endText}${instead}${saved}${differ ? ', conforme a ordem' : ''}.`;
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
                stays: false,
                unknownRate: rate === null,
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
                stays: planoDebtStays(d),
                unknownRate: false,
            });
        }
        else {
            r.fail(`tipo.${i}`, 'vazio');
        }
    });
    if (!r.ok || extra === undefined)
        return { ok: false, errors: r.errors };
    const extraCents = extra ?? 0;
    const included = infos;
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
    let same = false;
    let headline = PLANO_TEXT.noDebtCompared;
    let comparison = null;
    let plans = [];
    const tailLines = [];
    if (included.length > 0) {
        const baseCaption = included.length > 1 && extraCents === 0 ? PLANO_TEXT.baselineCaption : null;
        const base = buildScenario('sem_extra', simulate(sim, null), included, today, baseCaption, included.length > 1);
        scenarios.push(base);
        if (included.length === 1) {
            if (extraCents > 0) {
                const order = [0];
                const run = simulate(sim, { order, budget });
                const withExtra = buildScenario('com_extra', run, included, today);
                scenarios.push(withExtra);
                headline = headlineOf(included, extraCents, base, [withExtra]);
                plans = [buildPlan('com_extra', PLANO_TEXT.planTitle, order, run, included, extraCents, today, base, withExtra)];
            }
            else {
                headline = headlineOf(included, extraCents, base, []);
                tailLines.push(PLANO_TEXT.needExtra);
            }
        }
        else {
            const { byRate, bySize } = ordersOf(sim);
            const runRate = simulate(sim, { order: byRate, budget });
            const runSize = simulate(sim, { order: bySize, budget });
            const repasseBudget = budget - extraCents;
            const repasseRate = extraCents > 0 ? simulate(sim, { order: byRate, budget: repasseBudget }) : null;
            const repasseSize = extraCents > 0 ? simulate(sim, { order: bySize, budget: repasseBudget }) : null;
            const maior = buildScenario('maior_taxa', runRate, included, today);
            const menor = buildScenario('menor_divida', runSize, included, today);
            scenarios.push(maior, menor);
            diff = differences(maior, menor);
            same = sameOutcome(maior, menor);
            headline = headlineOf(included, extraCents, base, [maior, menor]);
            const planRate = buildPlan('maior_taxa', maior.title, byRate, runRate, included, extraCents, today, base, maior, repasseRate);
            const planSize = buildPlan('menor_divida', menor.title, bySize, runSize, included, extraCents, today, base, menor, repasseSize);
            const cmp = buildComparison([
                { scenario: maior, start: planRate.startName },
                { scenario: menor, start: planSize.startName },
            ]);
            const identical = cmp.rows.every((row) => row.values[0] === row.values[1]) && planRate.steps.join('|') === planSize.steps.join('|');
            if (identical) {
                if (maior.months !== null)
                    diff = [PLANO_TEXT.sameOutcome];
                plans = maior.months === null ? [] : [{ ...planRate, id: 'ambas', title: PLANO_TEXT.bothTitle }];
            }
            else {
                comparison = cmp;
                plans = [planRate, planSize];
            }
            if (extraCents === 0)
                tailLines.push(PLANO_TEXT.needExtra);
        }
    }
    const planHeading = (p) => (p.id === 'com_extra' ? `${p.title}:` : `${p.title}, passo a passo:`);
    const lines = [
        headline,
        ...(comparison ? comparison.lines : []),
        ...diff,
        ...plans.flatMap((p) => [planHeading(p), ...p.steps, ...(p.gain ? [p.gain] : [])]),
        ...tailLines,
    ];
    const H = PLANO_TEXT.hypotheses;
    const hypotheses = [H.fixedRates, H.noFees, H.endOfMonth, H.minimums];
    if (included.length > 1)
        hypotheses.push(extraCents > 0 ? H.snowballWithExtra : H.snowballNoExtra, H.orders);
    else if (included.length === 1 && extraCents > 0)
        hypotheses.push(H.extraOnly);
    if (included.length > 1)
        hypotheses.push(H.baseline);
    else if (extraCents > 0)
        hypotheses.push(H.baselineOne);
    if (included.length > 1 && extraCents > 0)
        hypotheses.push(H.twoEffects);
    if (included.some((d) => d.tipo === 'parcelada' && d.rateBp !== null))
        hypotheses.push(H.presentValue);
    for (const d of included)
        if (d.tipo === 'parcelada' && d.rateBp === null)
            hypotheses.push(H.noRate(d.name));
    if (included.length > 0)
        hypotheses.push(H.cents);
    const unknown = infos.filter((d) => d.unknownRate).map((d) => d.name);
    const notes = calcNotes(['estimate', PLANO_ESTIMATE_TEXT], unknown.length > 0 && ['warning', PLANO_TEXT.unknownRateNote(namesList(unknown), included.length > 1, unknown.length > 1)], ...infos.filter((d) => d.stays).map((d) => ['warning', PLANO_TEXT.balanceStaysNote(d.name, d.firstInterestCents)]));
    return {
        ok: true,
        result: {
            extraCents,
            debts: infos,
            included: included.length,
            initialSumCents: initialSum,
            scenarios,
            headline,
            comparison,
            differences: diff,
            plans,
            tailLines,
            sameOutcome: same,
            resultLines: lines,
            hypotheses,
            ...notes,
        },
    };
}
export function planoTrail(input, scenario, options = {}) {
    const out = calcPlanoDividas(input);
    if (!out.ok)
        return null;
    const debts = out.result.debts;
    if (debts.length === 0)
        return null;
    const sim = debts.map((d) => ({
        initial: d.initialCents,
        bp: d.rateBp ?? 0,
        minimum: d.minimumCents,
        term: d.restantes,
        table: d.tipo === 'parcelada' ? installmentTable(d.minimumCents, d.rateBp ?? 0, d.restantes) : null,
    }));
    const extra = options.repasseOnly === true ? 0 : out.result.extraCents;
    const budget = extra + sim.reduce((sum, d) => sum + d.minimum, 0);
    const { byRate, bySize } = ordersOf(sim);
    let pool;
    if (scenario === 'sem_extra')
        pool = null;
    else if (scenario === 'com_extra') {
        if (debts.length !== 1)
            return null;
        pool = { order: [0], budget };
    }
    else {
        if (debts.length < 2)
            return null;
        pool = { order: scenario === 'maior_taxa' ? byRate : bySize, budget };
    }
    const trail = [];
    const run = simulate(sim, pool, { names: debts.map((d) => d.name), indexes: debts.map((d) => d.index), out: trail });
    return { months: run.months, trail };
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
