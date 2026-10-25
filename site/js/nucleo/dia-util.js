// Gerado por scripts/gerar-site.js a partir de packages/core/src/dia-util.ts. Não edite: rode "node scripts/gerar-site.js".
import { addDays, formatDateBR, formatDayMonth, isValidIsoDate } from './dates.js';
const PLANALTO = 'Presidência da República';
export const NATIONAL_HOLIDAYS_CONSULTED_ON = '2026-10-19';
export const NATIONAL_HOLIDAYS_REVIEWED_ON = '2026-10-19';
export const NATIONAL_HOLIDAYS_REVIEW_EVERY_MONTHS = 12;
export const NATIONAL_HOLIDAY_SOURCES = [
    {
        kind: 'oficial',
        publisher: PLANALTO,
        title: 'Lei nº 662, de 6 de abril de 1949, com a redação da Lei nº 10.607, de 19 de dezembro de 2002 (feriados nacionais)',
        url: 'https://www.planalto.gov.br/ccivil_03/leis/l0662.htm',
        locator: 'Art. 1º, "Redação dada pela Lei nº 10.607, de 19.12.2002": 1º de janeiro, 21 de abril, 1º de maio, 7 de setembro, 2 de novembro, 15 de novembro e 25 de dezembro. A Lei nº 10.607/2002 revogou a Lei nº 1.266, de 8.12.1950, cujo art. 3º já declarava feriado nacional o 21 de abril (Tiradentes). Trecho de resultado de busca; a página não abriu',
        consultedOn: NATIONAL_HOLIDAYS_CONSULTED_ON,
    },
    {
        kind: 'oficial',
        publisher: PLANALTO,
        title: 'Lei nº 6.802, de 30 de junho de 1980 (12 de outubro, Nossa Senhora Aparecida)',
        url: 'https://www.planalto.gov.br/ccivil_03/LEIS/L6802.htm',
        locator: 'Art. 1º: declarado feriado nacional o dia 12 de outubro, para culto público e oficial a Nossa Senhora Aparecida, Padroeira do Brasil; Art. 2º: vigência na data da publicação (Diário Oficial de 1º de julho de 1980). Trecho de resultado de busca; a página não abriu',
        consultedOn: NATIONAL_HOLIDAYS_CONSULTED_ON,
    },
    {
        kind: 'oficial',
        publisher: PLANALTO,
        title: 'Lei nº 14.759, de 21 de dezembro de 2023 (20 de novembro, Dia Nacional de Zumbi e da Consciência Negra)',
        url: 'https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2023/lei/l14759.htm',
        locator: 'Art. 1º: declarado feriado nacional o dia 20 de novembro, Dia Nacional de Zumbi e da Consciência Negra; Art. 2º: vigência na data da publicação (Diário Oficial de 22 de dezembro de 2023, e o primeiro feriado foi em 20 de novembro de 2024). Trecho de resultado de busca; a página não abriu',
        consultedOn: NATIONAL_HOLIDAYS_CONSULTED_ON,
    },
];
export const NATIONAL_HOLIDAY_LAWS = [
    'Lei nº 662/1949, com a redação da Lei nº 10.607/2002',
    'Lei nº 6.802/1980',
    'Lei nº 14.759/2023',
];
export const DUE_RULE_CONSULTED_ON = '2026-10-19';
export const DUE_RULE_LAW = 'Lei nº 7.089/1983';
export const DUE_RULE_SOURCES = [
    {
        kind: 'oficial',
        publisher: PLANALTO,
        title: 'Lei nº 7.089, de 23 de março de 1983 (juros de mora em título que vence em sábado, domingo ou feriado)',
        url: 'https://www.planalto.gov.br/ccivil_03/leis/l7089.htm',
        locator: 'Art. 1º: "Fica proibida a cobrança de juros de mora, por estabelecimentos bancários e instituições financeiras, sobre títulos de qualquer natureza, cujo vencimento se dê em sábado, domingo ou feriado, desde que seja quitado no primeiro dia subsequente."; o art. 2º foi vetado e a lei não menciona multa. Trecho de resultado de busca; a página não abriu',
        consultedOn: DUE_RULE_CONSULTED_ON,
    },
    {
        kind: 'oficial',
        publisher: 'Superior Tribunal de Justiça',
        title: 'Notícia do STJ: juros sobre dívida não paga no primeiro dia útil subsequente incidem a partir do vencimento original (REsp 1.954.924, Terceira Turma). É notícia do tribunal, não o acórdão',
        url: 'https://www.stj.jus.br/sites/portalp/Paginas/Comunicacao/Noticias/25022022-Juros-sobre-divida-nao-paga-no-primeiro-dia-util-subsequente-incidem-a-partir-do-vencimento-original.aspx',
        locator: 'Se a dívida vence em dia não útil e o pagamento não é feito no primeiro dia útil subsequente, os juros de mora são contados a partir do vencimento original (fatura de cartão que venceu num sábado e foi paga depois); a proteção do art. 1º da Lei 7.089/1983 depende do pagamento no primeiro dia útil seguinte. Trecho de resultado de busca; a página não abriu',
        consultedOn: DUE_RULE_CONSULTED_ON,
    },
];
const RULES = [
    { month: 1, day: 1, name: 'Confraternização Universal', law: 0, fromYear: 1949 },
    { month: 4, day: 21, name: 'Tiradentes', law: 0, fromYear: 1951 },
    { month: 5, day: 1, name: 'Dia do Trabalho', law: 0, fromYear: 1949 },
    { month: 9, day: 7, name: 'Independência do Brasil', law: 0, fromYear: 1949 },
    { month: 10, day: 12, name: 'Nossa Senhora Aparecida', law: 1, fromYear: 1980 },
    { month: 11, day: 2, name: 'Finados', law: 0, fromYear: 2003 },
    { month: 11, day: 15, name: 'Proclamação da República', law: 0, fromYear: 1949 },
    { month: 11, day: 20, name: 'Dia Nacional de Zumbi e da Consciência Negra', law: 2, fromYear: 2024 },
    { month: 12, day: 25, name: 'Natal', law: 0, fromYear: 1949 },
];
const two = (n) => String(n).padStart(2, '0');
export function nationalHolidays(year) {
    if (!Number.isInteger(year) || year < 1000 || year > 9999)
        return [];
    return RULES.filter((r) => year >= r.fromYear).map((r) => ({
        date: `${year}-${two(r.month)}-${two(r.day)}`,
        name: r.name,
        month: r.month,
        day: r.day,
        law: NATIONAL_HOLIDAY_LAWS[r.law],
        source: r.law,
    }));
}
export function nationalHolidayOn(date) {
    if (!isValidIsoDate(date))
        return null;
    return nationalHolidays(Number(date.slice(0, 4))).find((h) => h.date === date) ?? null;
}
export function weekdayOf(date) {
    if (!isValidIsoDate(date))
        return null;
    const [y, m, d] = date.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
export function isWeekend(date) {
    const w = weekdayOf(date);
    return w === 0 || w === 6;
}
export function isBusinessDay(date) {
    const w = weekdayOf(date);
    return w !== null && w !== 0 && w !== 6 && nationalHolidayOn(date) === null;
}
export function nextBusinessDay(date) {
    if (!isValidIsoDate(date))
        return null;
    let day = addDays(date, 1);
    for (let i = 0; i < 31 && !isBusinessDay(day); i++)
        day = addDays(day, 1);
    return day;
}
const WEEKDAY = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
export function weekdayName(date) {
    const w = weekdayOf(date);
    return w === null ? '' : WEEKDAY[w];
}
function onWeekday(date) {
    const w = weekdayOf(date);
    return w === null ? '' : `${w === 0 || w === 6 ? 'no' : 'na'} ${WEEKDAY[w]}`;
}
export const DUE_KINDS = ['conta', 'fatura', 'gasto_fixo', 'parcelamento', 'conta_do_ano'];
export function hasNextBusinessDayGrace(kind) {
    return kind !== 'conta_do_ano';
}
export function dueKindOfSeries(kind) {
    return kind === 'anual' ? 'conta_do_ano' : kind === 'parcelada' ? 'parcelamento' : 'gasto_fixo';
}
export function dueKindOf(c) {
    if (c.invoice)
        return 'fatura';
    return c.series ? dueKindOfSeries(c.series.kind) : 'conta';
}
export function lastOnTimeDay(dueOn, kind) {
    if (!hasNextBusinessDayGrace(kind) || !isValidIsoDate(dueOn) || isBusinessDay(dueOn))
        return dueOn;
    return nextBusinessDay(dueOn) ?? dueOn;
}
export function effectiveOverdue(dueOn, kind, today) {
    return lastOnTimeDay(dueOn, kind) < today;
}
export function isCommitmentOverdue(c, today) {
    return effectiveOverdue(c.dueOn, dueKindOf(c), today);
}
export const DUE_DAY_TEXT = {
    advice: 'Confira com quem cobra se o pagamento pode ser feito no próximo dia útil.',
    adviceYearBill: 'Impostos podem ter regra diferente. Confira a data no carnê ou no site do órgão.',
    nextBusinessDayTag: '(próximo dia útil)',
    sign: 'Não é dia útil',
    learnMore: 'Saiba mais',
    learnMoreA11y: 'Saiba mais sobre vencimento em dia que não é útil',
    learnMoreTitle: 'Vencimento em dia que não é útil',
    learnMoreParagraphs: [
        'A Clarevo não muda a data de vencimento: ela segue como você anotou, ou como o dia escolhido do gasto fixo, do parcelamento ou da conta do ano a calcula. Quando essa data cai em sábado, domingo ou feriado nacional, a conta, o boleto ou a fatura aparece como "Vence terça, 13/10 (próximo dia útil)" e só passa a vencida depois que esse dia termina. Os totais, a ordem das contas e o lembrete seguem na data de vencimento.',
        'A Lei nº 7.089/1983 proíbe bancos e instituições financeiras de cobrar juros de mora sobre título que vence em sábado, domingo ou feriado, desde que seja quitado no primeiro dia subsequente, que o STJ lê como o primeiro dia útil seguinte. A multa e as regras de cada cobrança podem variar, e a Clarevo não sabe qual vale para a sua conta. Por isso, confira com quem cobra antes de escolher a data do pagamento.',
        'Se o pagamento passar do primeiro dia útil, os juros podem contar desde a data original do vencimento: é o entendimento do STJ, que o tribunal divulgou em notícia sobre um caso de fatura de cartão.',
        'Contas do ano, como IPVA, IPTU e matrícula, costumam ser tributos e não ganham essa tolerância na Clarevo: ficam vencidas a partir do dia seguinte ao vencimento. Impostos podem ter regra diferente. Confira a data no carnê ou no site do órgão.',
        'Contam só os feriados nacionais de data fixa definidos em lei federal: 1º de janeiro, 21 de abril, 1º de maio, 7 de setembro, 12 de outubro, 2 de novembro, 15 de novembro, 20 de novembro e 25 de dezembro. Carnaval, Sexta-feira Santa, Corpus Christi e os feriados de estados e municípios não entram. O dia de eleição cai sempre num domingo, que já é coberto pelo fim de semana. Quem cobra pode ter outro calendário.',
    ],
    source: `Fontes: ${NATIONAL_HOLIDAY_LAWS.join('; ')}; ${DUE_RULE_LAW}; notícia do STJ sobre o REsp 1.954.924. Consultadas em ${formatDateBR(NATIONAL_HOLIDAYS_CONSULTED_ON)}.`,
};
export function nextBusinessDayWhen(dueOn, kind, today) {
    if (!hasNextBusinessDayGrace(kind) || !isValidIsoDate(dueOn) || isBusinessDay(dueOn))
        return null;
    const last = nextBusinessDay(dueOn);
    if (last < today)
        return null;
    const when = last === today ? 'hoje' : `${weekdayName(last)}, ${formatDayMonth(last)}`;
    return { lastOnTime: last, when: `${when} ${DUE_DAY_TEXT.nextBusinessDayTag}` };
}
export function nextBusinessDayDueText(dueOn, kind, today) {
    const w = nextBusinessDayWhen(dueOn, kind, today);
    return w === null ? null : `Vence ${w.when}`;
}
export function dueDayNotice(dueOn, kind = 'conta') {
    if (!isValidIsoDate(dueOn) || isBusinessDay(dueOn))
        return null;
    const next = nextBusinessDay(dueOn);
    const holiday = nationalHolidayOn(dueOn);
    const w = weekdayOf(dueOn);
    const reason = w === 6 ? 'sabado' : w === 0 ? 'domingo' : 'feriado';
    const why = holiday ? ` (feriado nacional: ${holiday.name})` : '';
    const grace = hasNextBusinessDayGrace(kind);
    const opening = `Vence ${onWeekday(dueOn)}, ${formatDateBR(dueOn)}, que não é dia útil${why}.`;
    const text = grace
        ? `${opening} O próximo dia útil é ${weekdayName(next)}, ${formatDateBR(next)}. Só depois desse dia ela passa a vencida.`
        : `${opening} Em conta do ano, a Clarevo não usa o próximo dia útil: ela passa a vencida a partir do dia seguinte ao vencimento.`;
    const advice = grace ? DUE_DAY_TEXT.advice : DUE_DAY_TEXT.adviceYearBill;
    const registered = `${weekdayName(dueOn)}, ${formatDayMonth(dueOn)}`;
    return {
        dueOn,
        kind,
        grace,
        reason,
        holiday,
        nextBusinessDay: next,
        lastOnTimeDay: grace ? next : dueOn,
        text,
        advice,
        sign: DUE_DAY_TEXT.sign,
        signLine: grace ? `${DUE_DAY_TEXT.sign} · vencimento anotado: ${registered}` : `${DUE_DAY_TEXT.sign} · confira a data no carnê ou no site do órgão`,
        signA11y: grace
            ? `${DUE_DAY_TEXT.sign.toLowerCase()}, vencimento anotado ${registered}`
            : `${DUE_DAY_TEXT.sign.toLowerCase()}, confira a data no carnê ou no site do órgão`,
        a11y: `${text} ${advice}`,
    };
}
export function commitmentDueNotice(c, today) {
    if (c.status !== 'aberto')
        return null;
    const kind = dueKindOf(c);
    return effectiveOverdue(c.dueOn, kind, today) ? null : dueDayNotice(c.dueOn, kind);
}
export function invoiceDueNotice(invoice, today) {
    if ((invoice.situation !== 'aberta' && invoice.situation !== 'fechada') || invoice.totalCents <= 0)
        return null;
    return effectiveOverdue(invoice.dueOn, 'fatura', today) ? null : dueDayNotice(invoice.dueOn, 'fatura');
}
export function plannedDueNotice(dueOn, today, kind = 'gasto_fixo') {
    return effectiveOverdue(dueOn, kind, today) ? null : dueDayNotice(dueOn, kind);
}
