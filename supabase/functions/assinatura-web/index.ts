// @ts-nocheck
// GERADO por scripts/gerar-funcoes.js a partir de packages/core/src/assinatura-web. Não editar à mão: mude o núcleo e rode `npm run assinatura-web`.
// Clarevo · função do servidor "assinatura-web" (Edge Function do Supabase, D-084): para o app na web, com a sessão da pessoa, cria o
// Checkout recorrente do Asaas (cartão, mensal) e cancela a assinatura; para o Asaas, recebe os avisos (webhooks) com o token no
// cabeçalho asaas-access-token, consulta o estado atual da assinatura e das cobranças e chama billing_apply no banco com a chave de
// serviço. Segredos no painel do Supabase (Edge Functions, Secrets): ASAAS_API_KEY ($aact_prod_ ou $aact_hmlg_, que define o
// ambiente) e ASAAS_WEBHOOK_TOKEN; opcional CLAREVO_APP_URL. SUPABASE_URL e a chave de serviço o próprio Supabase fornece.
// Desistência em 7 dias (D-131, item F, "desistencia" e "desistir"): desligada por WITHDRAWAL_OPEN até o texto do advogado; só o
// sandbox atende antes disso. Precisa da migração 0050 (docs/39, seção 9).
// Publicar com "Verify JWT" desligado (o Asaas não manda login; a função confere o token da sessão do app ela mesma).

