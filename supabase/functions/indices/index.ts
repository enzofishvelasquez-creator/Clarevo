// @ts-nocheck
// GERADO por scripts/gerar-funcoes.js a partir de packages/core/src/indices. Não editar à mão: mude o núcleo e rode `npm run indices`.
// Clarevo · função do servidor "indices" (Edge Function do Supabase, D-093): busca no Banco Central as séries públicas do CDI (4391) e
// do IPCA (433) e devolve ao app, para comparar com a rentabilidade dos investimentos que a pessoa registra. Não recebe nem guarda dado
// de ninguém (só o mês de partida). Sem segredos; opcional CLAREVO_APP_URL. Publicar com "Verify JWT" ligado (só quem está no app).

const __mods = [
  // packages/core/src/indices/servidor.ts
  function (module, exports, __req) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.brazilToday = brazilToday;
    exports.indicesConfigFrom = indicesConfigFrom;
    exports.indicesStartMonth = indicesStartMonth;
    exports.createIndicesHandler = createIndicesHandler;
    const dates_1 = __req(1);
    const investments_1 = __req(2);
    function brazilToday() {
        return (0, dates_1.todayIn)('America/Sao_Paulo');
    }
    function indicesConfigFrom(env) {
        return { appUrl: (env('CLAREVO_APP_URL') ?? 'https://app.clarevo.app.br').replace(/\/+$/, '') };
    }
    const CACHE_MS = 6 * 60 * 60 * 1000;
    const FIRST_MONTH = '2000-01';
    const JSON_TYPE = 'application/json; charset=utf-8';
    function cors(origin, appUrl) {
        if (origin === null)
            return {};
        if (origin !== appUrl && !/^http:\/\/localhost(:\d+)?$/.test(origin))
            return {};
        return {
            'Access-Control-Allow-Origin': origin,
            'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Max-Age': '86400',
            Vary: 'Origin',
        };
    }
    function indicesStartMonth(requested, today) {
        const current = (0, dates_1.monthOf)(today);
        const fallback = (0, dates_1.addMonths)(current, -24);
        const m = typeof requested === 'string' && (0, dates_1.isValidIsoMonth)(requested) ? requested : fallback;
        if ((0, dates_1.monthsBetween)(FIRST_MONTH, m) < 0)
            return FIRST_MONTH;
        if ((0, dates_1.monthsBetween)(m, current) < 0)
            return current;
        return m;
    }
    function createIndicesHandler(deps) {
        const cache = new Map();
        const now = deps.now ?? (() => Date.now());
        return async (req) => {
            const headers = cors(req.header('origin'), deps.config.appUrl);
            if (req.method === 'OPTIONS')
                return { status: 204, body: '', headers };
            if (req.method !== 'GET' && req.method !== 'POST')
                return { status: 405, body: JSON.stringify({ erro: 'metodo' }), headers: { ...headers, 'Content-Type': JSON_TYPE } };
            let requested = null;
            if (req.method === 'GET') {
                try {
                    requested = new URL(req.url).searchParams.get('desde');
                }
                catch {
                    requested = null;
                }
            }
            else {
                try {
                    const parsed = JSON.parse((await req.body()) || '{}');
                    requested = parsed?.desde ?? null;
                }
                catch {
                    requested = null;
                }
            }
            const today = deps.today();
            const from = indicesStartMonth(requested, today);
            const key = `${from}|${today}`;
            const hit = cache.get(key);
            if (hit && now() - hit.at < CACHE_MS)
                return { status: 200, body: hit.body, headers: { ...headers, 'Content-Type': JSON_TYPE } };
            try {
                const get = async (code) => {
                    const r = await deps.fetch((0, investments_1.bcbSeriesUrl)(code, `${from}-01`, today), { timeoutMs: 8000 });
                    if (!r.ok)
                        throw new Error(`bcb_${code}_${r.status}`);
                    return (0, investments_1.parseBcbSeries)(await r.json());
                };
                const [cdi, ipca] = await Promise.all([get(investments_1.BCB_SERIES.cdi), get(investments_1.BCB_SERIES.ipca)]);
                const body = JSON.stringify({ cdi, ipca, fetchedOn: today });
                cache.set(key, { at: now(), body });
                return { status: 200, body, headers: { ...headers, 'Content-Type': JSON_TYPE } };
            }
            catch (e) {
                deps.log?.(`indices: ${e instanceof Error ? e.message : 'falha'}`);
                return { status: 502, body: JSON.stringify({ erro: 'indices_indisponiveis' }), headers: { ...headers, 'Content-Type': JSON_TYPE } };
            }
        };
    }
  },
  // packages/core/src/dates.ts
  function (module, exports, __req) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.isValidIsoDate = isValidIsoDate;
    exports.daysInMonth = daysInMonth;
    exports.parseDateBR = parseDateBR;
    exports.formatDateBR = formatDateBR;
    exports.formatDayMonth = formatDayMonth;
    exports.formatListDate = formatListDate;
    exports.formatShortDate = formatShortDate;
    exports.deviceTimeZone = deviceTimeZone;
    exports.todayIn = todayIn;
    exports.addDays = addDays;
    exports.maskDateBR = maskDateBR;
    exports.monthOf = monthOf;
    exports.isValidIsoMonth = isValidIsoMonth;
    exports.monthsBetween = monthsBetween;
    exports.dateInMonth = dateInMonth;
    exports.parseMonthBR = parseMonthBR;
    exports.formatMonthInputBR = formatMonthInputBR;
    exports.maskMonthBR = maskMonthBR;
    exports.addMonths = addMonths;
    exports.addMonthsToDate = addMonthsToDate;
    exports.addYearsClamped = addYearsClamped;
    exports.daysBetween = daysBetween;
    exports.monthRange = monthRange;
    exports.formatDateTimeBR = formatDateTimeBR;
    exports.formatDayHeader = formatDayHeader;
    exports.formatMonthName = formatMonthName;
    exports.formatMonthBR = formatMonthBR;
    exports.formatMonthYearBR = formatMonthYearBR;
    exports.formatMonthSpanBR = formatMonthSpanBR;
    const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
    function isValidIsoDate(value) {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
        if (!m)
            return false;
        const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
        if (mo < 1 || mo > 12 || d < 1)
            return false;
        return d <= daysInMonth(y, mo);
    }
    function daysInMonth(y, mo) {
        return new Date(Date.UTC(y, mo, 0)).getUTCDate();
    }
    function parseDateBR(input) {
        const m = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*$/.exec(input);
        if (!m)
            return null;
        const iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
        return isValidIsoDate(iso) ? iso : null;
    }
    function formatDateBR(iso) {
        const [y, m, d] = iso.split('-');
        return `${d}/${m}/${y}`;
    }
    function formatDayMonth(iso) {
        const [, m, d] = iso.split('-');
        return `${d}/${m}`;
    }
    function formatListDate(iso, today) {
        return iso.slice(0, 4) === today.slice(0, 4) ? formatDayMonth(iso) : formatDateBR(iso);
    }
    function formatShortDate(iso) {
        const [, m, d] = iso.split('-');
        return `${Number(d)} ${(MONTHS[Number(m) - 1] ?? '').slice(0, 3)}`;
    }
    function deviceTimeZone() {
        try {
            return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo';
        }
        catch {
            return 'America/Sao_Paulo';
        }
    }
    function todayIn(timeZone, now = new Date()) {
        return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
    }
    function addDays(date, delta) {
        const [y, m, d] = date.split('-').map(Number);
        return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
    }
    function maskDateBR(text) {
        const d = text.replace(/\D/g, '').slice(0, 8);
        return d.slice(0, 2) + (d.length > 2 ? `/${d.slice(2, 4)}` : '') + (d.length > 4 ? `/${d.slice(4)}` : '');
    }
    function monthOf(date) {
        return date.slice(0, 7);
    }
    function isValidIsoMonth(value) {
        return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
    }
    function monthsBetween(from, to) {
        const [y1, m1] = from.split('-').map(Number);
        const [y2, m2] = to.split('-').map(Number);
        return y2 * 12 + m2 - (y1 * 12 + m1);
    }
    function dateInMonth(month, day) {
        const [y, m] = month.split('-').map(Number);
        return `${month}-${String(Math.min(day, daysInMonth(y, m))).padStart(2, '0')}`;
    }
    function parseMonthBR(input) {
        const m = /^\s*(\d{1,2})\/(\d{4})\s*$/.exec(input);
        if (!m)
            return null;
        const month = `${m[2]}-${m[1].padStart(2, '0')}`;
        return isValidIsoMonth(month) ? month : null;
    }
    function formatMonthInputBR(month) {
        const [y, m] = month.split('-');
        return `${m}/${y}`;
    }
    function maskMonthBR(text) {
        const d = text.replace(/\D/g, '').slice(0, 6);
        return d.slice(0, 2) + (d.length > 2 ? `/${d.slice(2)}` : '');
    }
    function addMonths(month, delta) {
        const [y, m] = month.split('-').map(Number);
        const total = y * 12 + (m - 1) + delta;
        return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
    }
    function addMonthsToDate(date, delta) {
        const month = addMonths(monthOf(date), delta);
        const [y, m] = month.split('-').map(Number);
        const d = Math.min(Number(date.slice(8, 10)), daysInMonth(y, m));
        return `${month}-${String(d).padStart(2, '0')}`;
    }
    function addYearsClamped(date, delta) {
        return addMonthsToDate(date, delta * 12);
    }
    function daysBetween(from, to) {
        const utc = (iso) => {
            const [y, m, d] = iso.split('-').map(Number);
            return Date.UTC(y, m - 1, d);
        };
        return Math.round((utc(to) - utc(from)) / 86_400_000);
    }
    function monthRange(month) {
        return { start: `${month}-01`, endExclusive: `${addMonths(month, 1)}-01` };
    }
    function formatDateTimeBR(isoInstant, timeZone) {
        const parts = new Intl.DateTimeFormat('pt-BR', {
            timeZone,
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hourCycle: 'h23',
        }).formatToParts(new Date(isoInstant));
        const get = (t) => parts.find((p) => p.type === t)?.value ?? '';
        return `${get('day')}/${get('month')}/${get('year')} às ${get('hour')}:${get('minute')}`;
    }
    function formatDayHeader(date, today) {
        if (date === today)
            return 'Hoje';
        if (date === addDays(today, -1))
            return 'Ontem';
        const [, m, d] = date.split('-');
        return `${Number(d)} de ${MONTHS[Number(m) - 1] ?? ''}`;
    }
    function formatMonthName(month) {
        return MONTHS[Number(month.slice(5, 7)) - 1] ?? '';
    }
    function formatMonthBR(month) {
        const [y, m] = month.split('-');
        const name = MONTHS[Number(m) - 1] ?? '';
        return `${name.charAt(0).toUpperCase()}${name.slice(1)} de ${y}`;
    }
    function formatMonthYearBR(month) {
        return `${formatMonthName(month)} de ${month.slice(0, 4)}`;
    }
    function formatMonthSpanBR(from, to) {
        if (from === to)
            return `em ${formatMonthYearBR(from)}`;
        if (from.slice(0, 4) === to.slice(0, 4))
            return `de ${formatMonthName(from)} a ${formatMonthYearBR(to)}`;
        return `de ${formatMonthYearBR(from)} a ${formatMonthYearBR(to)}`;
    }
  },
  // packages/core/src/investments.ts
  function (module, exports, __req) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.INVESTMENT_TEXT = exports.INVESTMENT_FIELD_ORDER = exports.BCB_SERIES = exports.INVESTMENT_KIND_LABEL = exports.INVESTMENT_ACTIVE_MAX = exports.INVESTMENT_NOTE_MAX = exports.INVESTMENT_NAME_MAX = exports.INVESTMENT_MOVEMENT_KINDS = exports.INVESTMENT_STATUSES = exports.INVESTMENT_KINDS = void 0;
    exports.normalizeInvestmentName = normalizeInvestmentName;
    exports.investmentInputError = investmentInputError;
    exports.newInvestmentError = newInvestmentError;
    exports.investmentMovementError = investmentMovementError;
    exports.investmentValueOn = investmentValueOn;
    exports.investmentNegativeDay = investmentNegativeDay;
    exports.applyInvestmentChange = applyInvestmentChange;
    exports.investmentTotals = investmentTotals;
    exports.investmentGain = investmentGain;
    exports.monthlyReturns = monthlyReturns;
    exports.chainRates = chainRates;
    exports.parseBcbSeries = parseBcbSeries;
    exports.bcbSeriesUrl = bcbSeriesUrl;
    exports.indexOverMonths = indexOverMonths;
    exports.exampleIndices = exampleIndices;
    exports.compareLastClosedMonths = compareLastClosedMonths;
    exports.validateInvestmentDraft = validateInvestmentDraft;
    exports.investmentErrorText = investmentErrorText;
    const dates_1 = __req(1);
    const money_1 = __req(3);
    exports.INVESTMENT_KINDS = ['renda_fixa', 'titulos_publicos', 'acoes', 'fundos', 'previdencia', 'cripto', 'outro'];
    exports.INVESTMENT_STATUSES = ['ativo', 'encerrado'];
    exports.INVESTMENT_MOVEMENT_KINDS = ['aporte', 'resgate', 'rendimento', 'valor'];
    exports.INVESTMENT_NAME_MAX = 40;
    exports.INVESTMENT_NOTE_MAX = 80;
    exports.INVESTMENT_ACTIVE_MAX = 50;
    exports.INVESTMENT_KIND_LABEL = {
        renda_fixa: 'Renda fixa',
        titulos_publicos: 'Títulos públicos',
        acoes: 'Ações',
        fundos: 'Fundos',
        previdencia: 'Previdência',
        cripto: 'Criptoativos',
        outro: 'Outro',
    };
    const charCount = (text) => [...text].length;
    function normalizeInvestmentName(name) {
        return name.trim().replace(/\s+/g, ' ');
    }
    function investmentInputError(input) {
        const name = normalizeInvestmentName(input.name ?? '');
        if (charCount(name) < 1 || charCount(name) > exports.INVESTMENT_NAME_MAX)
            return 'nome_invalido';
        if (!exports.INVESTMENT_KINDS.includes(input.kind))
            return 'tipo_invalido';
        return null;
    }
    const validAmount = (c, min) => Number.isSafeInteger(c) && c >= min && c <= money_1.MAX_RECORD_CENTS;
    function newInvestmentError(input, today) {
        const base = investmentInputError(input);
        if (base)
            return base;
        if (!validAmount(input.investedCents, 1))
            return 'valor_invalido';
        if (input.currentCents !== null && !validAmount(input.currentCents, 0))
            return 'valor_invalido';
        if (!(0, dates_1.isValidIsoDate)(input.startOn))
            return 'data_invalida';
        if (input.startOn > today)
            return 'data_futura';
        return null;
    }
    function investmentMovementError(kind, input, today) {
        if (!exports.INVESTMENT_MOVEMENT_KINDS.includes(kind))
            return 'tipo_invalido';
        if (!validAmount(input.amountCents, kind === 'valor' ? 0 : 1))
            return 'valor_invalido';
        if (!(0, dates_1.isValidIsoDate)(input.occurredOn))
            return 'data_invalida';
        if (input.occurredOn > today)
            return 'data_futura';
        if (input.note !== null && (charCount(input.note.trim()) < 1 || charCount(input.note.trim()) > exports.INVESTMENT_NOTE_MAX))
            return 'observacao_invalida';
        return null;
    }
    const FLOW_SIGN = { aporte: 1, resgate: -1, rendimento: 0, valor: 0 };
    function sorted(movements) {
        return [...movements].sort((a, b) => (a.occurredOn < b.occurredOn ? -1 : a.occurredOn > b.occurredOn ? 1 : (a.kind === 'valor' ? 1 : 0) - (b.kind === 'valor' ? 1 : 0)));
    }
    function investmentValueOn(movements, date) {
        let value = 0;
        for (const m of sorted(movements)) {
            if (m.occurredOn > date)
                break;
            value = m.kind === 'valor' ? m.amountCents : value + FLOW_SIGN[m.kind] * m.amountCents;
        }
        return value;
    }
    function investmentNegativeDay(movements) {
        let value = 0;
        const list = sorted(movements);
        for (let i = 0; i < list.length; i += 1) {
            const m = list[i];
            value = m.kind === 'valor' ? m.amountCents : value + FLOW_SIGN[m.kind] * m.amountCents;
            const endOfDay = i === list.length - 1 || list[i + 1].occurredOn !== m.occurredOn;
            if (endOfDay && value < 0)
                return m.occurredOn;
        }
        return null;
    }
    function applyInvestmentChange(movements, change) {
        if (!change)
            return [...movements];
        if (change.op === 'add')
            return [...movements, { kind: change.kind, amountCents: change.amountCents, occurredOn: change.occurredOn }];
        if (change.op === 'delete')
            return movements.filter((m) => m.id !== change.id);
        return movements.map((m) => (m.id === change.id ? { ...m, amountCents: change.amountCents, occurredOn: change.occurredOn } : m));
    }
    function investmentTotals(movements, today) {
        const live = movements.filter((m) => m.occurredOn <= today);
        const sum = (k) => live.filter((m) => m.kind === k).reduce((a, m) => a + m.amountCents, 0);
        const depositsCents = sum('aporte');
        const withdrawalsCents = sum('resgate');
        const incomeCents = sum('rendimento');
        const valueCents = investmentValueOn(live, today);
        const lastValue = live.filter((m) => m.kind === 'valor').map((m) => m.occurredOn).sort().pop() ?? null;
        return { depositsCents, withdrawalsCents, incomeCents, valueCents, gainCents: valueCents + withdrawalsCents + incomeCents - depositsCents, lastValueOn: lastValue };
    }
    function investmentGain(i) {
        return i.valueCents + i.withdrawalsCents + i.incomeCents - i.depositsCents;
    }
    function monthlyReturns(groups, today) {
        const all = groups.flat().filter((m) => m.occurredOn <= today);
        if (all.length === 0)
            return [];
        const first = all.map((m) => m.occurredOn).sort()[0];
        const valueOn = (date) => groups.reduce((acc, g) => acc + investmentValueOn(g, date), 0);
        const out = [];
        const last = (0, dates_1.monthOf)(today);
        for (let month = (0, dates_1.monthOf)(first); (0, dates_1.monthsBetween)(month, last) >= 0; month = (0, dates_1.addMonths)(month, 1)) {
            const [y, mo] = month.split('-').map(Number);
            const days = (0, dates_1.daysInMonth)(y, mo);
            const start = `${month}-01`;
            const partial = month === last;
            const end = partial ? today : `${month}-${String(days).padStart(2, '0')}`;
            const v0 = valueOn((0, dates_1.addDays)(start, -1));
            const v1 = valueOn(end);
            let flows = 0;
            let weighted = 0;
            let income = 0;
            for (const m of all) {
                if (m.occurredOn < start || m.occurredOn > end)
                    continue;
                if (m.kind === 'rendimento')
                    income += m.amountCents;
                const f = FLOW_SIGN[m.kind] * m.amountCents;
                if (f === 0)
                    continue;
                const day = Number(m.occurredOn.slice(8, 10));
                flows += f;
                weighted += ((days - day) / days) * f;
            }
            const base = v0 + weighted;
            out.push({ month, rate: base > 0 ? (v1 - v0 - flows + income) / base : null, endValueCents: v1, partial });
        }
        return out;
    }
    function chainRates(rates) {
        const valid = rates.filter((r) => r !== null && Number.isFinite(r));
        if (valid.length === 0)
            return null;
        return valid.reduce((acc, r) => acc * (1 + r), 1) - 1;
    }
    exports.BCB_SERIES = { cdi: 4391, ipca: 433 };
    function parseBcbSeries(json) {
        const out = {};
        if (!Array.isArray(json))
            return out;
        for (const row of json) {
            if (typeof row !== 'object' || row === null)
                continue;
            const r = row;
            if (typeof r.data !== 'string' || (typeof r.valor !== 'string' && typeof r.valor !== 'number'))
                continue;
            const date = (0, dates_1.parseDateBR)(r.data);
            if (!date || !date.endsWith('-01'))
                continue;
            const value = typeof r.valor === 'number' ? r.valor : Number(r.valor.replace(',', '.'));
            if (!Number.isFinite(value) || value < -10 || value > 10)
                continue;
            out[(0, dates_1.monthOf)(date)] = value;
        }
        return out;
    }
    function bcbSeriesUrl(code, from, to) {
        return `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${code}/dados?formato=json&dataInicial=${(0, dates_1.formatDateBR)(from)}&dataFinal=${(0, dates_1.formatDateBR)(to)}`;
    }
    function indexOverMonths(series, months) {
        if (months.length === 0)
            return null;
        let acc = 1;
        for (const m of months) {
            const v = series[m];
            if (v === undefined)
                return null;
            acc *= 1 + v / 100;
        }
        return acc - 1;
    }
    function exampleIndices() {
        const cdi = {};
        const ipca = {};
        for (let m = '2024-01'; (0, dates_1.monthsBetween)(m, '2027-12') >= 0; m = (0, dates_1.addMonths)(m, 1)) {
            cdi[m] = 0.9;
            ipca[m] = 0.35;
        }
        return { cdi, ipca, fetchedOn: null, example: true };
    }
    function compareLastClosedMonths(returns, indices, max = 12) {
        const closed = returns.filter((r) => !r.partial && r.rate !== null);
        if (closed.length === 0)
            return null;
        const chosen = closed.slice(-max);
        const months = chosen.map((r) => r.month);
        return {
            months,
            rate: chainRates(chosen.map((r) => r.rate)),
            cdi: indices ? indexOverMonths(indices.cdi, months) : null,
            ipca: indices ? indexOverMonths(indices.ipca, months) : null,
        };
    }
    exports.INVESTMENT_FIELD_ORDER = ['name', 'kind', 'investedText', 'currentText', 'startText'];
    function validateInvestmentDraft(draft, today, mode) {
        const T = exports.INVESTMENT_TEXT.errors;
        const errors = {};
        const name = normalizeInvestmentName(draft.name);
        if (charCount(name) < 1)
            errors.name = T.nameEmpty;
        else if (charCount(name) > exports.INVESTMENT_NAME_MAX)
            errors.name = T.nameLong;
        if (draft.kind === null || !exports.INVESTMENT_KINDS.includes(draft.kind))
            errors.kind = T.kind;
        let investedCents = 0;
        let currentCents = null;
        let startOn = today;
        if (mode === 'criar') {
            const invested = (0, money_1.parseBRL)(draft.investedText);
            if (invested === null || invested < 1 || invested > money_1.MAX_RECORD_CENTS)
                errors.investedText = draft.investedText.trim() === '' ? T.investedEmpty : T.amount;
            else
                investedCents = invested;
            if (draft.currentText.trim() !== '') {
                const current = (0, money_1.parseBRL)(draft.currentText);
                if (current === null || current < 0 || current > money_1.MAX_RECORD_CENTS)
                    errors.currentText = T.amount;
                else
                    currentCents = current;
            }
            if (draft.startText.trim() !== '') {
                const d = (0, dates_1.parseDateBR)(draft.startText);
                if (!d)
                    errors.startText = T.date;
                else if (d > today)
                    errors.startText = T.future;
                else
                    startOn = d;
            }
        }
        if (Object.keys(errors).length > 0)
            return { ok: false, errors };
        return { ok: true, input: { name, kind: draft.kind, investedCents, startOn, currentCents } };
    }
    const pctText = (fraction) => {
        const v = Math.round(fraction * 10000) / 100;
        const s = Math.abs(v).toFixed(2).replace('.', ',');
        return `${v < 0 ? '-' : v > 0 ? '+' : ''}${s}%`;
    };
    exports.INVESTMENT_TEXT = {
        tabTitle: 'Investimentos',
        tabLabel: 'Investir',
        intro: 'Acompanhe o que você já investe: registre aportes, resgates e o valor que aparece no seu extrato. A Clarevo calcula quanto rendeu.',
        totalTitle: 'Seus investimentos hoje',
        value: (c) => (0, money_1.formatBRL)(c),
        invested: (c) => `Aportado: ${(0, money_1.formatBRL)(c)}`,
        withdrawn: (c) => `Resgatado: ${(0, money_1.formatBRL)(c)}`,
        income: (c) => `Rendimentos recebidos: ${(0, money_1.formatBRL)(c)}`,
        gain: (c) => (c < 0 ? `Perda: ${(0, money_1.formatBRL)(-c)}` : `Ganho: ${(0, money_1.formatBRL)(c)}`),
        percent: pctText,
        comparison: (c) => {
            const first = c.months[0];
            const head = c.months.length === 1 ? `No mês fechado de ${(0, dates_1.formatMonthYearBR)(first)}` : `Nos ${c.months.length} meses fechados, ${(0, dates_1.formatMonthSpanBR)(first, c.months[c.months.length - 1])}`;
            return `${head}: ${c.rate === null ? 'sem taxa' : pctText(c.rate)}.`;
        },
        cdi: (v) => (v === null ? 'CDI: sem dados para todos os meses' : `CDI no mesmo período: ${pctText(v)}`),
        ipca: (v) => (v === null ? 'IPCA: sem dados para todos os meses' : `IPCA no mesmo período: ${pctText(v)}`),
        thisMonth: (rate) => (rate === null ? 'Neste mês: sem taxa ainda' : `Neste mês, até hoje: ${pctText(rate)}`),
        sinceStart: (rate, from) => (rate === null ? null : `Desde ${(0, dates_1.formatMonthYearBR)(from)}: ${pctText(rate)}`),
        noValueYet: 'Atualize o valor com o que aparece no seu extrato para ver quanto rendeu.',
        lastValue: (d) => `Valor atualizado em ${(0, dates_1.formatDateBR)(d)}`,
        indicesSource: (fetchedOn) => `Fonte do CDI e do IPCA: Banco Central do Brasil, séries ${exports.BCB_SERIES.cdi} e ${exports.BCB_SERIES.ipca}${fetchedOn ? `, consulta em ${(0, dates_1.formatDateBR)(fetchedOn)}` : ''}.`,
        indicesExample: 'Na demonstração, o CDI e o IPCA são valores de exemplo, não os índices reais.',
        indicesError: 'Não foi possível buscar o CDI e o IPCA agora. A sua rentabilidade continua aqui.',
        disclaimer: 'A rentabilidade é calculada com os valores que você registra, como estão no seu extrato. Não é recomendação de investimento, e o que rendeu no passado não garante o futuro.',
        rule: 'Aportes, resgates e rendimentos não entram em Pago nem em Recebido: o dinheiro continua seu, só mudou de lugar.',
        footer: 'A Clarevo não guarda, não movimenta nem indica investimentos. Os valores mostram só o que você registrou.',
        emptyTitle: 'Nenhum investimento ainda',
        emptyBody: 'Cadastre o que você já tem investido, com quanto aplicou e quanto vale hoje. Dá para atualizar o valor quando quiser.',
        newInvestment: 'Novo investimento',
        closedTitle: 'Encerrados',
        whoSees: 'Seus investimentos ficam só no seu Pessoal. Ninguém da Família nem a empresa que oferece o benefício vê.',
        form: {
            newTitle: 'Novo investimento',
            editTitle: 'Editar investimento',
            nameLabel: 'Nome',
            nameHint: 'Um nome curto que você reconheça, como Reserva no banco ou Ações.',
            kindLabel: 'Tipo',
            investedLabel: 'Quanto você aplicou até hoje?',
            investedHint: 'A soma do que você colocou, sem os rendimentos.',
            currentLabel: 'Quanto vale hoje? (opcional)',
            currentHint: 'O valor que aparece no extrato. Sem ele, a Clarevo usa o valor aplicado.',
            startLabel: 'Desde quando? (opcional)',
            startHint: 'A data da primeira aplicação. Sem ela, hoje.',
            create: 'Criar investimento',
            save: 'Salvar investimento',
            created: 'Investimento criado.',
            saved: 'Investimento salvo.',
        },
        detail: {
            addDeposit: 'Registrar aporte',
            addWithdrawal: 'Registrar resgate',
            addIncome: 'Registrar rendimento recebido',
            updateValue: 'Atualizar valor',
            edit: 'Editar',
            close: 'Encerrar investimento',
            reopen: 'Reabrir investimento',
            delete: 'Excluir investimento',
            deleteTitle: (name) => `Excluir ${name}?`,
            deleteBody: 'Os movimentos registrados nele também deixam de aparecer.',
            deleteConfirm: 'Excluir investimento',
            cancel: 'Cancelar',
            closed: 'Investimento encerrado.',
            reopened: 'Investimento reaberto.',
            deleted: 'Investimento excluído.',
            historyTitle: 'Histórico',
            historyEmpty: 'Nenhum movimento registrado.',
            monthsTitle: 'Valor no fim de cada mês',
        },
        movement: {
            aporte: { title: 'Registrar aporte', saved: 'Aporte registrado.', hint: 'O dinheiro que você colocou no investimento.' },
            resgate: { title: 'Registrar resgate', saved: 'Resgate registrado.', hint: 'O dinheiro que você tirou do investimento.' },
            rendimento: {
                title: 'Registrar rendimento recebido',
                saved: 'Rendimento registrado.',
                hint: 'O que o investimento pagou e caiu na sua conta, como dividendos ou juros pagos. O que fica no investimento entra ao atualizar o valor.',
            },
            valor: { title: 'Atualizar valor', saved: 'Valor atualizado.', hint: 'O valor total que aparece no extrato nesta data, já com os aportes e resgates do dia.' },
            amountLabel: 'Valor',
            valueLabel: 'Valor no extrato',
            dateLabel: 'Data',
            noteLabel: 'Observação (opcional)',
            save: 'Salvar',
            updated: 'Movimento salvo.',
            deleted: 'Movimento excluído.',
            delete: 'Excluir movimento',
        },
        movementLabel: { aporte: 'Aporte', resgate: 'Resgate', rendimento: 'Rendimento recebido', valor: 'Valor atualizado' },
        errors: {
            nameEmpty: 'Informe um nome.',
            nameLong: `Use até ${exports.INVESTMENT_NAME_MAX} caracteres.`,
            kind: 'Escolha o tipo.',
            investedEmpty: 'Informe quanto você aplicou.',
            amount: 'Informe um valor válido.',
            date: 'Informe uma data válida, como 15/03/2025.',
            future: 'A data não pode ser depois de hoje.',
            negative: (d) => `Com este movimento, o investimento ficaria com valor negativo em ${(0, dates_1.formatDateBR)(d)}. Confira o valor e a data.`,
            closed: 'O investimento está encerrado. Reabra para registrar.',
            limit: `Você chegou a ${exports.INVESTMENT_ACTIVE_MAX} investimentos ativos. Encerre um para criar outro.`,
            personalOnly: 'Investimentos ficam só no seu Pessoal.',
            save: 'Não foi possível salvar. Tente de novo.',
            notFound: 'Este investimento não existe mais.',
        },
    };
    function investmentErrorText(code, negativeDay = null) {
        const E = exports.INVESTMENT_TEXT.errors;
        switch (code) {
            case 'nome_invalido':
                return E.nameEmpty;
            case 'tipo_invalido':
                return E.kind;
            case 'valor_invalido':
                return E.amount;
            case 'data_invalida':
                return E.date;
            case 'data_futura':
                return E.future;
            case 'investimento_encerrado':
                return E.closed;
            case 'valor_insuficiente':
                return negativeDay ? E.negative(negativeDay) : E.save;
            case 'limite_de_investimentos':
                return E.limit;
            case 'contexto_invalido':
                return E.personalOnly;
            case 'nao_encontrado':
                return E.notFound;
            default:
                return E.save;
        }
    }
  },
  // packages/core/src/money.ts
  function (module, exports, __req) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.MAX_RECORD_CENTS = void 0;
    exports.formatBRL = formatBRL;
    exports.centsToInput = centsToInput;
    exports.parseBRL = parseBRL;
    exports.roundDiv = roundDiv;
    exports.ceilDiv = ceilDiv;
    exports.MAX_RECORD_CENTS = 999_999_999;
    const BRL = new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
    function formatBRL(cents) {
        return BRL.format(cents / 100).replace(/ /g, ' ');
    }
    function centsToInput(cents) {
        return formatBRL(cents).replace(/^-?R\$\s?/, '');
    }
    function parseBRL(input) {
        const raw = input.trim().replace(/^R\$\s*/i, '');
        if (raw === '')
            return null;
        let intPart;
        let decPart = '';
        const brl = /^([1-9]\d{0,2}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/.exec(raw);
        const dotDecimal = /^(\d+)\.(\d{1,2})$/.exec(raw);
        if (brl) {
            intPart = brl[1].replace(/\./g, '');
            decPart = brl[2] ?? '';
        }
        else if (dotDecimal) {
            intPart = dotDecimal[1];
            decPart = dotDecimal[2];
        }
        else {
            return null;
        }
        const intDigits = intPart.replace(/^0+(?=\d)/, '');
        if (intDigits.length > 13)
            return exports.MAX_RECORD_CENTS + 1;
        return Number(intDigits) * 100 + Number(decPart.padEnd(2, '0'));
    }
    function roundDiv(a, b) {
        return Math.floor((2 * a + b) / (2 * b));
    }
    function ceilDiv(a, b) {
        return Math.floor((a + b - 1) / b);
    }
  },
];
const __cache = [];
function __req(i) {
  if (__cache[i]) return __cache[i].exports;
  const module = { exports: {} };
  __cache[i] = module;
  __mods[i](module, module.exports, __req);
  return module.exports;
}

const indices = __req(0);
const handler = indices.createIndicesHandler({
  config: indices.indicesConfigFrom((name) => Deno.env.get(name)),
  fetch: (url, init) => fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(init.timeoutMs) }),
  today: () => indices.brazilToday(),
  log: (message) => console.error(message),
});

Deno.serve(async (req) => {
  const res = await handler({
    method: req.method,
    url: req.url,
    header: (name) => req.headers.get(name),
    body: () => req.text(),
  });
  return new Response(res.status === 204 ? null : res.body, { status: res.status, headers: res.headers });
});
