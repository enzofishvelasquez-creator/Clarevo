// @ts-nocheck
// GERADO por scripts/gerar-funcoes.js a partir de packages/core/src/assinatura-lojas. Não editar à mão: mude o núcleo e rode `npm run assinatura-lojas`.
// Clarevo · função do servidor "assinatura-lojas" (Edge Function do Supabase, D-090): recebe os avisos (webhooks) do RevenueCat com o
// token no cabeçalho Authorization e, para o app, o pedido "sincronizar" com a sessão da pessoa; nos dois casos consulta no
// RevenueCat o estado atual das assinaturas da App Store e do Google Play da pessoa e chama billing_apply no banco com a chave de
// serviço. Segredos no painel do Supabase (Edge Functions, Secrets): REVENUECAT_API_KEY (a chave secreta, sk_) e
// REVENUECAT_WEBHOOK_TOKEN. SUPABASE_URL e a chave de serviço o próprio Supabase fornece.
// Publicar com "Verify JWT" desligado (o RevenueCat não manda login; a função confere o token da sessão do app ela mesma).

const __mods = [
  // packages/core/src/assinatura-lojas/servidor.ts
  function (module, exports, __req) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.StoreTransientError = exports.STORE_PROVIDERS = exports.STORE_APP_URL_DEFAULT = exports.STORE_CALL_TIMEOUT_MS = exports.STORE_REQUEST_BUDGET_MS = exports.STORE_MAX_CUSTOMERS_PER_EVENT = exports.STORE_APP_MAX_BODY_BYTES = exports.STORE_WEBHOOK_MAX_BODY_BYTES = exports.REVENUECAT_WEBHOOK_TOKEN_PATTERN = exports.REVENUECAT_SECRET_PREFIX = exports.REVENUECAT_API_URL = void 0;
    exports.assinaturaLojasConfigFrom = assinaturaLojasConfigFrom;
    exports.storeCorsHeaders = storeCorsHeaders;
    exports.revenueCatEventFrom = revenueCatEventFrom;
    exports.storeProviderOf = storeProviderOf;
    exports.storeSubscriptionsFrom = storeSubscriptionsFrom;
    exports.subscriptionEnd = subscriptionEnd;
    exports.storeValidity = storeValidity;
    exports.storeExternalRef = storeExternalRef;
    exports.createAssinaturaLojasHandler = createAssinaturaLojasHandler;
    const servidor_comum_1 = __req(1);
    const sha256_1 = __req(2);
    const produtos_1 = __req(3);
    exports.REVENUECAT_API_URL = 'https://api.revenuecat.com/v1';
    exports.REVENUECAT_SECRET_PREFIX = 'sk_';
    exports.REVENUECAT_WEBHOOK_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,255}$/;
    exports.STORE_WEBHOOK_MAX_BODY_BYTES = 128 * 1024;
    exports.STORE_APP_MAX_BODY_BYTES = 4 * 1024;
    exports.STORE_MAX_CUSTOMERS_PER_EVENT = 4;
    exports.STORE_REQUEST_BUDGET_MS = 20000;
    exports.STORE_CALL_TIMEOUT_MS = 4000;
    exports.STORE_APP_URL_DEFAULT = 'https://app.clarevo.app.br';
    exports.STORE_PROVIDERS = ['apple', 'google'];
    function assinaturaLojasConfigFrom(env) {
        const v = (name) => (env(name) ?? '').trim();
        const revenueCatKey = v('REVENUECAT_API_KEY');
        if (!revenueCatKey.startsWith(exports.REVENUECAT_SECRET_PREFIX) || !/^[A-Za-z0-9_]{12,255}$/.test(revenueCatKey))
            return null;
        const webhookToken = v('REVENUECAT_WEBHOOK_TOKEN');
        if (!exports.REVENUECAT_WEBHOOK_TOKEN_PATTERN.test(webhookToken) || webhookToken === revenueCatKey)
            return null;
        const supabaseUrl = v('SUPABASE_URL').replace(/\/+$/, '');
        const serviceKey = (0, servidor_comum_1.serviceKeyFrom)(v);
        if (supabaseUrl === '' || serviceKey === '')
            return null;
        const userApiKey = v('SUPABASE_PUBLISHABLE_KEY') || v('SUPABASE_ANON_KEY') || serviceKey;
        const appUrl = (v('CLAREVO_APP_URL') || exports.STORE_APP_URL_DEFAULT).replace(/\/+$/, '');
        if (!/^https:\/\/[a-z0-9.-]+$/.test(appUrl) && !/^http:\/\/localhost(:\d+)?$/.test(appUrl))
            return null;
        return { revenueCatKey, webhookToken, supabaseUrl, serviceKey, userApiKey, appUrl };
    }
    function storeCorsHeaders(origin, appUrl) {
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
    const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const text = (v) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);
    function revenueCatEventFrom(payload, now) {
        const e = (0, servidor_comum_1.obj)((0, servidor_comum_1.obj)(payload)?.event);
        const id = text(e?.id);
        const type = text(e?.type);
        if (!e || !id || id.length > 120 || !type)
            return null;
        const ids = [e.app_user_id, e.original_app_user_id];
        for (const key of ['transferred_from', 'transferred_to', 'aliases']) {
            const list = e[key];
            if (Array.isArray(list))
                ids.push(...list);
        }
        const customers = [];
        for (const raw of ids) {
            const v = text(raw);
            if (!v || !UUID.test(v))
                continue;
            const lower = v.toLowerCase();
            if (!customers.includes(lower))
                customers.push(lower);
            if (customers.length >= exports.STORE_MAX_CUSTOMERS_PER_EVENT)
                break;
        }
        const ms = e.event_timestamp_ms;
        const at = typeof ms === 'number' && Number.isFinite(ms) && ms > 0 ? new Date(ms) : now;
        return { id, type, at: at.getTime() > now.getTime() ? now : at, customers };
    }
    const date = (v) => {
        if (typeof v !== 'string')
            return null;
        const d = new Date(v);
        return Number.isNaN(d.getTime()) ? null : d;
    };
    function storeProviderOf(store) {
        if (store === 'app_store')
            return 'apple';
        if (store === 'play_store')
            return 'google';
        return null;
    }
    function storeSubscriptionsFrom(raw) {
        const subscriber = (0, servidor_comum_1.obj)((0, servidor_comum_1.obj)(raw)?.subscriber);
        if (!subscriber)
            return null;
        const subs = (0, servidor_comum_1.obj)(subscriber.subscriptions);
        if (!subs)
            return [];
        const out = [];
        for (const [product, value] of Object.entries(subs)) {
            const s = (0, servidor_comum_1.obj)(value);
            if (!s)
                continue;
            out.push({
                product,
                plan: (0, produtos_1.planOfStoreProduct)(product),
                provider: storeProviderOf(s.store),
                expiresAt: date(s.expires_date),
                graceUntil: date(s.grace_period_expires_date),
                refundedAt: date(s.refunded_at),
                purchasedAt: date(s.purchase_date),
                familyShared: s.ownership_type === 'FAMILY_SHARED',
                sandbox: s.is_sandbox === true,
            });
        }
        return out;
    }
    function subscriptionEnd(s) {
        const paid = [s.expiresAt, s.graceUntil].filter((d) => d !== null);
        const end = paid.length > 0 ? new Date(Math.max(...paid.map((d) => d.getTime()))) : null;
        const refund = s.refundedAt && !(s.purchasedAt && s.refundedAt.getTime() < s.purchasedAt.getTime()) ? s.refundedAt : null;
        if (refund)
            return end && end.getTime() < refund.getTime() ? end : refund;
        return end;
    }
    function storeValidity(subs, provider, now) {
        const ends = [];
        for (const s of subs) {
            if (s.provider !== provider || !s.plan || s.familyShared)
                continue;
            const end = subscriptionEnd(s);
            if (end)
                ends.push({ plan: s.plan, end });
        }
        if (ends.length === 0)
            return null;
        const latest = (list) => list.reduce((a, b) => (b.end.getTime() > a.end.getTime() ? b : a));
        const active = ends.filter((e) => e.end.getTime() > now.getTime());
        if (active.length === 0) {
            const last = latest(ends);
            return { plan: last.plan, validUntil: last.end };
        }
        const family = active.filter((e) => e.plan === 'familiar');
        const chosen = latest(family.length > 0 ? family : active);
        return { plan: chosen.plan, validUntil: chosen.end };
    }
    function storeExternalRef(personId) {
        return (0, sha256_1.sha256Hex)(`revenuecat:${personId.toLowerCase()}`);
    }
    class StoreTransientError extends Error {
    }
    exports.StoreTransientError = StoreTransientError;
    function timeBudget(startedAt, clock) {
        return () => {
            const left = exports.STORE_REQUEST_BUDGET_MS - (clock() - startedAt);
            if (left < 300)
                throw new StoreTransientError('sem tempo para concluir o pedido');
            return Math.min(exports.STORE_CALL_TIMEOUT_MS, left);
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
    function clients(config, fetcher, timeLeft) {
        const call = async (what, url, init) => {
            const timeoutMs = timeLeft();
            let out;
            try {
                out = await readJson(await fetcher(url, { ...init, timeoutMs }));
            }
            catch {
                throw new StoreTransientError(`${what} indisponível`);
            }
            if (out.status >= 500)
                throw new StoreTransientError(`${what} respondeu ${out.status}`);
            return out;
        };
        return {
            subscriber: async (personId) => {
                const r = await call('RevenueCat', `${exports.REVENUECAT_API_URL}/subscribers/${encodeURIComponent(personId)}`, {
                    method: 'GET',
                    headers: { Authorization: `Bearer ${config.revenueCatKey}`, Accept: 'application/json' },
                });
                if (r.status !== 200)
                    throw new StoreTransientError(`RevenueCat respondeu ${r.status}`);
                const subs = storeSubscriptionsFrom(r.json);
                if (!subs)
                    throw new StoreTransientError('RevenueCat respondeu sem o cliente');
                return subs;
            },
            forget: async (personId) => {
                const r = await call('RevenueCat', `${exports.REVENUECAT_API_URL}/subscribers/${encodeURIComponent(personId)}`, {
                    method: 'DELETE',
                    headers: { Authorization: `Bearer ${config.revenueCatKey}`, Accept: 'application/json' },
                });
                if (r.status !== 200 && r.status !== 404)
                    throw new StoreTransientError(`RevenueCat respondeu ${r.status}`);
            },
            rpcService: async (fn, args) => {
                const r = await call(fn, `${config.supabaseUrl}/rest/v1/rpc/${fn}`, { method: 'POST', headers: (0, servidor_comum_1.serviceHeaders)(config.serviceKey), body: JSON.stringify(args) });
                if (r.status === 401 || r.status === 403)
                    throw new StoreTransientError(`banco recusou a chave em ${fn} (${r.status})`);
                return r;
            },
            userId: async (jwt) => {
                const r = await call('auth', `${config.supabaseUrl}/auth/v1/user`, { method: 'GET', headers: { apikey: config.userApiKey, Authorization: `Bearer ${jwt}` } });
                const id = text((0, servidor_comum_1.obj)(r.json)?.id);
                return r.status === 200 && id && UUID.test(id) ? id.toLowerCase() : null;
            },
        };
    }
    const JSON_TYPE = 'application/json; charset=utf-8';
    function json(status, body, extra = {}) {
        return { status, body: JSON.stringify(body), headers: { 'Content-Type': JSON_TYPE, ...extra } };
    }
    function createAssinaturaLojasHandler(deps) {
        const log = deps.log ?? (() => { });
        const now = deps.now ?? (() => new Date());
        const config = deps.config;
        async function syncPerson(c, personId, eventId, at) {
            const subs = await c.subscriber(personId);
            const ref = storeExternalRef(personId);
            const outcomes = [];
            for (const provider of exports.STORE_PROVIDERS) {
                let validity = storeValidity(subs, provider, now());
                let ended = false;
                if (!validity) {
                    const found = await c.rpcService('billing_person_by_external_ref', { p_provider: provider, p_external_ref: ref });
                    if (found.status !== 200)
                        throw new StoreTransientError(`banco respondeu ${found.status}`);
                    const row = (0, servidor_comum_1.obj)(found.json);
                    const plan = row?.plan;
                    if (text(row?.person_id)?.toLowerCase() !== personId || (plan !== 'individual' && plan !== 'familiar'))
                        continue;
                    validity = { plan, validUntil: now() };
                    ended = true;
                }
                const tag = (0, sha256_1.sha256Hex)(`${personId}:${provider}`).slice(0, 16);
                const minute = now().toISOString().slice(0, 16);
                const id = eventId
                    ? `rc:${eventId}:${tag}`
                    : `rc-app:${(0, sha256_1.sha256Hex)(`${personId}:${provider}:${validity.plan}:${ended ? 'fim' : validity.validUntil.toISOString()}:${minute}`).slice(0, 40)}`;
                const applied = await c.rpcService('billing_apply', {
                    p_event_id: id,
                    p_provider: provider,
                    p_person: personId,
                    p_external_ref: ref,
                    p_plan: validity.plan,
                    p_valid_until: validity.validUntil.toISOString(),
                    p_event_at: at.toISOString(),
                });
                if (applied.status !== 200) {
                    log(`banco recusou a assinatura da loja ${provider} (${applied.status})`);
                    outcomes.push('recusado');
                    continue;
                }
                const result = (0, servidor_comum_1.obj)(applied.json)?.result;
                outcomes.push(result === 'sem_pessoa' ? 'sem_pessoa' : result === 'aplicado' ? (ended ? 'encerrado' : 'aplicado') : 'sem_mudanca');
            }
            if (outcomes.includes('sem_pessoa'))
                await c.forget(personId);
            return outcomes;
        }
        async function webhook(c, req) {
            if (Number(req.header('content-length') ?? 0) > exports.STORE_WEBHOOK_MAX_BODY_BYTES)
                return json(413, { result: 'grande_demais' });
            const body = await req.body();
            if ((0, sha256_1.utf8Bytes)(body).length > exports.STORE_WEBHOOK_MAX_BODY_BYTES)
                return json(413, { result: 'grande_demais' });
            let payload;
            try {
                payload = JSON.parse(body);
            }
            catch {
                return json(400, { result: 'corpo_invalido' });
            }
            const ev = revenueCatEventFrom(payload, now());
            if (!ev || ev.customers.length === 0)
                return json(200, { received: true, outcome: 'ignorado' });
            try {
                const outcomes = [];
                for (const person of ev.customers)
                    outcomes.push(...(await syncPerson(c, person, ev.id, ev.at)));
                return json(200, { received: true, outcome: outcomes.length > 0 ? outcomes : 'ignorado' });
            }
            catch (e) {
                log(`falha ao tratar o aviso ${ev.type}: ${e instanceof Error ? e.message : 'erro'}`);
                if (e instanceof StoreTransientError)
                    return json(500, { result: 'tente_de_novo' });
                return json(200, { received: true, outcome: 'recusado' });
            }
        }
        async function app(c, req, jwt, cors) {
            const reply = (status, result) => json(status, { result }, cors);
            if (Number(req.header('content-length') ?? 0) > exports.STORE_APP_MAX_BODY_BYTES)
                return reply(413, 'pedido_invalido');
            const body = await req.body();
            if ((0, sha256_1.utf8Bytes)(body).length > exports.STORE_APP_MAX_BODY_BYTES)
                return reply(413, 'pedido_invalido');
            let payload;
            try {
                payload = (0, servidor_comum_1.obj)(JSON.parse(body));
            }
            catch {
                payload = null;
            }
            try {
                const personId = await c.userId(jwt);
                if (!personId)
                    return reply(401, 'nao_autenticado');
                if (payload?.action === 'esquecer') {
                    const ref = storeExternalRef(personId);
                    let seen = payload.visto === true;
                    for (const provider of exports.STORE_PROVIDERS) {
                        const found = await c.rpcService('billing_person_by_external_ref', { p_provider: provider, p_external_ref: ref });
                        if (found.status !== 200)
                            throw new StoreTransientError(`banco respondeu ${found.status}`);
                        if (text((0, servidor_comum_1.obj)(found.json)?.person_id)?.toLowerCase() === personId)
                            seen = true;
                    }
                    if (!seen)
                        return reply(200, 'sem_compra');
                    const subs = await c.subscriber(personId);
                    if (exports.STORE_PROVIDERS.some((p) => (storeValidity(subs, p, now())?.validUntil.getTime() ?? 0) > now().getTime()))
                        return reply(200, 'ativa');
                    await c.forget(personId);
                    return reply(200, 'esquecido');
                }
                if (payload?.action !== 'sincronizar')
                    return reply(400, 'pedido_invalido');
                const outcomes = await syncPerson(c, personId, null, now());
                if (outcomes.includes('recusado'))
                    return reply(500, 'tente_de_novo');
                return reply(200, outcomes.length > 0 ? 'sincronizado' : 'sem_compra');
            }
            catch (e) {
                log(`falha ao sincronizar a assinatura da loja: ${e instanceof Error ? e.message : 'erro'}`);
                return reply(e instanceof StoreTransientError ? 503 : 500, 'tente_de_novo');
            }
        }
        return async (req) => {
            const cors = storeCorsHeaders(req.header('origin'), config?.appUrl ?? exports.STORE_APP_URL_DEFAULT);
            if (req.method === 'OPTIONS')
                return { status: 204, body: '', headers: cors };
            if (!config) {
                log('configuração incompleta: faltam segredos da função');
                return json(503, { result: 'indisponivel' }, cors);
            }
            if (req.method !== 'POST')
                return json(405, { result: 'metodo_nao_aceito' }, cors);
            const timeLeft = timeBudget(now().getTime(), () => now().getTime());
            const c = clients(config, deps.fetch, timeLeft);
            const auth = (req.header('authorization') ?? '').trim();
            const bearer = auth.replace(/^Bearer\s+/i, '').trim();
            if (bearer !== '' && (0, servidor_comum_1.sameText)(bearer, config.webhookToken))
                return webhook(c, req);
            if (!/^Bearer\s+\S+$/i.test(auth))
                return json(401, { result: 'nao_autenticado' }, cors);
            return app(c, req, bearer, cors);
        };
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
  // packages/core/src/assinatura-lojas/produtos.ts
  function (module, exports, __req) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.GOOGLE_BASE_PLAN = exports.STORE_PRODUCT_IDS = void 0;
    exports.planOfStoreProduct = planOfStoreProduct;
    exports.STORE_PRODUCT_IDS = {
        individual: 'clarevo_individual_mensal',
        familiar: 'clarevo_familia_mensal',
    };
    exports.GOOGLE_BASE_PLAN = 'mensal';
    function planOfStoreProduct(id) {
        if (typeof id !== 'string')
            return null;
        const base = id.trim().split(':')[0] ?? '';
        if (base === exports.STORE_PRODUCT_IDS.individual)
            return 'individual';
        if (base === exports.STORE_PRODUCT_IDS.familiar)
            return 'familiar';
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

const lojas = __req(0);
const handler = lojas.createAssinaturaLojasHandler({
  config: lojas.assinaturaLojasConfigFrom((name) => Deno.env.get(name)),
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