const __mods = [
  // packages/core/src/assinatura-web/servidor.ts
  function (module, exports, __req) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.WITHDRAWAL_REFUND_EVENTS = exports.WITHDRAWAL_PIX_PAGES = exports.RefundUnclearError = exports.AsaasCallError = exports.TransientError = exports.REFUSED_EVENTS = exports.SCHEDULED_FIRST_CHARGE_MAX_DAYS = exports.PLANS = exports.PAID_STATUSES = exports.ASAAS_TIME_ZONE = exports.ASAAS_CYCLE = exports.PAYMENTS_LOOKBACK_MONTHS_YEARLY = exports.PAYMENTS_LOOKBACK_MONTHS = exports.CALL_TIMEOUT_MS = exports.REQUEST_BUDGET_MS = exports.APP_MAX_BODY_BYTES = exports.ASAAS_MAX_BODY_BYTES = exports.CHECKOUT_MINUTES = exports.WEB_GRACE_DAYS = exports.APP_URL_DEFAULT = exports.ASAAS_WEBHOOK_TOKEN_PATTERN = exports.ASAAS_KEY_SANDBOX = exports.ASAAS_KEY_PRODUCTION = exports.ASAAS_SANDBOX_URL = exports.ASAAS_PRODUCTION_URL = void 0;
    exports.paymentsLookbackMonths = paymentsLookbackMonths;
    exports.periodOfCycle = periodOfCycle;
    exports.assinaturaWebConfigFrom = assinaturaWebConfigFrom;
    exports.webReference = webReference;
    exports.parseWebReference = parseWebReference;
    exports.asaasSubscriptionFrom = asaasSubscriptionFrom;
    exports.goneSubscription = goneSubscription;
    exports.asaasPaymentFrom = asaasPaymentFrom;
    exports.pixPaidOn = pixPaidOn;
    exports.periodEnd = periodEnd;
    exports.endOfDayBrasilia = endOfDayBrasilia;
    exports.startOfDayBrasilia = startOfDayBrasilia;
    exports.scheduledFirstCharge = scheduledFirstCharge;
    exports.webValidity = webValidity;
    exports.parseAsaasDate = parseAsaasDate;
    exports.asaasEventFrom = asaasEventFrom;
    exports.budget = budget;
    exports.checkoutRequest = checkoutRequest;
    exports.checkoutPixRequest = checkoutPixRequest;
    exports.checkoutLink = checkoutLink;
    exports.corsHeaders = corsHeaders;
    exports.parseWithdrawalAfter = parseWithdrawalAfter;
    exports.parseWithdrawalOptions = parseWithdrawalOptions;
    exports.createAssinaturaWebHandler = createAssinaturaWebHandler;
    const dates_1 = __req(1);
    const plano_precos_1 = __req(2);
    const servidor_comum_1 = __req(3);
    const sha256_1 = __req(4);
    const desistencia_1 = __req(5);
    const pix_1 = __req(6);
    const primeira_cobranca_1 = __req(7);
    exports.ASAAS_PRODUCTION_URL = 'https://api.asaas.com/v3';
    exports.ASAAS_SANDBOX_URL = 'https://api-sandbox.asaas.com/v3';
    exports.ASAAS_KEY_PRODUCTION = '$aact_prod_';
    exports.ASAAS_KEY_SANDBOX = '$aact_hmlg_';
    exports.ASAAS_WEBHOOK_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,255}$/;
    exports.APP_URL_DEFAULT = 'https://app.clarevo.app.br';
    exports.WEB_GRACE_DAYS = 3;
    exports.CHECKOUT_MINUTES = 60;
    exports.ASAAS_MAX_BODY_BYTES = 256 * 1024;
    exports.APP_MAX_BODY_BYTES = 4 * 1024;
    exports.REQUEST_BUDGET_MS = 8500;
    exports.CALL_TIMEOUT_MS = 3000;
    exports.PAYMENTS_LOOKBACK_MONTHS = 4;
    exports.PAYMENTS_LOOKBACK_MONTHS_YEARLY = 14;
    function paymentsLookbackMonths(cycle) {
        return cycle === 'YEARLY' ? exports.PAYMENTS_LOOKBACK_MONTHS_YEARLY : exports.PAYMENTS_LOOKBACK_MONTHS;
    }
    function periodOfCycle(cycle) {
        return cycle === 'YEARLY' ? 'anual' : 'mensal';
    }
    exports.ASAAS_CYCLE = { mensal: 'MONTHLY', anual: 'YEARLY' };
    exports.ASAAS_TIME_ZONE = 'America/Sao_Paulo';
    const ASAAS_OFFSET = '-03:00';
    exports.PAID_STATUSES = new Set(['CONFIRMED', 'RECEIVED', 'RECEIVED_IN_CASH', 'DUNNING_RECEIVED', 'AWAITING_CHARGEBACK_REVERSAL']);
    exports.PLANS = ['individual', 'familiar'];
    function assinaturaWebConfigFrom(env) {
        const v = (name) => (env(name) ?? '').trim();
        const apiKey = v('ASAAS_API_KEY');
        const sandbox = apiKey.startsWith(exports.ASAAS_KEY_SANDBOX);
        if (!sandbox && !apiKey.startsWith(exports.ASAAS_KEY_PRODUCTION))
            return null;
        const webhookToken = v('ASAAS_WEBHOOK_TOKEN');
        if (!exports.ASAAS_WEBHOOK_TOKEN_PATTERN.test(webhookToken) || webhookToken === apiKey)
            return null;
        const supabaseUrl = v('SUPABASE_URL').replace(/\/+$/, '');
        const serviceKey = (0, servidor_comum_1.serviceKeyFrom)(v);
        if (supabaseUrl === '' || serviceKey === '')
            return null;
        const userApiKey = v('SUPABASE_PUBLISHABLE_KEY') || v('SUPABASE_ANON_KEY') || serviceKey;
        const appUrl = (v('CLAREVO_APP_URL') || exports.APP_URL_DEFAULT).replace(/\/+$/, '');
        if (!/^https:\/\/[a-z0-9.-]+$/.test(appUrl) && !/^http:\/\/localhost(:\d+)?$/.test(appUrl))
            return null;
        return { apiKey, apiBase: sandbox ? exports.ASAAS_SANDBOX_URL : exports.ASAAS_PRODUCTION_URL, sandbox, webhookToken, supabaseUrl, serviceKey, userApiKey, appUrl };
    }
    const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    function webReference(personId, plan) {
        return `clarevo:${personId.toLowerCase()}:${plan}`;
    }
    function parseWebReference(ref) {
        if (typeof ref !== 'string')
            return null;
        const m = /^clarevo:([0-9a-f-]{36}):(individual|familiar)$/i.exec(ref.trim());
        if (!m || !UUID.test(m[1] ?? ''))
            return null;
        return { personId: (m[1] ?? '').toLowerCase(), plan: m[2] };
    }
    const isoDate = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);
    const text = (v) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);
    function asaasSubscriptionFrom(raw) {
        const s = (0, servidor_comum_1.obj)(raw);
        const id = text(s?.id);
        if (!s || !id)
            return null;
        return {
            id,
            status: text(s.status) ?? 'ACTIVE',
            deleted: s.deleted === true,
            cycle: text(s.cycle) ?? 'MONTHLY',
            value: typeof s.value === 'number' && Number.isFinite(s.value) ? s.value : null,
            nextDueDate: isoDate(s.nextDueDate),
            dateCreated: isoDate(s.dateCreated),
            externalReference: text(s.externalReference),
            checkoutSession: text(s.checkoutSession),
        };
    }
    function goneSubscription(id) {
        return { id, status: 'INACTIVE', deleted: true, cycle: 'MONTHLY', value: null, nextDueDate: null, dateCreated: null, externalReference: null, checkoutSession: null };
    }
    function asaasPaymentFrom(raw) {
        const p = (0, servidor_comum_1.obj)(raw);
        const id = text(p?.id);
        if (!p || !id)
            return null;
        return {
            id,
            status: text(p.status) ?? 'PENDING',
            deleted: p.deleted === true,
            dueDate: isoDate(p.dueDate),
            subscription: text(p.subscription),
            externalReference: text(p.externalReference),
            checkoutSession: text(p.checkoutSession),
            paidOn: isoDate(p.paymentDate) ?? isoDate(p.clientPaymentDate) ?? isoDate(p.confirmedDate),
            billingType: text(p.billingType),
            confirmedOn: isoDate(p.confirmedDate) ?? isoDate(p.clientPaymentDate),
            valueCents: typeof p.value === 'number' && Number.isFinite(p.value) && p.value > 0 ? Math.round(p.value * 100) : null,
        };
    }
    function pixPaidOn(p, today) {
        if (p.deleted || !exports.PAID_STATUSES.has(p.status))
            return null;
        return p.paidOn && p.paidOn <= today ? p.paidOn : today;
    }
    function periodEnd(dueDate, cycle) {
        switch (cycle) {
            case 'WEEKLY':
                return (0, dates_1.addDays)(dueDate, 7);
            case 'BIWEEKLY':
                return (0, dates_1.addDays)(dueDate, 14);
            case 'BIMONTHLY':
                return (0, dates_1.addMonthsToDate)(dueDate, 2);
            case 'QUARTERLY':
                return (0, dates_1.addMonthsToDate)(dueDate, 3);
            case 'SEMIANNUALLY':
                return (0, dates_1.addMonthsToDate)(dueDate, 6);
            case 'YEARLY':
                return (0, dates_1.addMonthsToDate)(dueDate, 12);
            default:
                return (0, dates_1.addMonthsToDate)(dueDate, 1);
        }
    }
    function endOfDayBrasilia(day) {
        return new Date(`${day}T23:59:59.999${ASAAS_OFFSET}`);
    }
    function startOfDayBrasilia(day) {
        return new Date(`${day}T00:00:00.000${ASAAS_OFFSET}`);
    }
    exports.SCHEDULED_FIRST_CHARGE_MAX_DAYS = 31;
    const FIRST_CHARGE_PENDING = new Set(['PENDING', 'AWAITING_RISK_ANALYSIS']);
    exports.REFUSED_EVENTS = new Set(['PAYMENT_CREDIT_CARD_CAPTURE_REFUSED', 'PAYMENT_REPROVED_BY_RISK_ANALYSIS']);
    function scheduledFirstCharge(sub, payments, now, refused = false) {
        if (refused || sub.status !== 'ACTIVE' || sub.deleted)
            return null;
        const live = payments.filter((p) => !p.deleted);
        if (live.length === 0 || live.some((p) => !FIRST_CHARGE_PENDING.has(p.status)))
            return null;
        const due = live.map((p) => p.dueDate).filter((d) => d !== null).sort()[0];
        if (!due)
            return null;
        const today = (0, dates_1.todayIn)(exports.ASAAS_TIME_ZONE, now);
        if (due > (0, dates_1.addDays)(today, exports.SCHEDULED_FIRST_CHARGE_MAX_DAYS))
            return null;
        if (due > today)
            return due;
        return due === today && sub.dateCreated !== null && sub.dateCreated < due ? due : null;
    }
    function webValidity(sub, payments, now, refused = false) {
        let paidThrough = null;
        for (const p of payments) {
            if (p.deleted || !p.dueDate || !exports.PAID_STATUSES.has(p.status))
                continue;
            const end = periodEnd(p.dueDate, sub.cycle);
            if (!paidThrough || end > paidThrough)
                paidThrough = end;
        }
        if (!paidThrough) {
            const first = scheduledFirstCharge(sub, payments, now, refused);
            if (first)
                return { paidThrough: null, validFrom: startOfDayBrasilia(first), validUntil: endOfDayBrasilia((0, dates_1.addDays)(first, exports.WEB_GRACE_DAYS)) };
            return { paidThrough: null, validFrom: null, validUntil: now };
        }
        const grace = sub.status === 'ACTIVE' && !sub.deleted ? exports.WEB_GRACE_DAYS : 0;
        return { paidThrough, validFrom: null, validUntil: endOfDayBrasilia((0, dates_1.addDays)(paidThrough, grace)) };
    }
    function parseAsaasDate(v) {
        if (typeof v !== 'string')
            return null;
        const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/.exec(v.trim());
        if (!m)
            return null;
        const zone = m[3] ? m[3].replace(/^([+-]\d{2})(\d{2})$/, '$1:$2') : ASAAS_OFFSET;
        const d = new Date(`${m[1]}T${m[2]}${zone}`);
        return Number.isNaN(d.getTime()) ? null : d;
    }
    function asaasEventFrom(payload, now) {
        const e = (0, servidor_comum_1.obj)(payload);
        const id = text(e?.id);
        const event = text(e?.event);
        if (!e || !id || id.length > 200 || !event)
            return null;
        const subscription = asaasSubscriptionFrom(e.subscription);
        const payment = asaasPaymentFrom(e.payment);
        const checkoutId = event.startsWith('CHECKOUT_') ? text((0, servidor_comum_1.obj)(e.checkout)?.id) : null;
        return { id, event, at: parseAsaasDate(e.dateCreated) ?? now, subscriptionId: subscription?.id ?? payment?.subscription ?? null, subscription, payment, checkoutId };
    }
    class TransientError extends Error {
    }
    exports.TransientError = TransientError;
    class AsaasCallError extends TransientError {
    }
    exports.AsaasCallError = AsaasCallError;
    class RefundUnclearError extends TransientError {
    }
    exports.RefundUnclearError = RefundUnclearError;
    function budget(startedAt, clock = Date.now) {
        return () => {
            const left = exports.REQUEST_BUDGET_MS - (clock() - startedAt);
            if (left < 200)
                throw new TransientError('sem tempo para concluir o pedido');
            return Math.min(exports.CALL_TIMEOUT_MS, left);
        };
    }
    async function readJson(res) {
        const body = await res.text();
        let json = null;
        try {
            json = body === '' ? null : JSON.parse(body);
        }
        catch {
            json = null;
        }
        return { status: res.status, json };
    }
    const bare = (path) => path.replace(/\?.*$/, '');
    function asaasClient(config, fetcher, timeLeft) {
        return async (method, path, body) => {
            const init = {
                method,
                headers: { access_token: config.apiKey, 'User-Agent': 'Clarevo', 'Content-Type': 'application/json' },
                timeoutMs: timeLeft(),
                ...(body === undefined ? {} : { body: JSON.stringify(body) }),
            };
            let res;
            try {
                res = await fetcher(`${config.apiBase}${path}`, init);
            }
            catch {
                throw new AsaasCallError(`Asaas indisponível em ${method} ${bare(path)}`);
            }
            const out = await readJson(res);
            if (out.status >= 500)
                throw new AsaasCallError(`Asaas respondeu ${out.status} em ${method} ${bare(path)}`);
            return out;
        };
    }
    function supabaseClient(config, fetcher, timeLeft) {
        const call = async (what, url, init) => {
            const timeoutMs = timeLeft();
            let res;
            try {
                res = await fetcher(url, { ...init, timeoutMs });
            }
            catch {
                throw new TransientError(`banco indisponível em ${what}`);
            }
            const out = await readJson(res);
            if (out.status >= 500)
                throw new TransientError(`banco respondeu ${out.status} em ${what}`);
            return out;
        };
        return {
            rpcService: (fn, args) => call(fn, `${config.supabaseUrl}/rest/v1/rpc/${fn}`, { method: 'POST', headers: (0, servidor_comum_1.serviceHeaders)(config.serviceKey), body: JSON.stringify(args) }),
            rpcAsUser: (fn, jwt) => call(fn, `${config.supabaseUrl}/rest/v1/rpc/${fn}`, {
                method: 'POST',
                headers: { apikey: config.userApiKey, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
                body: '{}',
            }),
            userId: async (jwt) => {
                const r = await call('auth', `${config.supabaseUrl}/auth/v1/user`, { method: 'GET', headers: { apikey: config.userApiKey, Authorization: `Bearer ${jwt}` } });
                const id = text((0, servidor_comum_1.obj)(r.json)?.id);
                return r.status === 200 && id && UUID.test(id) ? id.toLowerCase() : null;
            },
        };
    }
    function backUrl(appUrl, sandbox) {
        return (result) => `${appUrl}/conta/assinatura?pagamento=${result}${sandbox ? '&assinar=teste' : ''}`;
    }
    function checkoutRequest(personId, plan, appUrl, firstDue, period = 'mensal', sandbox = false) {
        const back = backUrl(appUrl, sandbox);
        return {
            billingTypes: ['CREDIT_CARD'],
            chargeTypes: ['RECURRENT'],
            minutesToExpire: exports.CHECKOUT_MINUTES,
            externalReference: webReference(personId, plan),
            callback: { successUrl: back('sucesso'), cancelUrl: back('cancelado'), expiredUrl: back('expirado') },
            items: [
                {
                    name: `Clarevo, plano ${plano_precos_1.PLAN_NAME[plan]}`,
                    description: period === 'anual' ? 'Assinatura anual' : 'Assinatura mensal',
                    quantity: 1,
                    value: plano_precos_1.PLAN_PERIOD_PRICE_CENTS[plan][period] / 100,
                },
            ],
            subscription: { cycle: exports.ASAAS_CYCLE[period], nextDueDate: firstDue },
        };
    }
    function checkoutPixRequest(personId, plan, appUrl, period = 'mensal', sandbox = false) {
        const back = backUrl(appUrl, sandbox);
        return {
            billingTypes: ['PIX'],
            chargeTypes: ['DETACHED'],
            minutesToExpire: exports.CHECKOUT_MINUTES,
            externalReference: (0, pix_1.pixReference)(personId, plan, period),
            callback: { successUrl: back('sucesso'), cancelUrl: back('cancelado'), expiredUrl: back('expirado') },
            items: [
                {
                    name: `Clarevo, plano ${plano_precos_1.PLAN_NAME[plan]}`,
                    description: period === 'anual' ? 'Um ano de acesso, pago com Pix' : 'Um mês de acesso, pago com Pix',
                    quantity: 1,
                    value: plano_precos_1.PLAN_PERIOD_PRICE_CENTS[plan][period] / 100,
                },
            ],
        };
    }
    function periodArg(period) {
        return period === 'anual' ? { p_period: 'anual' } : {};
    }
    function validFromArg(validFrom) {
        return validFrom ? { p_valid_from: validFrom.toISOString() } : {};
    }
    function checkoutLink(response, sandbox) {
        const r = (0, servidor_comum_1.obj)(response);
        const link = text(r?.link);
        if (link && /^https:\/\/[a-z0-9.-]*asaas\.com\//.test(link))
            return link;
        const id = text(r?.id);
        return id ? `https://${sandbox ? 'sandbox.' : ''}asaas.com/checkoutSession/show?id=${encodeURIComponent(id)}` : null;
    }
    const JSON_TYPE = 'application/json; charset=utf-8';
    function corsHeaders(origin, appUrl) {
        if (origin === null)
            return {};
        const allowed = origin === appUrl || /^http:\/\/localhost(:\d+)?$/.test(origin);
        if (!allowed)
            return {};
        return {
            'Access-Control-Allow-Origin': origin,
            'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Max-Age': '86400',
            Vary: 'Origin',
        };
    }
    function json(status, body, extra = {}) {
        return { status, body: JSON.stringify(body), headers: { 'Content-Type': JSON_TYPE, ...extra } };
    }
    function referenceFromRpc(r) {
        const found = (0, servidor_comum_1.obj)(r.json);
        const personId = text(found?.person_id);
        const plan = found?.plan;
        if (r.status !== 200 || !personId || !UUID.test(personId) || (plan !== 'individual' && plan !== 'familiar'))
            return null;
        return { personId: personId.toLowerCase(), plan, period: found?.period === 'anual' ? 'anual' : 'mensal' };
    }
    const HASH = /^[0-9a-f]{64}$/;
    const DAY = /^\d{4}-\d{2}-\d{2}$/;
    const list = (json) => {
        const data = (0, servidor_comum_1.obj)(json)?.data;
        return Array.isArray(data) ? data : [];
    };
    function parseWithdrawalAfter(raw) {
        const a = (0, servidor_comum_1.obj)(raw);
        const status = text(a?.status);
        if (!a || !status)
            return null;
        const until = typeof a.until === 'string' && !Number.isNaN(Date.parse(a.until)) ? a.until : null;
        return { status, until, provider: text(a.provider) };
    }
    function parseWithdrawalOptions(raw) {
        const r = (0, servidor_comum_1.obj)(raw);
        if (r?.result === 'sem_pessoa')
            return 'sem_pessoa';
        if (r?.result !== 'ok')
            return null;
        const rows = (v) => (Array.isArray(v) ? v.map(servidor_comum_1.obj).filter((x) => x !== null) : []);
        const plan = (v) => (v === 'individual' || v === 'familiar' ? v : null);
        const web = [];
        for (const w of rows(r.web)) {
            const p = plan(w.plan);
            if (typeof w.external_ref === 'string' && HASH.test(w.external_ref) && p)
                web.push({ externalRef: w.external_ref, plan: p, after: parseWithdrawalAfter(w.access_after) });
        }
        const day = (v) => (typeof v === 'string' && DAY.test(v) ? v : null);
        const withdrawals = [];
        for (const w of rows(r.withdrawals)) {
            if ((w.provider !== 'web' && w.provider !== 'pix') || typeof w.purchase_hash !== 'string' || !HASH.test(w.purchase_hash))
                continue;
            if ((w.status !== 'pedida' && w.status !== 'devolvida' && w.status !== 'abandonada') || typeof w.requested_at !== 'string' || Number.isNaN(Date.parse(w.requested_at)))
                continue;
            const amount = typeof w.amount_cents === 'number' && Number.isSafeInteger(w.amount_cents) && w.amount_cents > 0 ? w.amount_cents : null;
            withdrawals.push({ provider: w.provider, purchaseHash: w.purchase_hash, status: w.status, requestedAt: w.requested_at, amountCents: amount, contractedOn: day(w.contracted_on) });
        }
        const pix = [];
        for (const x of rows(r.pix)) {
            const p = plan(x.plan);
            const paidOn = day(x.paid_on);
            if (typeof x.payment_hash !== 'string' || !HASH.test(x.payment_hash) || !p)
                continue;
            const hash = x.payment_hash;
            if (!paidOn && !withdrawals.some((w) => w.provider === 'pix' && w.purchaseHash === hash && w.status === 'pedida' && w.contractedOn))
                continue;
            pix.push({ paymentHash: hash, plan: p, period: x.period === 'anual' ? 'anual' : 'mensal', paidOn, startsOn: day(x.starts_on), after: parseWithdrawalAfter(x.access_after) });
        }
        return { web, pix, withdrawals };
    }
    exports.WITHDRAWAL_PIX_PAGES = 5;
    exports.WITHDRAWAL_REFUND_EVENTS = new Set(['PAYMENT_REFUNDED', 'PAYMENT_REFUND_IN_PROGRESS']);
    function createAssinaturaWebHandler(deps) {
        const log = deps.log ?? (() => { });
        const now = deps.now ?? (() => new Date());
        const config = deps.config;
        async function activeSubscriptions(asaas, personId) {
            const found = [];
            for (const plan of exports.PLANS) {
                const r = await asaas('GET', `/subscriptions?externalReference=${encodeURIComponent(webReference(personId, plan))}&status=ACTIVE&limit=10`);
                if (r.status !== 200)
                    throw new TransientError('Asaas não listou as assinaturas');
                const data = (0, servidor_comum_1.obj)(r.json)?.data;
                for (const raw of Array.isArray(data) ? data : []) {
                    const s = asaasSubscriptionFrom(raw);
                    if (s && !s.deleted && s.status === 'ACTIVE' && !found.some((f) => f.id === s.id))
                        found.push(s);
                }
            }
            return found;
        }
        async function resolveReference({ asaas, db }, sub) {
            const direct = parseWebReference(sub.externalReference);
            if (direct)
                return direct;
            const fromRpc = referenceFromRpc;
            let ref = null;
            if (sub.checkoutSession)
                ref = fromRpc(await db.rpcService('billing_checkout_person', { p_checkout_hash: (0, sha256_1.sha256Hex)(sub.checkoutSession) }));
            if (!ref)
                ref = fromRpc(await db.rpcService('billing_person_by_external_ref', { p_provider: 'web', p_external_ref: (0, sha256_1.sha256Hex)(sub.id) }));
            if (ref && !sub.deleted) {
                const put = await asaas('PUT', `/subscriptions/${encodeURIComponent(sub.id)}`, { externalReference: webReference(ref.personId, ref.plan) });
                if (put.status !== 200)
                    log(`não gravou a referência na assinatura (${put.status})`);
            }
            return ref;
        }
        async function closeWithdrawal(db, personId, provider, purchaseHash) {
            try {
                const r = await db.rpcService('billing_withdrawal_finish', { p_person: personId, p_provider: provider, p_purchase_hash: purchaseHash, p_refunded: true });
                if (r.status === 200 && (0, servidor_comum_1.obj)(r.json)?.result === 'devolvida')
                    log('aviso de estorno: pedido de desistência marcado como devolvido');
                else if (r.status !== 200 && r.status !== 404)
                    log(`banco não marcou o pedido de desistência no aviso de estorno (${r.status})`);
            }
            catch {
                log('banco indisponível ao marcar o pedido de desistência no aviso de estorno');
            }
        }
        async function applyPixPayment(clients, ev, paymentId, eventId) {
            const { asaas, db } = clients;
            const got = await asaas('GET', `/payments/${encodeURIComponent(paymentId)}`);
            let p = got.status === 200 ? asaasPaymentFrom(got.json) : null;
            if (!p && got.status === 404 && ev.payment?.id === paymentId)
                p = { ...ev.payment, deleted: true };
            if (!p) {
                if (got.status === 200 || got.status === 404)
                    return 'ignorado';
                throw new TransientError(`Asaas respondeu ${got.status} ao ler a cobrança`);
            }
            if (p.subscription || (p.billingType !== null && p.billingType !== 'PIX'))
                return 'ignorado';
            let ref = (0, pix_1.parsePixReference)(p.externalReference);
            if (!ref && p.checkoutSession)
                ref = referenceFromRpc(await db.rpcService('billing_checkout_person', { p_checkout_hash: (0, sha256_1.sha256Hex)(p.checkoutSession) }));
            if (!ref)
                ref = referenceFromRpc(await db.rpcService('billing_pix_person', { p_payment_hash: (0, sha256_1.sha256Hex)(p.id) }));
            if (!ref) {
                log(exports.PAID_STATUSES.has(p.status) ? `cobrança de Pix PAGA sem referência da Clarevo (${ev.event}): conferir no Asaas` : `aviso ${ev.event} de cobrança avulsa sem referência da Clarevo`);
                return 'sem_referencia';
            }
            const applied = await db.rpcService('billing_pix_apply', {
                p_event_id: eventId,
                p_person: ref.personId,
                p_plan: ref.plan,
                p_payment_hash: (0, sha256_1.sha256Hex)(p.id),
                p_paid_on: pixPaidOn(p, (0, dates_1.todayIn)(exports.ASAAS_TIME_ZONE, now())),
                p_event_at: ev.at.toISOString(),
                ...periodArg(ref.period),
            });
            if (exports.WITHDRAWAL_REFUND_EVENTS.has(ev.event) && !p.deleted && desistencia_1.REFUND_STATUSES.has(p.status))
                await closeWithdrawal(db, ref.personId, 'pix', (0, sha256_1.sha256Hex)(p.id));
            if (applied.status !== 200) {
                log(`banco recusou o aviso ${ev.event} de Pix (${applied.status})`);
                return 'recusado';
            }
            return (0, servidor_comum_1.obj)(applied.json)?.result === 'sem_pessoa' ? 'sem_pessoa' : 'aplicado';
        }
        async function applyPixEvent(clients, ev) {
            if (ev.payment && ev.event.startsWith('PAYMENT_'))
                return applyPixPayment(clients, ev, ev.payment.id, ev.id);
            if (!ev.checkoutId || ev.event !== 'CHECKOUT_PAID')
                return 'ignorado';
            const list = await clients.asaas('GET', `/payments?checkoutSession=${encodeURIComponent(ev.checkoutId)}&limit=10`);
            if (list.status !== 200)
                throw new TransientError(`Asaas respondeu ${list.status} ao listar as cobranças do Checkout`);
            const data = (0, servidor_comum_1.obj)(list.json)?.data;
            let outcome = 'ignorado';
            for (const raw of Array.isArray(data) ? data : []) {
                const p = asaasPaymentFrom(raw);
                if (!p || p.checkoutSession !== ev.checkoutId)
                    continue;
                const o = await applyPixPayment(clients, ev, p.id, `${ev.id}:${p.id}`.slice(0, 200));
                if (outcome === 'ignorado' || o === 'aplicado')
                    outcome = o;
            }
            return outcome;
        }
        async function applyEvent(clients, ev) {
            const { asaas, db } = clients;
            if (!ev.subscriptionId)
                return applyPixEvent(clients, ev);
            const got = await asaas('GET', `/subscriptions/${encodeURIComponent(ev.subscriptionId)}`);
            let sub = got.status === 200 ? asaasSubscriptionFrom(got.json) : null;
            const cycleUnknown = !sub && got.status === 404 && !ev.subscription;
            if (!sub && got.status === 404)
                sub = ev.subscription ?? goneSubscription(ev.subscriptionId);
            if (!sub) {
                if (got.status === 200)
                    return 'ignorado';
                throw new TransientError(`Asaas respondeu ${got.status} ao ler a assinatura`);
            }
            const ref = await resolveReference(clients, sub);
            if (!ref) {
                log(`aviso ${ev.event} de assinatura sem referência da Clarevo`);
                return 'sem_referencia';
            }
            if (cycleUnknown)
                sub = { ...sub, cycle: exports.ASAAS_CYCLE[ref.period ?? 'mensal'] };
            const since = (0, dates_1.addMonthsToDate)((0, dates_1.todayIn)(exports.ASAAS_TIME_ZONE, now()), -paymentsLookbackMonths(sub.cycle));
            const list = await asaas('GET', `/payments?subscription=${encodeURIComponent(sub.id)}&dueDate%5Bge%5D=${since}&limit=100`);
            if (list.status !== 200)
                throw new TransientError(`Asaas respondeu ${list.status} ao listar cobranças`);
            const data = (0, servidor_comum_1.obj)(list.json)?.data;
            const payments = (Array.isArray(data) ? data : []).map(asaasPaymentFrom).filter((p) => p !== null);
            const { validFrom, validUntil } = webValidity(sub, payments, now(), exports.REFUSED_EVENTS.has(ev.event));
            const applied = await db.rpcService('billing_apply', {
                p_event_id: ev.id,
                p_provider: 'web',
                p_person: ref.personId,
                p_external_ref: (0, sha256_1.sha256Hex)(sub.id),
                p_plan: ref.plan,
                p_valid_until: validUntil.toISOString(),
                p_event_at: ev.at.toISOString(),
                ...periodArg(periodOfCycle(sub.cycle)),
                ...validFromArg(validFrom),
            });
            const refunded = exports.WITHDRAWAL_REFUND_EVENTS.has(ev.event) ? payments.find((p) => p.id === ev.payment?.id) : undefined;
            if (refunded && !refunded.deleted && desistencia_1.REFUND_STATUSES.has(refunded.status))
                await closeWithdrawal(db, ref.personId, 'web', (0, sha256_1.sha256Hex)(sub.id));
            if (applied.status !== 200) {
                log(`banco recusou o aviso ${ev.event} (${applied.status})`);
                return 'recusado';
            }
            if ((0, servidor_comum_1.obj)(applied.json)?.result === 'sem_pessoa') {
                if (sub.status === 'ACTIVE' && !sub.deleted) {
                    const del = await asaas('DELETE', `/subscriptions/${encodeURIComponent(sub.id)}`);
                    if (del.status !== 200 && del.status !== 404)
                        throw new TransientError(`Asaas respondeu ${del.status} ao remover a assinatura`);
                }
                return 'cancelada_sem_pessoa';
            }
            return 'aplicado';
        }
        async function webhook(clients, req, token) {
            if (!config || !(0, servidor_comum_1.sameText)(token, config.webhookToken))
                return json(401, { result: 'recusado' });
            if (Number(req.header('content-length') ?? 0) > exports.ASAAS_MAX_BODY_BYTES)
                return json(413, { result: 'grande_demais' });
            const body = await req.body();
            if ((0, sha256_1.utf8Bytes)(body).length > exports.ASAAS_MAX_BODY_BYTES)
                return json(413, { result: 'grande_demais' });
            let payload;
            try {
                payload = JSON.parse(body);
            }
            catch {
                return json(400, { result: 'corpo_invalido' });
            }
            const ev = asaasEventFrom(payload, now());
            if (!ev)
                return json(200, { received: true, outcome: 'ignorado' });
            try {
                const outcome = await applyEvent(clients, ev);
                return json(200, { received: true, outcome });
            }
            catch (e) {
                log(`falha ao tratar o aviso ${ev.event}: ${e instanceof Error ? e.message : 'erro'}`);
                if (e instanceof TransientError)
                    return json(500, { result: 'tente_de_novo' });
                return json(200, { received: true, outcome: 'recusado' });
            }
        }
        async function findWithdrawals({ asaas }, personId, o) {
            const found = [];
            const pending = (provider, hash) => o.withdrawals.find((w) => w.provider === provider && w.purchaseHash === hash && w.status === 'pedida') ?? null;
            for (const plan of exports.PLANS) {
                const candidates = o.web.filter((w) => w.plan === plan);
                if (candidates.length === 0)
                    continue;
                const r = await asaas('GET', `/subscriptions?externalReference=${encodeURIComponent(webReference(personId, plan))}&includeDeleted=true&limit=100`);
                if (r.status !== 200)
                    throw new TransientError('Asaas não listou as assinaturas');
                for (const raw of list(r.json)) {
                    const s = asaasSubscriptionFrom(raw);
                    if (!s || parseWebReference(s.externalReference)?.personId !== personId)
                        continue;
                    const w = candidates.find((c) => c.externalRef === (0, sha256_1.sha256Hex)(s.id));
                    if (!w || found.some((f) => f.purchaseHash === w.externalRef))
                        continue;
                    const pays = await asaas('GET', `/payments?subscription=${encodeURIComponent(s.id)}&limit=100`);
                    if (pays.status !== 200)
                        throw new TransientError(`Asaas respondeu ${pays.status} ao listar cobranças`);
                    const payments = list(pays.json)
                        .map(asaasPaymentFrom)
                        .filter((p) => p !== null && (p.subscription === null || p.subscription === s.id));
                    const check = (0, desistencia_1.cardWithdrawal)(payments, now(), pending('web', w.externalRef) !== null);
                    found.push({ provider: 'web', purchaseHash: w.externalRef, plan: w.plan, period: periodOfCycle(s.cycle), after: w.after, check, sub: s });
                }
            }
            if (o.pix.length === 0)
                return found;
            const wanted = new Map();
            for (const row of o.pix) {
                const rec = pending('pix', row.paymentHash);
                const paidOn = row.paidOn ?? rec?.contractedOn ?? null;
                if (paidOn)
                    wanted.set(row.paymentHash, { row, paidOn, recorded: rec !== null });
            }
            const take = (raw) => {
                const p = asaasPaymentFrom(raw);
                const hit = p && !p.subscription ? wanted.get((0, sha256_1.sha256Hex)(p.id)) : undefined;
                if (!p || !hit)
                    return;
                wanted.delete(hit.row.paymentHash);
                const { row } = hit;
                found.push({ provider: 'pix', purchaseHash: row.paymentHash, plan: row.plan, period: row.period, after: row.after, check: (0, desistencia_1.pixWithdrawal)({ paidOn: hit.paidOn, startsOn: row.startsOn }, p, now(), hit.recorded) });
            };
            for (const ref of new Set([...wanted.values()].map((x) => (0, pix_1.pixReference)(personId, x.row.plan, x.row.period)))) {
                if (wanted.size === 0)
                    break;
                const r = await asaas('GET', `/payments?externalReference=${encodeURIComponent(ref)}&limit=100`);
                if (r.status !== 200)
                    throw new TransientError(`Asaas respondeu ${r.status} ao listar cobranças de Pix pela referência`);
                for (const raw of list(r.json))
                    take(raw);
            }
            if (wanted.size === 0)
                return found;
            const missing = wanted.size;
            const ranges = [...wanted.values()].map(({ row, paidOn }) => [
                (0, dates_1.addDays)(paidOn, row.paidOn === null && row.startsOn ? -exports.SCHEDULED_FIRST_CHARGE_MAX_DAYS : -1),
                (0, dates_1.addDays)(paidOn, 1),
            ]);
            const from = ranges.map((x) => x[0]).sort()[0];
            const to = ranges.map((x) => x[1]).sort().reverse()[0];
            let pages = 0;
            for (let page = 0; page < exports.WITHDRAWAL_PIX_PAGES && wanted.size > 0; page++) {
                pages++;
                const r = await asaas('GET', `/payments?billingType=PIX&paymentDate%5Bge%5D=${from}&paymentDate%5Ble%5D=${to}&limit=100&offset=${page * 100}`);
                if (r.status !== 200)
                    throw new TransientError(`Asaas respondeu ${r.status} ao listar cobranças de Pix`);
                for (const raw of list(r.json))
                    take(raw);
                if ((0, servidor_comum_1.obj)(r.json)?.hasMore !== true)
                    break;
            }
            log(`desistência: ${missing} pagamento(s) de Pix sem a referência na cobrança do Asaas; ${missing - wanted.size} achado(s) pelos dias de pagamento, em ${pages} página(s)`);
            return found;
        }
        const recordOf = (o, f) => o.withdrawals.find((w) => w.provider === f.provider && w.purchaseHash === f.purchaseHash) ?? null;
        const methodOf = (f) => (f.provider === 'pix' ? 'pix' : 'cartao');
        async function removeSubscription(asaas, sub) {
            if (!sub || sub.status !== 'ACTIVE' || sub.deleted)
                return;
            const del = await asaas('DELETE', `/subscriptions/${encodeURIComponent(sub.id)}`);
            if (del.status !== 200 && del.status !== 404)
                throw new TransientError(`Asaas respondeu ${del.status} ao remover a assinatura`);
        }
        async function currentPayment(asaas, path) {
            const r = await asaas('GET', path);
            return r.status === 200 ? asaasPaymentFrom(r.json) : null;
        }
        async function refund(asaas, payments, resumed) {
            for (const p of payments) {
                const path = `/payments/${encodeURIComponent(p.id)}`;
                if (resumed) {
                    const before = await currentPayment(asaas, path);
                    if (before && desistencia_1.REFUND_STATUSES.has(before.status))
                        continue;
                    if (!before || before.deleted || !desistencia_1.REFUNDABLE_STATUSES.has(before.status))
                        throw new TransientError('a cobrança relida não está paga para devolver');
                }
                let r;
                try {
                    r = await asaas('POST', `${path}/refund`, { description: desistencia_1.WITHDRAWAL_REFUND_DESCRIPTION });
                }
                catch (e) {
                    if (e instanceof AsaasCallError)
                        throw new RefundUnclearError(`devolução sem resposta clara: ${e.message}`);
                    throw e;
                }
                if (r.status === 200)
                    continue;
                const again = await currentPayment(asaas, path).catch(() => null);
                if (again && desistencia_1.REFUND_STATUSES.has(again.status))
                    continue;
                throw new TransientError(`Asaas recusou a devolução (${r.status})`);
            }
        }
        async function withdrawal(clients, personId, act) {
            const { asaas, db } = clients;
            const res = await db.rpcService('billing_withdrawal_options', { p_person: personId });
            if (res.status === 404) {
                log('billing_withdrawal_options não existe: falta a migração 0050');
                return [503, { result: 'indisponivel' }];
            }
            if (res.status !== 200)
                throw new TransientError(`banco respondeu ${res.status} em billing_withdrawal_options`);
            const o = parseWithdrawalOptions(res.json);
            if (o === 'sem_pessoa')
                return [401, { result: 'nao_autenticado' }];
            if (!o)
                throw new TransientError('resposta inesperada de billing_withdrawal_options');
            const found = (o.web.length + o.pix.length > 0 ? await findWithdrawals(clients, personId, o) : []).filter((f) => recordOf(o, f)?.status !== 'abandonada');
            const pendingFirst = (f) => (recordOf(o, f)?.status === 'pedida' ? 0 : 1);
            const best = found
                .flatMap((f) => (f.check.state === 'pode' ? [{ offer: f, check: f.check }] : []))
                .sort((a, b) => pendingFirst(a.offer) - pendingFirst(b.offer) || b.check.startDay.localeCompare(a.check.startDay))[0];
            const done = found.find((f) => f.check.state === 'devolvida' && recordOf(o, f) !== null);
            const receipt = (f, requestedAt, amountCents) => ({
                result: 'recebida',
                meio: methodOf(f),
                requestedAt,
                amountCents,
                after: f.after,
            });
            if (!act) {
                if (best) {
                    const { offer, check } = best;
                    return [200, { result: 'pode', meio: methodOf(offer), plan: offer.plan, period: offer.period, amountCents: check.amountCents, lastDay: (0, desistencia_1.withdrawalLastDay)(check.startDay), after: offer.after }];
                }
                if (done) {
                    const rec = recordOf(o, done);
                    return [200, receipt(done, rec.requestedAt, rec.amountCents)];
                }
                return [200, { result: 'sem_direito' }];
            }
            if (!best) {
                if (done) {
                    const rec = recordOf(o, done);
                    await removeSubscription(asaas, done.sub);
                    if (rec.status === 'pedida') {
                        await db.rpcService('billing_withdrawal_finish', { p_person: personId, p_provider: done.provider, p_purchase_hash: done.purchaseHash, p_refunded: true });
                    }
                    return [200, receipt(done, rec.requestedAt, rec.amountCents)];
                }
                const reason = found.some((f) => f.check.state === 'nada_cobrado') ? 'nada_cobrado' : found.some((f) => f.check.state === 'fora_do_prazo') ? 'fora_do_prazo' : 'sem_compra';
                return [200, { result: reason }];
            }
            const { offer, check } = best;
            const begun = await db.rpcService('billing_withdrawal_begin', {
                p_person: personId,
                p_provider: offer.provider,
                p_purchase_hash: offer.purchaseHash,
                p_plan: offer.plan,
                p_period: offer.period,
                p_amount_cents: check.amountCents,
                p_contracted_on: check.startDay,
            });
            if (begun.status !== 200) {
                log(`banco não gravou o pedido de desistência (${begun.status})`);
                return [500, { result: 'tente_de_novo' }];
            }
            const b = (0, servidor_comum_1.obj)(begun.json);
            const requestedAt = text(b?.requested_at);
            switch (b?.result) {
                case 'nova':
                case 'retomar':
                    break;
                case 'encerrada':
                    return [200, { result: 'sem_compra' }];
                case 'concluida':
                    return [200, receipt(offer, requestedAt ?? now().toISOString(), check.amountCents)];
                case 'em_andamento':
                    return [200, { result: 'em_andamento', requestedAt }];
                case 'fora_do_prazo':
                    return [200, { result: 'fora_do_prazo' }];
                case 'sem_pagamento':
                    return [200, { result: 'sem_compra' }];
                case 'muitas_tentativas':
                    return [429, { result: 'muitas_tentativas' }];
                case 'sem_pessoa':
                    return [401, { result: 'nao_autenticado' }];
                default:
                    log('resposta inesperada de billing_withdrawal_begin');
                    return [500, { result: 'tente_de_novo' }];
            }
            const at = requestedAt ?? now().toISOString();
            try {
                await removeSubscription(asaas, offer.sub);
                await refund(asaas, check.refundable, b?.result === 'retomar');
            }
            catch (e) {
                const unclear = e instanceof RefundUnclearError;
                await db
                    .rpcService('billing_withdrawal_finish', { p_person: personId, p_provider: offer.provider, p_purchase_hash: offer.purchaseHash, p_refunded: false, p_unclear: unclear })
                    .catch(() => undefined);
                log(`desistência sem devolução concluída${unclear ? ' (devolução sem resposta clara: trava de 5 minutos)' : ''}: ${e instanceof Error ? e.message : 'erro'}`);
                return [e instanceof TransientError ? 503 : 500, { result: 'tente_de_novo', requestedAt: at }];
            }
            const finished = await db
                .rpcService('billing_withdrawal_finish', { p_person: personId, p_provider: offer.provider, p_purchase_hash: offer.purchaseHash, p_refunded: true })
                .catch(() => null);
            if (!finished || finished.status !== 200)
                log('desistência devolvida sem a marca no banco');
            return [200, receipt(offer, at, check.amountCents)];
        }
        async function app({ asaas, db }, req, cors) {
            const reply = (status, body) => json(status, body, cors);
            if (!config)
                return reply(503, { result: 'indisponivel' });
            const auth = /^Bearer\s+(\S+)$/i.exec(req.header('authorization') ?? '');
            if (!auth)
                return reply(401, { result: 'nao_autenticado' });
            if (Number(req.header('content-length') ?? 0) > exports.APP_MAX_BODY_BYTES)
                return reply(413, { result: 'pedido_invalido' });
            const body = await req.body();
            if ((0, sha256_1.utf8Bytes)(body).length > exports.APP_MAX_BODY_BYTES)
                return reply(413, { result: 'pedido_invalido' });
            let payload;
            try {
                payload = (0, servidor_comum_1.obj)(JSON.parse(body));
            }
            catch {
                payload = null;
            }
            const action = payload?.action;
            const plan = payload?.plan;
            const period = payload?.period === undefined ? 'mensal' : payload.period === 'mensal' || payload.period === 'anual' ? payload.period : null;
            if ((action !== 'assinar' && action !== 'cancelar' && action !== 'pix' && action !== 'situacao' && action !== 'desistencia' && action !== 'desistir') ||
                ((action === 'assinar' || action === 'pix') && ((plan !== 'individual' && plan !== 'familiar') || period === null))) {
                return reply(400, { result: 'pedido_invalido' });
            }
            if ((action === 'desistencia' || action === 'desistir') && !plano_precos_1.WITHDRAWAL_OPEN && !config.sandbox)
                return reply(503, { result: 'indisponivel' });
            try {
                const personId = await db.userId(auth[1] ?? '');
                if (!personId)
                    return reply(401, { result: 'nao_autenticado' });
                if (action === 'desistencia' || action === 'desistir') {
                    const [status, body] = await withdrawal({ asaas, db }, personId, action === 'desistir');
                    return reply(status, body);
                }
                if (action === 'situacao') {
                    const subs = await activeSubscriptions(asaas, personId);
                    const next = subs.map((s) => s.nextDueDate).filter((d) => d !== null).sort()[0] ?? null;
                    return reply(200, subs.length > 0 ? { result: 'ativa', nextDueDate: next } : { result: 'sem_assinatura' });
                }
                if (action === 'cancelar') {
                    let removed = 0;
                    for (const s of await activeSubscriptions(asaas, personId)) {
                        const del = await asaas('DELETE', `/subscriptions/${encodeURIComponent(s.id)}`);
                        if (del.status !== 200 && del.status !== 404)
                            throw new TransientError(`Asaas respondeu ${del.status} ao remover a assinatura`);
                        removed++;
                    }
                    return reply(200, { result: removed > 0 ? 'cancelada' : 'sem_assinatura' });
                }
                if (!plano_precos_1.SUBSCRIBE_OPEN && !config.sandbox)
                    return reply(503, { result: 'indisponivel' });
                const access = await db.rpcAsUser('my_access', auth[1] ?? '');
                if (access.status === 401 || access.status === 403)
                    return reply(401, { result: 'nao_autenticado' });
                if (access.status !== 200)
                    throw new TransientError(`banco respondeu ${access.status} em my_access`);
                const current = (0, servidor_comum_1.obj)(access.json);
                const status = current?.status;
                const paysWithPix = action === 'pix' && current?.provider === 'pix';
                if (status === 'assinatura' && !paysWithPix)
                    return reply(200, { result: 'ja_assinante' });
                if (status === 'beneficio' || status === 'cortesia')
                    return reply(200, { result: 'sem_necessidade' });
                const currentPeriod = current?.period === 'anual' ? 'anual' : 'mensal';
                if (status === 'assinatura' && !(0, pix_1.pixCanPayNext)(typeof current?.until === 'string' ? current.until : null, now(), currentPeriod))
                    return reply(200, { result: 'ja_pago' });
                if ((await activeSubscriptions(asaas, personId)).length > 0) {
                    return reply(200, { result: status === 'assinatura' ? 'ja_assinante' : status === 'teste' ? 'assinatura_marcada' : 'cartao_ativo' });
                }
                const chosen = period ?? 'mensal';
                const firstDue = (0, primeira_cobranca_1.paidStartDay)(status, current?.until, now()) ?? (0, dates_1.todayIn)(exports.ASAAS_TIME_ZONE, now());
                const request = action === 'pix'
                    ? checkoutPixRequest(personId, plan, config.appUrl, chosen, config.sandbox)
                    : checkoutRequest(personId, plan, config.appUrl, firstDue, chosen, config.sandbox);
                const created = await asaas('POST', '/checkouts', request);
                const checkoutId = text((0, servidor_comum_1.obj)(created.json)?.id);
                const url = created.status === 200 ? checkoutLink(created.json, config.sandbox) : null;
                if (!checkoutId || !url) {
                    log(`Asaas não criou o Checkout (${created.status})`);
                    return reply(502, { result: 'indisponivel' });
                }
                const cancelCheckout = () => asaas('POST', `/checkouts/${encodeURIComponent(checkoutId)}/cancel`).catch(() => undefined);
                let recorded;
                try {
                    recorded = await db.rpcService('billing_checkout_record', { p_checkout_hash: (0, sha256_1.sha256Hex)(checkoutId), p_person: personId, p_plan: plan, ...periodArg(chosen) });
                }
                catch (e) {
                    await cancelCheckout();
                    throw e;
                }
                if (recorded.status !== 200) {
                    await cancelCheckout();
                    log(`banco não gravou o Checkout (${recorded.status})`);
                    return reply(500, { result: 'tente_de_novo' });
                }
                if ((0, servidor_comum_1.obj)(recorded.json)?.result === 'muitas_tentativas') {
                    await cancelCheckout();
                    return reply(429, { result: 'muitas_tentativas' });
                }
                return reply(200, { result: 'checkout', url });
            }
            catch (e) {
                log(`falha no pedido ${String(action)}: ${e instanceof Error ? e.message : 'erro'}`);
                return reply(e instanceof TransientError ? 503 : 500, { result: 'tente_de_novo' });
            }
        }
        return async (req) => {
            const cors = corsHeaders(req.header('origin'), config?.appUrl ?? exports.APP_URL_DEFAULT);
            if (req.method === 'OPTIONS')
                return { status: 204, body: '', headers: cors };
            if (!config) {
                log('configuração incompleta: faltam segredos da função');
                return json(503, { result: 'indisponivel' }, cors);
            }
            if (req.method !== 'POST')
                return json(405, { result: 'metodo_nao_aceito' }, cors);
            const timeLeft = budget(now().getTime(), () => now().getTime());
            const clients = { asaas: asaasClient(config, deps.fetch, timeLeft), db: supabaseClient(config, deps.fetch, timeLeft) };
            const token = req.header('asaas-access-token');
            if (token !== null)
                return webhook(clients, req, token);
            return app(clients, req, cors);
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
  // packages/core/src/plano-precos.ts
  function (module, exports, __req) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.PERIOD_NAME = exports.PLAN_NAME = exports.PLAN_PERIOD_PRICE_CENTS = exports.PLAN_PRICE_CENTS = exports.PERIOD_MONTHS = exports.BILLING_PERIODS = exports.WITHDRAWAL_OPEN = exports.SUBSCRIBE_OPEN = void 0;
    exports.parseBillingPeriod = parseBillingPeriod;
    exports.SUBSCRIBE_OPEN = false;
    exports.WITHDRAWAL_OPEN = false;
    exports.BILLING_PERIODS = ['mensal', 'anual'];
    exports.PERIOD_MONTHS = { mensal: 1, anual: 12 };
    exports.PLAN_PRICE_CENTS = { individual: 2990, familiar: 6990 };
    exports.PLAN_PERIOD_PRICE_CENTS = {
        individual: { mensal: 2990, anual: 26990 },
        familiar: { mensal: 6990, anual: 62990 },
    };
    exports.PLAN_NAME = { individual: 'Individual', familiar: 'Família' };
    exports.PERIOD_NAME = { mensal: 'mensal', anual: 'anual' };
    function parseBillingPeriod(v) {
        return v === 'mensal' || v === 'anual' ? v : null;
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
  // packages/core/src/sha256.ts
  function (module, exports, __req) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.utf8Bytes = utf8Bytes;
    exports.sha256HexOfBytes = sha256HexOfBytes;
    exports.sha256Hex = sha256Hex;
    const K = [
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be,
        0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa,
        0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85,
        0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
        0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f,
        0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
    ];
    function utf8Bytes(text) {
        const bytes = [];
        for (let i = 0; i < text.length; i++) {
            let code = text.charCodeAt(i);
            if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
                const low = text.charCodeAt(i + 1);
                if (low >= 0xdc00 && low <= 0xdfff) {
                    code = 0x10000 + ((code - 0xd800) << 10) + (low - 0xdc00);
                    i++;
                }
            }
            if (code >= 0xd800 && code <= 0xdfff)
                code = 0xfffd;
            if (code < 0x80)
                bytes.push(code);
            else if (code < 0x800)
                bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
            else if (code < 0x10000)
                bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
            else
                bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
        }
        return bytes;
    }
    const rotr = (x, n) => (x >>> n) | (x << (32 - n));
    function sha256HexOfBytes(input) {
        const bytes = input.slice();
        const bitLength = bytes.length * 8;
        bytes.push(0x80);
        while (bytes.length % 64 !== 56)
            bytes.push(0);
        const high = Math.floor(bitLength / 0x100000000);
        const low = bitLength >>> 0;
        for (const word of [high, low])
            bytes.push((word >>> 24) & 0xff, (word >>> 16) & 0xff, (word >>> 8) & 0xff, word & 0xff);
        const h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
        const w = new Array(64).fill(0);
        for (let offset = 0; offset < bytes.length; offset += 64) {
            for (let i = 0; i < 16; i++) {
                const j = offset + i * 4;
                w[i] = ((bytes[j] << 24) | (bytes[j + 1] << 16) | (bytes[j + 2] << 8) | bytes[j + 3]) >>> 0;
            }
            for (let i = 16; i < 64; i++) {
                const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
                const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
                w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
            }
            let [a, b, c, d, e, f, g, hh] = h;
            for (let i = 0; i < 64; i++) {
                const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
                const ch = (e & f) ^ (~e & g);
                const t1 = (hh + s1 + ch + K[i] + w[i]) >>> 0;
                const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
                const maj = (a & b) ^ (a & c) ^ (b & c);
                const t2 = (s0 + maj) >>> 0;
                hh = g;
                g = f;
                f = e;
                e = (d + t1) >>> 0;
                d = c;
                c = b;
                b = a;
                a = (t1 + t2) >>> 0;
            }
            h[0] = (h[0] + a) >>> 0;
            h[1] = (h[1] + b) >>> 0;
            h[2] = (h[2] + c) >>> 0;
            h[3] = (h[3] + d) >>> 0;
            h[4] = (h[4] + e) >>> 0;
            h[5] = (h[5] + f) >>> 0;
            h[6] = (h[6] + g) >>> 0;
            h[7] = (h[7] + hh) >>> 0;
        }
        return h.map((x) => x.toString(16).padStart(8, '0')).join('');
    }
    function sha256Hex(text) {
        return sha256HexOfBytes(utf8Bytes(text));
    }
  },
  // packages/core/src/assinatura-web/desistencia.ts
  function (module, exports, __req) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.REFUND_STATUSES = exports.REFUNDABLE_STATUSES = exports.WITHDRAWAL_REFUND_DESCRIPTION = exports.WITHDRAWAL_DEADLINE_OFFSET = exports.WITHDRAWAL_DAYS = void 0;
    exports.withdrawalLastDay = withdrawalLastDay;
    exports.withdrawalDeadline = withdrawalDeadline;
    exports.withinWithdrawal = withinWithdrawal;
    exports.cardChargeDay = cardChargeDay;
    exports.cardWithdrawal = cardWithdrawal;
    exports.pixWithdrawalStart = pixWithdrawalStart;
    exports.pixWithdrawal = pixWithdrawal;
    const dates_1 = __req(1);
    exports.WITHDRAWAL_DAYS = 7;
    exports.WITHDRAWAL_DEADLINE_OFFSET = '-05:00';
    exports.WITHDRAWAL_REFUND_DESCRIPTION = 'Desistência da compra em até 7 dias (CDC, art. 49)';
    exports.REFUNDABLE_STATUSES = new Set(['CONFIRMED', 'RECEIVED']);
    exports.REFUND_STATUSES = new Set(['REFUNDED', 'REFUND_REQUESTED', 'REFUND_IN_PROGRESS']);
    const EVER_PAID = new Set([
        ...exports.REFUNDABLE_STATUSES,
        ...exports.REFUND_STATUSES,
        'RECEIVED_IN_CASH',
        'DUNNING_RECEIVED',
        'CHARGEBACK_REQUESTED',
        'CHARGEBACK_DISPUTE',
        'AWAITING_CHARGEBACK_REVERSAL',
    ]);
    function withdrawalLastDay(startDay) {
        return (0, dates_1.addDays)(startDay, exports.WITHDRAWAL_DAYS);
    }
    function withdrawalDeadline(startDay) {
        return new Date(`${withdrawalLastDay(startDay)}T23:59:59.999${exports.WITHDRAWAL_DEADLINE_OFFSET}`);
    }
    function withinWithdrawal(startDay, now) {
        return now.getTime() <= withdrawalDeadline(startDay).getTime();
    }
    function cardChargeDay(p) {
        if (p.deleted || !EVER_PAID.has(p.status) || !p.dueDate)
            return null;
        const confirmed = p.confirmedOn ?? null;
        return confirmed && confirmed > p.dueDate ? confirmed : p.dueDate;
    }
    const cents = (p) => (typeof p.valueCents === 'number' && Number.isSafeInteger(p.valueCents) && p.valueCents > 0 ? p.valueCents : null);
    function refundTotal(refundable) {
        let total = 0;
        for (const p of refundable) {
            const c = cents(p);
            if (c === null)
                return null;
            total += c;
        }
        return total;
    }
    function cardWithdrawal(payments, now, recorded = false) {
        const charged = payments.map((p) => ({ p, day: cardChargeDay(p) })).filter((x) => x.day !== null);
        if (charged.length === 0)
            return { state: 'nada_cobrado' };
        const startDay = charged.map((x) => x.day).sort()[0];
        if (!recorded && !withinWithdrawal(startDay, now))
            return { state: 'fora_do_prazo', startDay };
        const refundable = charged.map((x) => x.p).filter((p) => exports.REFUNDABLE_STATUSES.has(p.status));
        if (refundable.length === 0) {
            return charged.some((x) => exports.REFUND_STATUSES.has(x.p.status)) ? { state: 'devolvida', startDay } : { state: 'sem_compra' };
        }
        const amountCents = refundTotal(refundable);
        return amountCents === null ? { state: 'sem_compra' } : { state: 'pode', startDay, refundable, amountCents };
    }
    function pixWithdrawalStart(row) {
        return row.startsOn && row.startsOn > row.paidOn ? row.startsOn : row.paidOn;
    }
    function pixWithdrawal(row, payment, now, recorded = false) {
        const startDay = pixWithdrawalStart(row);
        if (payment.deleted)
            return { state: 'sem_compra' };
        if (!recorded && !withinWithdrawal(startDay, now))
            return { state: 'fora_do_prazo', startDay };
        if (exports.REFUND_STATUSES.has(payment.status))
            return { state: 'devolvida', startDay };
        if (!exports.REFUNDABLE_STATUSES.has(payment.status))
            return { state: 'sem_compra' };
        const amountCents = cents(payment);
        return amountCents === null ? { state: 'sem_compra' } : { state: 'pode', startDay, refundable: [payment], amountCents };
    }
  },
  // packages/core/src/assinatura-web/pix.ts
  function (module, exports, __req) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.PIX_WARNING_DAYS_BY_PERIOD = exports.PIX_PAY_AHEAD_DAYS_BY_PERIOD = exports.PIX_WARNING_DAYS = exports.PIX_PAY_AHEAD_DAYS = exports.PIX_GRACE_DAYS = void 0;
    exports.pixReference = pixReference;
    exports.parsePixReference = parsePixReference;
    exports.pixNextPaymentFrom = pixNextPaymentFrom;
    exports.pixCanPayNext = pixCanPayNext;
    exports.PIX_GRACE_DAYS = 3;
    exports.PIX_PAY_AHEAD_DAYS = 10;
    exports.PIX_WARNING_DAYS = 7;
    exports.PIX_PAY_AHEAD_DAYS_BY_PERIOD = { mensal: exports.PIX_PAY_AHEAD_DAYS, anual: 30 };
    exports.PIX_WARNING_DAYS_BY_PERIOD = { mensal: exports.PIX_WARNING_DAYS, anual: 14 };
    const DAY_MS = 86_400_000;
    const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    function pixReference(personId, plan, period = 'mensal') {
        return `clarevo-pix:${personId.toLowerCase()}:${plan}${period === 'anual' ? ':anual' : ''}`;
    }
    function parsePixReference(ref) {
        if (typeof ref !== 'string')
            return null;
        const m = /^clarevo-pix:([0-9a-f-]{36}):(individual|familiar)(?::(mensal|anual))?$/i.exec(ref.trim());
        if (!m || !UUID.test(m[1] ?? ''))
            return null;
        return { personId: (m[1] ?? '').toLowerCase(), plan: m[2].toLowerCase(), period: m[3]?.toLowerCase() === 'anual' ? 'anual' : 'mensal' };
    }
    function pixNextPaymentFrom(until, period = 'mensal') {
        if (!until)
            return null;
        const end = Date.parse(until);
        return Number.isNaN(end) ? null : new Date(end - (exports.PIX_PAY_AHEAD_DAYS_BY_PERIOD[period] + exports.PIX_GRACE_DAYS) * DAY_MS + 1);
    }
    function pixCanPayNext(until, now, period = 'mensal') {
        const from = pixNextPaymentFrom(until, period);
        return from === null || now.getTime() >= from.getTime();
    }
  },
  // packages/core/src/assinatura-web/primeira-cobranca.ts
  function (module, exports, __req) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.FIRST_CHARGE_WINDOW_MS = exports.BILLING_TIME_ZONE = void 0;
    exports.paidStartDay = paidStartDay;
    exports.trialEndRelation = trialEndRelation;
    exports.trialEndPhrase = trialEndPhrase;
    exports.parseOwnWebEntitlements = parseOwnWebEntitlements;
    exports.hasLiveWebEntitlement = hasLiveWebEntitlement;
    exports.pendingFirstCharge = pendingFirstCharge;
    const dates_1 = __req(1);
    exports.BILLING_TIME_ZONE = 'America/Sao_Paulo';
    const DAY_MS = 86_400_000;
    exports.FIRST_CHARGE_WINDOW_MS = 4 * DAY_MS;
    function paidStartDay(status, until, now) {
        if (status !== 'teste' || typeof until !== 'string')
            return null;
        const end = Date.parse(until);
        if (Number.isNaN(end) || end <= now.getTime())
            return null;
        const day = (0, dates_1.todayIn)(exports.BILLING_TIME_ZONE, new Date(end));
        return day > (0, dates_1.todayIn)(exports.BILLING_TIME_ZONE, now) ? day : null;
    }
    function trialEndRelation(firstChargeDay, until, timeZone) {
        if (!until || Number.isNaN(Date.parse(until)))
            return 'mesmo-dia';
        const local = (0, dates_1.todayIn)(timeZone, new Date(until));
        if ((0, dates_1.addDays)(local, 1) === firstChargeDay)
            return 'dia-seguinte';
        if ((0, dates_1.addDays)(firstChargeDay, 1) === local)
            return 'vespera';
        return 'mesmo-dia';
    }
    function trialEndPhrase(rel) {
        return rel === 'dia-seguinte' ? 'no dia seguinte ao fim do teste grátis' : rel === 'vespera' ? 'na véspera do fim do teste grátis' : 'quando o teste grátis acaba';
    }
    function parseOwnWebEntitlements(raw) {
        if (!Array.isArray(raw))
            return [];
        const out = [];
        for (const r of raw) {
            const o = r && typeof r === 'object' ? r : null;
            if (!o || typeof o.valid_from !== 'string' || Number.isNaN(Date.parse(o.valid_from)))
                continue;
            const until = typeof o.valid_until === 'string' && !Number.isNaN(Date.parse(o.valid_until)) ? o.valid_until : null;
            out.push({ validFrom: o.valid_from, validUntil: until });
        }
        return out;
    }
    function live(e, now) {
        if (!e.validUntil)
            return false;
        const until = Date.parse(e.validUntil);
        return until > now.getTime() && until > Date.parse(e.validFrom);
    }
    function hasLiveWebEntitlement(entitlements, now) {
        return entitlements.some((e) => live(e, now));
    }
    function pendingFirstCharge(entitlements, now, cancelled = false) {
        if (cancelled)
            return null;
        for (const e of entitlements) {
            if (!live(e, now) || Date.parse(e.validUntil) - Date.parse(e.validFrom) > exports.FIRST_CHARGE_WINDOW_MS)
                continue;
            return (0, dates_1.todayIn)(exports.BILLING_TIME_ZONE, new Date(e.validFrom));
        }
        return null;
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

const assinatura = __req(0);
const handler = assinatura.createAssinaturaWebHandler({
  config: assinatura.assinaturaWebConfigFrom((name) => Deno.env.get(name)),
  // Cada chamada tem prazo (o Asaas conta como falha a resposta depois de 10 segundos).
  fetch: (url, init) => fetch(url, { method: init.method, headers: init.headers, body: init.body, signal: AbortSignal.timeout(init.timeoutMs) }),
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
