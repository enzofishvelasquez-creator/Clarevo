// @ts-nocheck
// GERADO por scripts/gerar-funcoes.js a partir de packages/core/src/precos. Não editar à mão: mude o núcleo e rode `npm run indices`.
// Clarevo · função do servidor "precos" (Edge Function do Supabase, D-099, itens 19 e 20): busca nos dados abertos o preço do dia dos
// títulos ofertados pelo Tesouro Direto (Tesouro Transparente) e a cota mais recente dos fundos pedidos (Informe Diário da CVM), e
// devolve ao app. Recebe só os CNPJs dos fundos (dado público) e não guarda nada em banco (6 horas na memória da função). Sem segredos;
// opcional CLAREVO_APP_URL. Confere a sessão da pessoa no Supabase Auth: publicar com a verificação de JWT do painel ("Verify JWT
// with legacy secret") DESLIGADA.

const __mods = [
  // packages/core/src/precos/servidor.ts
  function (module, exports, __req) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.precosConfigFrom = precosConfigFrom;
    exports.brazilToday = brazilToday;
    exports.requestedCnpjs = requestedCnpjs;
    exports.createPrecosHandler = createPrecosHandler;
    const dates_1 = __req(1);
    const investment_prices_1 = __req(2);
    const servidor_comum_1 = __req(4);
    function precosConfigFrom(env) {
        const v = (name) => (env(name) ?? '').trim();
        return {
            appUrl: (v('CLAREVO_APP_URL') || 'https://app.clarevo.app.br').replace(/\/+$/, ''),
            supabaseUrl: v('SUPABASE_URL').replace(/\/+$/, ''),
            userApiKey: v('SUPABASE_PUBLISHABLE_KEY') || v('SUPABASE_ANON_KEY') || (0, servidor_comum_1.serviceKeyFrom)(v),
        };
    }
    function brazilToday() {
        return (0, dates_1.todayIn)('America/Sao_Paulo');
    }
    const CACHE_MS = 6 * 60 * 60 * 1000;
    const FAILURE_MS = 5 * 60 * 1000;
    const EARLY_MONTH_DAYS = 10;
    const JSON_TYPE = 'application/json; charset=utf-8';
    function cors(origin, appUrl) {
        if (origin === null)
            return {};
        if (origin !== appUrl && !/^http:\/\/localhost(:\d+)?$/.test(origin))
            return {};
        return {
            'Access-Control-Allow-Origin': origin,
            'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Max-Age': '86400',
            Vary: 'Origin',
        };
    }
    function requestedCnpjs(value) {
        if (value === undefined || value === null)
            return [];
        if (!Array.isArray(value) || value.length > investment_prices_1.FUND_QUERY_MAX)
            return null;
        const out = [];
        for (const v of value) {
            if (typeof v !== 'string' || !/^[0-9A-Z]{14}$/.test(v))
                return null;
            if (!out.includes(v))
                out.push(v);
        }
        return out;
    }
    function createPrecosHandler(deps) {
        const now = deps.now ?? (() => Date.now());
        let treasury = null;
        let treasuryFailedAt = -Infinity;
        const months = new Map();
        const monthFailedAt = new Map();
        const monthLocks = new Map();
        const loadTreasury = async () => {
            if (treasury && now() - treasury.at < CACHE_MS)
                return { ok: true, value: treasury.value };
            if (now() - treasuryFailedAt < FAILURE_MS)
                return { ok: false, value: null };
            try {
                const reader = (0, investment_prices_1.treasuryReader)();
                const r = await deps.fetchLines(investment_prices_1.TREASURY_PRICES_URL, { timeoutMs: 20000 }, reader.onLine);
                const value = reader.result();
                if (!r.ok || value === null) {
                    deps.log?.(`precos: tesouro_${r.status}`);
                    treasuryFailedAt = now();
                    return { ok: false, value: null };
                }
                treasury = { at: now(), value };
                return { ok: true, value };
            }
            catch (e) {
                deps.log?.(`precos: tesouro_${e instanceof Error ? e.message : 'falha'}`);
                treasuryFailedAt = now();
                return { ok: false, value: null };
            }
        };
        const loadMonthNow = async (month, cnpjs) => {
            let entry = months.get(month);
            if (entry && now() - entry.at >= CACHE_MS) {
                months.delete(month);
                entry = undefined;
            }
            const need = cnpjs.filter((c) => !entry?.looked.has(c));
            if (entry && (need.length === 0 || entry.missingFile))
                return { ok: true, missingFile: entry.missingFile, quotes: entry.quotes };
            if (now() - (monthFailedAt.get(month) ?? -Infinity) < FAILURE_MS)
                return { ok: false, missingFile: false, quotes: entry?.quotes ?? new Map() };
            const keep = entry ?? { at: now(), missingFile: false, quotes: new Map(), looked: new Set() };
            const fail = (why) => {
                deps.log?.(`precos: cvm_${month}_${why}`);
                monthFailedAt.set(month, now());
                return { ok: false, missingFile: false, quotes: keep.quotes };
            };
            try {
                const r = await deps.fetchBytes((0, investment_prices_1.cvmDailyUrl)(month), { timeoutMs: 25000 });
                if (r.status === 404) {
                    const empty = { at: now(), missingFile: true, quotes: new Map(), looked: new Set() };
                    months.set(month, empty);
                    return { ok: true, missingFile: true, quotes: empty.quotes };
                }
                if (!r.ok)
                    return fail(String(r.status));
                const zipEntry = (0, investment_prices_1.zipFirstEntry)(await r.bytes());
                if (!zipEntry || zipEntry.method !== 8)
                    return fail('zip');
                const reader = (0, investment_prices_1.cvmReader)(new Set(need));
                let rest = '';
                for await (const chunk of deps.inflateRaw(zipEntry.data)) {
                    const lines = (rest + chunk).split('\n');
                    rest = lines.pop() ?? '';
                    for (const line of lines)
                        reader.onLine(line);
                }
                if (rest !== '')
                    reader.onLine(rest);
                for (const [c, q] of reader.result())
                    keep.quotes.set(c, q);
                for (const c of need)
                    keep.looked.add(c);
                for (const k of [...months.keys()])
                    if (k !== month && months.size >= 2)
                        months.delete(k);
                months.set(month, keep);
                return { ok: true, missingFile: false, quotes: keep.quotes };
            }
            catch (e) {
                return fail(e instanceof Error ? e.message : 'falha');
            }
        };
        const loadMonth = (month, cnpjs) => {
            const before = monthLocks.get(month) ?? Promise.resolve();
            const run = before.then(() => loadMonthNow(month, cnpjs));
            monthLocks.set(month, run.catch(() => undefined));
            return run;
        };
        return async (req) => {
            const headers = cors(req.header('origin'), deps.config.appUrl);
            if (req.method === 'OPTIONS')
                return { status: 204, body: '', headers };
            const reply = (status, erro) => ({ status, body: JSON.stringify({ erro }), headers: { ...headers, 'Content-Type': JSON_TYPE } });
            if (req.method !== 'POST')
                return reply(405, 'metodo');
            const auth = /^Bearer\s+(\S+)$/i.exec(req.header('authorization') ?? '');
            if (!auth)
                return reply(401, 'nao_autenticado');
            if (deps.config.supabaseUrl === '' || deps.config.userApiKey === '') {
                deps.log?.('precos: configuracao');
                return reply(503, 'indisponivel');
            }
            try {
                const r = await deps.fetchJson(`${deps.config.supabaseUrl}/auth/v1/user`, { timeoutMs: 8000, headers: { apikey: deps.config.userApiKey, Authorization: `Bearer ${auth[1]}` } });
                if (r.status === 401 || r.status === 403)
                    return reply(401, 'nao_autenticado');
                const id = r.ok ? (await r.json())?.id : null;
                if (typeof id !== 'string' || id === '') {
                    deps.log?.(`precos: auth_${r.status}`);
                    return r.ok ? reply(401, 'nao_autenticado') : reply(502, 'sessao_indisponivel');
                }
            }
            catch (e) {
                deps.log?.(`precos: auth_${e instanceof Error ? e.message : 'falha'}`);
                return reply(502, 'sessao_indisponivel');
            }
            let parsed;
            try {
                parsed = JSON.parse((await req.body()) || '{}');
            }
            catch {
                return reply(400, 'pedido_invalido');
            }
            const cnpjs = requestedCnpjs(parsed?.fundos);
            if (cnpjs === null)
                return reply(400, 'pedido_invalido');
            const wantTreasury = parsed?.treasury === true;
            if (!wantTreasury && cnpjs.length === 0)
                return reply(400, 'pedido_invalido');
            const today = deps.today();
            let anyOk = false;
            let treasury = null;
            if (wantTreasury) {
                const t = await loadTreasury();
                treasury = t.value;
                if (t.ok)
                    anyOk = true;
            }
            const fundos = {};
            if (cnpjs.length > 0) {
                const current = (0, dates_1.monthOf)(today);
                const cur = await loadMonth(current, cnpjs);
                if (cur.ok) {
                    anyOk = true;
                    const missing = cnpjs.filter((c) => !cur.quotes.has(c));
                    const early = Number(today.slice(8, 10)) <= EARLY_MONTH_DAYS;
                    const prev = missing.length > 0 && (cur.missingFile || early) ? await loadMonth((0, dates_1.addMonths)(current, -1), missing) : null;
                    for (const c of cnpjs) {
                        const q = cur.quotes.get(c) ?? prev?.quotes.get(c);
                        if (q)
                            fundos[c] = q;
                        else if (!prev || prev.ok)
                            fundos[c] = null;
                    }
                }
            }
            if (!anyOk)
                return reply(502, 'precos_indisponiveis');
            return { status: 200, body: JSON.stringify({ treasury, fundos, fetchedOn: today }), headers: { ...headers, 'Content-Type': JSON_TYPE } };
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
        try {
            const parts = new Intl.DateTimeFormat('en-CA', {
                timeZone,
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                calendar: 'gregory',
                numberingSystem: 'latn',
            }).formatToParts(now);
            const get = (type) => parts.find((p) => p.type === type)?.value ?? '';
            const iso = `${get('year')}-${get('month').padStart(2, '0')}-${get('day').padStart(2, '0')}`;
            if (/^\d{4}-\d{2}-\d{2}$/.test(iso) && isValidIsoDate(iso))
                return iso;
        }
        catch {
        }
        return localIsoDate(now);
    }
    function localIsoDate(now) {
        return `${String(now.getFullYear()).padStart(4, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
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
  // packages/core/src/investment-prices.ts
  function (module, exports, __req) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.PUBLIC_PRICE_TEXT = exports.centsToPrice = exports.TREASURY_TITLE_BY_SUBKIND = exports.FUND_QUERY_MAX = exports.cvmDailyUrl = exports.TREASURY_PRICES_URL = void 0;
    exports.parseTreasuryLine = parseTreasuryLine;
    exports.treasuryReader = treasuryReader;
    exports.cvmReader = cvmReader;
    exports.zipFirstEntry = zipFirstEntry;
    exports.examplePublicPrices = examplePublicPrices;
    exports.valueFromQuantity = valueFromQuantity;
    exports.formatQuota = formatQuota;
    exports.treasuryValue = treasuryValue;
    exports.fundValue = fundValue;
    const dates_1 = __req(1);
    const money_1 = __req(3);
    exports.TREASURY_PRICES_URL = 'https://www.tesourotransparente.gov.br/ckan/dataset/df56aa42-484a-4a59-8184-7676580c81e3/resource/796d2059-14e9-44e3-80c9-2d9e30b405c1/download/precotaxatesourodireto.csv';
    const cvmDailyUrl = (month) => `https://dados.cvm.gov.br/dados/FI/DOC/INF_DIARIO/DADOS/inf_diario_fi_${month.replace('-', '')}.zip`;
    exports.cvmDailyUrl = cvmDailyUrl;
    exports.FUND_QUERY_MAX = 20;
    exports.TREASURY_TITLE_BY_SUBKIND = {
        tesouro_selic: 'Tesouro Selic',
        tesouro_prefixado: 'Tesouro Prefixado',
        tesouro_prefixado_juros: 'Tesouro Prefixado com Juros Semestrais',
        tesouro_ipca: 'Tesouro IPCA+',
        tesouro_ipca_juros: 'Tesouro IPCA+ com Juros Semestrais',
        tesouro_renda: 'Tesouro Renda+ Aposentadoria Extra',
        tesouro_educa: 'Tesouro Educa+',
    };
    function brDate(text) {
        const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text.trim());
        if (!m)
            return null;
        const iso = `${m[3]}-${m[2]}-${m[1]}`;
        return (0, dates_1.isValidIsoDate)(iso) ? iso : null;
    }
    function brNumber(text, scale) {
        const t = text.trim();
        if (!/^-?\d+(,\d+)?$/.test(t))
            return null;
        const n = Math.round(Number(t.replace(',', '.')) * scale);
        return Number.isSafeInteger(n) ? n : null;
    }
    function parseTreasuryLine(line) {
        const p = line.replace(/\r$/, '').split(';');
        if (p.length < 7)
            return null;
        const maturityOn = brDate(p[1]);
        const on = brDate(p[2]);
        const puSellCents = brNumber(p[6], 100);
        if (!maturityOn || !on || puSellCents === null || puSellCents <= 0)
            return null;
        return {
            title: p[0].trim(),
            maturityOn,
            on,
            rateBuyBp: brNumber(p[3], 100),
            rateSellBp: brNumber(p[4], 100),
            puBuyCents: brNumber(p[5], 100),
            puSellCents,
        };
    }
    function treasuryReader() {
        let header = true;
        let on = null;
        const titles = [];
        return {
            onLine: (line) => {
                if (header) {
                    header = false;
                    if (/^Tipo Titulo/i.test(line))
                        return true;
                }
                const row = parseTreasuryLine(line);
                if (!row)
                    return true;
                if (on === null)
                    on = row.on;
                if (row.on !== on)
                    return false;
                const { on: _, ...price } = row;
                titles.push(price);
                return true;
            },
            result: () => (on === null || titles.length === 0 ? null : { on, titles }),
        };
    }
    const cnpjDigits = (text) => text.toUpperCase().replace(/[.\/\s-]/g, '');
    function cvmReader(wanted) {
        const plain = new Map();
        const subs = new Set();
        const accept = wanted ? new Set([...wanted].flatMap((c) => [c, formatCnpjDots(c)])) : null;
        return {
            onLine: (line) => {
                const a = line.indexOf(';');
                const b = a < 0 ? -1 : line.indexOf(';', a + 1);
                if (b < 0)
                    return;
                const rawCnpj = line.slice(a + 1, b);
                if (accept && !accept.has(rawCnpj))
                    return;
                const p = line.replace(/\r$/, '').split(';');
                if (p.length < 6)
                    return;
                const cnpj = cnpjDigits(rawCnpj);
                const on = p[3].trim();
                const quota = p[5].trim();
                if (!/^[0-9A-Z]{14}$/.test(cnpj) || !(0, dates_1.isValidIsoDate)(on) || !/^\d+(\.\d+)?$/.test(quota) || Number(quota) <= 0)
                    return;
                if (p[2].trim() !== '') {
                    subs.add(cnpj);
                    return;
                }
                const before = plain.get(cnpj);
                if (!before || on >= before.on)
                    plain.set(cnpj, { on, quota });
            },
            result: () => {
                const out = new Map(plain);
                for (const c of subs)
                    if (!plain.has(c))
                        out.set(c, { subclasses: true });
                return out;
            },
        };
    }
    const formatCnpjDots = (c) => `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`;
    function zipFirstEntry(bytes) {
        if (bytes.length < 30)
            return null;
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        if (view.getUint32(0, true) !== 0x04034b50)
            return null;
        const flags = view.getUint16(6, true);
        const method = view.getUint16(8, true);
        let size = view.getUint32(18, true);
        const nameLen = view.getUint16(26, true);
        const extraLen = view.getUint16(28, true);
        const start = 30 + nameLen + extraLen;
        if (flags & 0x08 || size === 0)
            size = bytes.length - start;
        if (start + size > bytes.length)
            return null;
        return { method, data: bytes.subarray(start, start + size) };
    }
    function previousWeekday(day) {
        let d = (0, dates_1.addDays)(day, -1);
        for (let i = 0; i < 3; i++) {
            const w = new Date(`${d}T12:00:00Z`).getUTCDay();
            if (w !== 0 && w !== 6)
                break;
            d = (0, dates_1.addDays)(d, -1);
        }
        return d;
    }
    const EXAMPLE_TITLES = [
        { title: 'Tesouro Selic', maturityOn: '2027-03-01', puSellCents: 2_029_156, puBuyCents: 2_030_253, rateSellBp: 4, rateBuyBp: 3 },
        { title: 'Tesouro Selic', maturityOn: '2029-03-01', puSellCents: 2_026_435, puBuyCents: 2_027_934, rateSellBp: 6, rateBuyBp: 5 },
        { title: 'Tesouro Selic', maturityOn: '2031-03-01', puSellCents: 2_019_226, puBuyCents: 2_021_126, rateSellBp: 12, rateBuyBp: 11 },
        { title: 'Tesouro Prefixado', maturityOn: '2028-01-01', puSellCents: 85_940, puBuyCents: 86_087, rateSellBp: 1_439, rateBuyBp: 1_427 },
        { title: 'Tesouro Prefixado', maturityOn: '2032-01-01', puSellCents: 48_087, puBuyCents: 48_370, rateSellBp: 1_544, rateBuyBp: 1_532 },
        { title: 'Tesouro IPCA+', maturityOn: '2029-05-15', puSellCents: 398_295, puBuyCents: 399_596, rateSellBp: 759, rateBuyBp: 747 },
        { title: 'Tesouro IPCA+', maturityOn: '2035-05-15', puSellCents: 251_406, puBuyCents: 253_908, rateSellBp: 789, rateBuyBp: 777 },
        { title: 'Tesouro IPCA+ com Juros Semestrais', maturityOn: '2035-05-15', puSellCents: 440_310, puBuyCents: 429_588, rateSellBp: 785, rateBuyBp: 773 },
        { title: 'Tesouro Prefixado com Juros Semestrais', maturityOn: '2035-01-01', puSellCents: 80_013, puBuyCents: 80_488, rateSellBp: 1_551, rateBuyBp: 1_539 },
        { title: 'Tesouro Renda+ Aposentadoria Extra', maturityOn: '2049-12-15', puSellCents: 198_233, puBuyCents: 200_714, rateSellBp: 770, rateBuyBp: 758 },
    ];
    function examplePublicPrices(request, today) {
        const on = previousWeekday(today);
        const fundos = {};
        for (const c of request.fundos) {
            const sum = [...c].reduce((s, ch) => s + (ch.charCodeAt(0) - 48), 0);
            fundos[c] = { on: previousWeekday(on), quota: `${10 + (sum % 90)}.${String((sum * 7919) % 1_000_000).padStart(6, '0')}` };
        }
        return { treasury: request.treasury ? { on, titles: EXAMPLE_TITLES.map((x) => ({ ...x })) } : null, fundos, fetchedOn: today, example: true };
    }
    function valueFromQuantity(quantityMicro, price) {
        const m = /^(\d+)(?:\.(\d{1,12}))?$/.exec(price);
        if (!m || !Number.isSafeInteger(quantityMicro) || quantityMicro <= 0)
            return null;
        const priceScaled = BigInt(m[1] + (m[2] ?? '').padEnd(12, '0'));
        const product = BigInt(quantityMicro) * priceScaled;
        const divisor = 10n ** 16n;
        const cents = (product + divisor / 2n) / divisor;
        return cents <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(cents) : null;
    }
    const centsToPrice = (cents) => `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
    exports.centsToPrice = centsToPrice;
    function formatQuota(quota) {
        const [int, frac = ''] = quota.split('.');
        const f = frac.replace(/0+$/, '').padEnd(2, '0');
        return `R$ ${Number(int).toLocaleString('pt-BR')},${f}`;
    }
    function treasuryValue(inv, prices) {
        if (inv.subkind === 'tesouro_reserva')
            return { kind: 'reserva' };
        const title = inv.subkind ? exports.TREASURY_TITLE_BY_SUBKIND[inv.subkind] : undefined;
        if (!title)
            return { kind: 'sem_tipo' };
        if (!inv.maturityOn)
            return { kind: 'sem_vencimento' };
        if (inv.quantityMicro === null)
            return { kind: 'sem_quantidade' };
        const found = prices.titles.find((t) => t.title === title && t.maturityOn === inv.maturityOn);
        if (!found)
            return { kind: 'fora_da_oferta' };
        const valueCents = valueFromQuantity(inv.quantityMicro, (0, exports.centsToPrice)(found.puSellCents));
        if (valueCents === null)
            return { kind: 'fora_da_oferta' };
        return { kind: 'ok', valueCents, puSellCents: found.puSellCents, on: prices.on, title };
    }
    function fundValue(inv, quotes) {
        if (!inv.fundCnpj)
            return { kind: 'sem_cnpj' };
        if (inv.quantityMicro === null)
            return { kind: 'sem_quantidade' };
        const q = quotes[inv.fundCnpj];
        if (!q)
            return { kind: 'nao_encontrado' };
        if ('subclasses' in q)
            return { kind: 'subclasses' };
        const valueCents = valueFromQuantity(inv.quantityMicro, q.quota);
        if (valueCents === null)
            return { kind: 'nao_encontrado' };
        return { kind: 'ok', valueCents, quota: q.quota, on: q.on };
    }
    exports.PUBLIC_PRICE_TEXT = {
        treasuryTitle: 'Valor pelo preço publicado',
        fundTitle: 'Valor pela cota do fundo',
        value: (cents) => `Valor estimado: ${(0, money_1.formatBRL)(cents)}`,
        treasuryLine: (quantity, puSellCents, on) => `${quantity} ${quantity === '1' ? 'título' : 'títulos'} × ${(0, money_1.formatBRL)(puSellCents)} (preço de resgate de ${(0, dates_1.formatDateBR)(on)}).`,
        fundLine: (quantity, quota, on) => `${quantity} ${quantity === '1' ? 'cota' : 'cotas'} × ${formatQuota(quota)} (cota de ${(0, dates_1.formatDateBR)(on)}).`,
        treasurySource: 'Fonte: Tesouro Nacional, dados abertos do Tesouro Transparente (licença ODbL). O preço publicado é o do dia e pode ser revisto.',
        fundSource: 'Fonte: CVM, dados abertos do Informe Diário dos fundos (licença ODbL). A cota sai com alguns dias de atraso.',
        statementNote: 'O valor do seu extrato é o que vale.',
        use: 'Usar este valor',
        used: 'Valor atualizado pelo preço público.',
        demo: 'Na demonstração, o preço e a cota são valores de exemplo, não os publicados.',
        loading: 'Buscando o preço publicado…',
        unavailable: 'Não foi possível buscar o preço publicado agora. Tente mais tarde ou atualize pelo extrato.',
        reason: {
            sem_quantidade: (fund) => `Informe a quantidade de ${fund ? 'cotas' : 'títulos'} em Editar para ver o valor pelo ${fund ? 'preço da cota' : 'preço publicado'}.`,
            sem_vencimento: 'Informe o vencimento do título em Editar para achar o preço publicado.',
            sem_tipo: 'Escolha qual é o título em Editar para achar o preço publicado.',
            reserva: 'O Tesouro Reserva não tem preço no arquivo de títulos ofertados pelo Tesouro Nacional. Atualize pelo extrato.',
            fora_da_oferta: (on) => `Este título, com este vencimento, não está entre os ofertados pelo Tesouro Nacional em ${(0, dates_1.formatDateBR)(on)}. Confira o vencimento em Editar ou atualize pelo extrato.`,
            sem_cnpj: 'Informe o CNPJ do fundo em Editar para buscar a cota publicada pela CVM.',
            subclasses: 'Este CNPJ tem mais de uma subclasse, cada uma com a sua cota. Atualize pelo extrato.',
            nao_encontrado: 'A Clarevo não achou a cota deste CNPJ no Informe Diário da CVM dos dois últimos meses. Confira o CNPJ em Editar ou atualize pelo extrato.',
        },
    };
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
  // packages/core/src/servidor-comum.ts
  function (module, exports, __req) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.sameText = sameText;
    exports.obj = obj;
    exports.serviceKeyFrom = serviceKeyFrom;
    exports.serviceHeaders = serviceHeaders;
    function sameText(a, b) {
        if (a.length !== b.length)
            return false;
        let diff = 0;
        for (let i = 0; i < a.length; i++)
            diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
        return diff === 0;
    }
    function obj(v) {
        return typeof v === 'object' && v !== null && !Array.isArray(v) ? v : null;
    }
    function serviceKeyFrom(v) {
        const keys = v('SUPABASE_SECRET_KEYS');
        if (keys !== '') {
            try {
                const parsed = JSON.parse(keys);
                if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
                    const values = parsed;
                    const chosen = typeof values.default === 'string' ? values.default : Object.values(values).find((x) => typeof x === 'string');
                    if (typeof chosen === 'string' && chosen.trim() !== '')
                        return chosen.trim();
                }
            }
            catch {
            }
        }
        return v('SUPABASE_SERVICE_ROLE_KEY');
    }
    function serviceHeaders(serviceKey) {
        const headers = { apikey: serviceKey, 'Content-Type': 'application/json' };
        if (serviceKey.startsWith('eyJ'))
            headers.Authorization = `Bearer ${serviceKey}`;
        return headers;
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

const precos = __req(0);
const handler = precos.createPrecosHandler({
  config: precos.precosConfigFrom((name) => Deno.env.get(name)),
  fetchJson: (url, init) => fetch(url, { headers: { Accept: "application/json", ...init.headers }, signal: AbortSignal.timeout(init.timeoutMs) }),
  fetchLines: async (url, init, onLine) => {
    const res = await fetch(url, { signal: AbortSignal.timeout(init.timeoutMs) });
    if (!res.ok || !res.body) {
      await res.body?.cancel();
      return { ok: false, status: res.status };
    }
    const reader = res.body.pipeThrough(new TextDecoderStream("windows-1252")).getReader();
    let rest = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      const lines = (rest + value).split("\n");
      rest = lines.pop() ?? "";
      for (const line of lines) {
        if (!onLine(line)) {
          await reader.cancel();
          return { ok: true, status: res.status };
        }
      }
    }
    if (rest !== "") onLine(rest);
    return { ok: true, status: res.status };
  },
  fetchBytes: async (url, init) => {
    const res = await fetch(url, { signal: AbortSignal.timeout(init.timeoutMs) });
    if (!res.ok) await res.body?.cancel();
    return { ok: res.ok, status: res.status, bytes: async () => new Uint8Array(await res.arrayBuffer()) };
  },
  inflateRaw: (data) => new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw")).pipeThrough(new TextDecoderStream("windows-1252")),
  today: () => precos.brazilToday(),
  log: (message) => console.error(message),
});

Deno.serve(async (req) => {
  const res = await handler({
    method: req.method,
    header: (name) => req.headers.get(name),
    body: () => req.text(),
  });
  return new Response(res.status === 204 ? null : res.body, { status: res.status, headers: res.headers });
});
