// @ts-nocheck
// GERADO por scripts/gerar-funcoes.js a partir de packages/core/src/aviso-fim-do-teste. Não editar à mão: mude o núcleo e rode `npm run whatsapp`.
// Clarevo · função do servidor "aviso-fim-do-teste" (Edge Function do Supabase, D-131 E, docs/53): acordada pelo agendamento do banco com o
// token no cabeçalho x-clarevo-avisos-token, pede ao banco um aviso por vez da fila que ele preparou (trial_notice_claim, com a chave de
// serviço), envia pela API do Resend o e-mail único de fim do teste e grava o resultado (trial_notice_finish). Sem o token, 401 e nada
// acontece. Segredos no painel do Supabase (Edge Functions, Secrets), só o Enzo: AVISOS_EMAIL_TOKEN e RESEND_API_KEY (sem ela, nada é
// enviado; o ensaio funciona sem ela); opcional CLAREVO_APP_URL. SUPABASE_URL e a chave de serviço o próprio Supabase fornece.
// Publicar com "Verify JWT" desligado (o agendamento não manda login; a função confere o token ela mesma).

const __mods = [
  // packages/core/src/aviso-fim-do-teste/servidor.ts
  function (module, exports, __req) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.CALL_TIMEOUT_MS = exports.RUN_BUDGET_MS = exports.SEND_GAP_MS = exports.MAX_PER_RUN = exports.AVISO_APP_URL_DEFAULT = exports.RESEND_KEY_PATTERN = exports.AVISOS_TOKEN_PATTERN = exports.AVISOS_TOKEN_HEADER = exports.RESEND_EMAILS_URL = void 0;
    exports.avisoFimDoTesteConfigFrom = avisoFimDoTesteConfigFrom;
    exports.parseClaim = parseClaim;
    exports.errorCode = errorCode;
    exports.retryableStatus = retryableStatus;
    exports.resendRequest = resendRequest;
    exports.createAvisoFimDoTesteHandler = createAvisoFimDoTesteHandler;
    const avisos_email_1 = __req(1);
    const plano_precos_1 = __req(3);
    const servidor_comum_1 = __req(4);
    exports.RESEND_EMAILS_URL = 'https://api.resend.com/emails';
    exports.AVISOS_TOKEN_HEADER = 'x-clarevo-avisos-token';
    exports.AVISOS_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,255}$/;
    exports.RESEND_KEY_PATTERN = /^re_[A-Za-z0-9_-]{8,200}$/;
    exports.AVISO_APP_URL_DEFAULT = 'https://app.clarevo.app.br';
    exports.MAX_PER_RUN = 50;
    exports.SEND_GAP_MS = 600;
    exports.RUN_BUDGET_MS = 60_000;
    exports.CALL_TIMEOUT_MS = 10_000;
    function avisoFimDoTesteConfigFrom(env) {
        const v = (name) => (env(name) ?? '').trim();
        const token = v('AVISOS_EMAIL_TOKEN');
        if (!exports.AVISOS_TOKEN_PATTERN.test(token))
            return null;
        const supabaseUrl = v('SUPABASE_URL').replace(/\/+$/, '');
        const serviceKey = (0, servidor_comum_1.serviceKeyFrom)(v);
        if (supabaseUrl === '' || serviceKey === '' || serviceKey === token)
            return null;
        const appUrl = (v('CLAREVO_APP_URL') || exports.AVISO_APP_URL_DEFAULT).replace(/\/+$/, '');
        if (!/^https:\/\/[a-z0-9.-]+$/.test(appUrl) && !/^http:\/\/localhost(:\d+)?$/.test(appUrl))
            return null;
        const key = v('RESEND_API_KEY');
        const resendKey = exports.RESEND_KEY_PATTERN.test(key) && key !== token ? key : null;
        return { supabaseUrl, serviceKey, token, resendKey, appUrl };
    }
    const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const EMAIL = /^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$/;
    const JSON_TYPE = 'application/json; charset=utf-8';
    function parseClaim(raw) {
        const r = (0, servidor_comum_1.obj)(raw);
        if (!r || typeof r.mode !== 'string' || !Array.isArray(r.items))
            return null;
        const items = [];
        for (const x of r.items) {
            const it = (0, servidor_comum_1.obj)(x);
            const id = typeof it?.id === 'string' ? it.id : '';
            const day = typeof it?.trial_ends_on === 'string' ? it.trial_ends_on : '';
            if (!it || !UUID.test(id) || !/^\d{4}-\d{2}-\d{2}$/.test(day) || typeof it.dry_run !== 'boolean')
                continue;
            items.push({ id, email: typeof it.email === 'string' ? it.email.trim() : null, trialEndsOn: day, dryRun: it.dry_run });
        }
        return { mode: r.mode, window: r.window === true, seen: typeof r.seen === 'number' ? r.seen : items.length, items };
    }
    function errorCode(status, name) {
        const n = typeof name === 'string' ? name.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') : '';
        return `http_${status}${n === '' ? '' : `_${n}`}`.slice(0, 60);
    }
    function retryableStatus(status) {
        return status === 401 || status === 403 || status === 408 || status === 409 || status === 429 || status >= 500;
    }
    function resendRequest(notice, appUrl) {
        if (!notice.email || !EMAIL.test(notice.email))
            throw new Error('sem e-mail');
        const msg = (0, avisos_email_1.trialEndingEmail)(notice.trialEndsOn, appUrl);
        return { from: avisos_email_1.NOTICE_EMAIL_FROM, to: [notice.email], reply_to: avisos_email_1.NOTICE_EMAIL_REPLY_TO, subject: msg.subject, text: msg.text, html: msg.html };
    }
    function json(status, body) {
        return { status, body: JSON.stringify(body), headers: { 'Content-Type': JSON_TYPE } };
    }
    async function readJson(res) {
        try {
            const text = await res.text();
            return text === '' ? null : JSON.parse(text);
        }
        catch {
            return null;
        }
    }
    function createAvisoFimDoTesteHandler(deps) {
        const log = deps.log ?? (() => { });
        const now = deps.now ?? (() => Date.now());
        const sleep = deps.sleep ?? (() => Promise.resolve());
        const subscribeOpen = deps.subscribeOpen ?? plano_precos_1.SUBSCRIBE_OPEN;
        const config = deps.config;
        async function rpc(cfg, fn, args) {
            try {
                const res = await deps.fetch(`${cfg.supabaseUrl}/rest/v1/rpc/${fn}`, {
                    method: 'POST',
                    headers: (0, servidor_comum_1.serviceHeaders)(cfg.serviceKey),
                    body: JSON.stringify(args),
                    timeoutMs: exports.CALL_TIMEOUT_MS,
                });
                return { status: res.status, json: await readJson(res) };
            }
            catch {
                return { status: 0, json: null };
            }
        }
        async function send(cfg, key, notice) {
            let body;
            try {
                body = resendRequest(notice, cfg.appUrl);
            }
            catch {
                return { outcome: 'recusado', error: 'sem_email' };
            }
            let res;
            try {
                res = await deps.fetch(exports.RESEND_EMAILS_URL, {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${key}`,
                        'Content-Type': 'application/json',
                        'Idempotency-Key': `aviso-fim-do-teste/${notice.id}`,
                        'User-Agent': 'Clarevo',
                    },
                    body: JSON.stringify(body),
                    timeoutMs: exports.CALL_TIMEOUT_MS,
                });
            }
            catch {
                return { outcome: 'falhou', error: 'rede' };
            }
            const out = (0, servidor_comum_1.obj)(await readJson(res));
            if (res.status >= 200 && res.status < 300) {
                const id = typeof out?.id === 'string' ? out.id : '';
                return /^[A-Za-z0-9-]{1,100}$/.test(id) ? { outcome: 'enviado', messageId: id } : { outcome: 'falhou', error: 'resposta_sem_id' };
            }
            const code = errorCode(res.status, out?.name);
            return retryableStatus(res.status) ? { outcome: 'falhou', error: code } : { outcome: 'recusado', error: code };
        }
        return async (req) => {
            if (!config) {
                log('aviso-fim-do-teste: configuração incompleta (AVISOS_EMAIL_TOKEN, SUPABASE_URL ou chave de serviço)');
                return json(503, { result: 'indisponivel' });
            }
            if (req.method !== 'POST')
                return json(405, { result: 'metodo_nao_aceito' });
            if (!(0, servidor_comum_1.sameText)(req.header(exports.AVISOS_TOKEN_HEADER) ?? '', config.token))
                return json(401, { result: 'nao_autorizado' });
            const key = config.resendKey;
            const canSend = key !== null && subscribeOpen;
            const startedAt = now();
            const totals = { enviados: 0, ensaios: 0, falhas: 0, recusados: 0 };
            let mode = 'desligado';
            let windowOpen = false;
            let processed = 0;
            let sentBefore = false;
            let stop = false;
            while (!stop && processed < exports.MAX_PER_RUN && now() - startedAt < exports.RUN_BUDGET_MS) {
                const r = await rpc(config, 'trial_notice_claim', { p_limit: 1, p_can_send: canSend });
                const claim = r.status === 200 ? parseClaim(r.json) : null;
                if (!claim) {
                    log(`aviso-fim-do-teste: o banco não entregou a fila (${r.status})`);
                    return json(502, { result: 'banco_indisponivel', ...totals });
                }
                mode = claim.mode;
                windowOpen = claim.window;
                if (claim.seen === 0)
                    break;
                for (const notice of claim.items) {
                    processed++;
                    let result;
                    if (notice.dryRun) {
                        (0, avisos_email_1.trialEndingEmail)(notice.trialEndsOn, config.appUrl);
                        result = { outcome: 'ensaio' };
                    }
                    else if (key === null || !canSend) {
                        result = { outcome: 'falhou', error: 'sem_chave' };
                        stop = true;
                    }
                    else {
                        if (sentBefore)
                            await sleep(exports.SEND_GAP_MS);
                        sentBefore = true;
                        result = await send(config, key, notice);
                        if (result.outcome === 'falhou')
                            stop = true;
                    }
                    const args = { p_id: notice.id, p_outcome: result.outcome };
                    if (result.outcome === 'enviado')
                        args.p_message_id = result.messageId;
                    if (result.outcome === 'falhou' || result.outcome === 'recusado')
                        args.p_error = result.error;
                    const saved = await rpc(config, 'trial_notice_finish', args);
                    if (saved.status !== 200)
                        log(`aviso-fim-do-teste: aviso ${notice.id} sem resultado gravado (${saved.status})`);
                    if (result.outcome === 'enviado')
                        totals.enviados++;
                    else if (result.outcome === 'ensaio')
                        totals.ensaios++;
                    else {
                        if (result.outcome === 'falhou')
                            totals.falhas++;
                        else
                            totals.recusados++;
                        log(`aviso-fim-do-teste: aviso ${notice.id} ${result.outcome}: ${result.error}`);
                    }
                }
            }
            let motivo = null;
            if (mode === 'ligado' && !canSend) {
                motivo = key === null ? 'sem_chave' : 'compra_fechada';
                log(`aviso-fim-do-teste: ligado, mas nada foi enviado (${key === null ? 'falta RESEND_API_KEY' : 'compra fechada, SUBSCRIBE_OPEN'})`);
            }
            log(`aviso-fim-do-teste: modo=${mode} janela=${windowOpen ? 'aberta' : 'fechada'} enviados=${totals.enviados} ensaios=${totals.ensaios} falhas=${totals.falhas} recusados=${totals.recusados}`);
            return json(200, { result: 'ok', modo: mode, janela: windowOpen, envio_possivel: canSend, ...(motivo ? { motivo } : {}), ...totals });
        };
    }
  },
  // packages/core/src/avisos-email.ts
  function (module, exports, __req) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.TRIAL_ENDING_EMAIL_TEXT = exports.TRIAL_NOTICE_DAYS_BEFORE = exports.SUBSCRIPTION_PATH = exports.NOTICE_EMAIL_REPLY_TO = exports.NOTICE_EMAIL_FROM = exports.NOTICE_EMAIL_FROM_ADDRESS = void 0;
    exports.noticeDate = noticeDate;
    exports.subscriptionUrl = subscriptionUrl;
    exports.trialEndingEmail = trialEndingEmail;
    const legal_1 = __req(2);
    exports.NOTICE_EMAIL_FROM_ADDRESS = 'nao-responda@clarevo.app.br';
    exports.NOTICE_EMAIL_FROM = `Clarevo <${exports.NOTICE_EMAIL_FROM_ADDRESS}>`;
    exports.NOTICE_EMAIL_REPLY_TO = legal_1.SUPPORT_EMAIL;
    exports.SUBSCRIPTION_PATH = '/conta/assinatura';
    exports.TRIAL_NOTICE_DAYS_BEFORE = 2;
    function noticeDate(isoDay) {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDay);
        if (!m)
            throw new Error('data inválida');
        const [, y, mo, d] = m;
        const check = new Date(`${isoDay}T12:00:00Z`);
        if (Number.isNaN(check.getTime()) || check.toISOString().slice(0, 10) !== isoDay)
            throw new Error('data inválida');
        return `${d}/${mo}/${y}`;
    }
    function subscriptionUrl(appUrl) {
        return `${appUrl.replace(/\/+$/, '')}${exports.SUBSCRIPTION_PATH}`;
    }
    exports.TRIAL_ENDING_EMAIL_TEXT = {
        subject: (date) => `O teste grátis da sua conta na Clarevo termina em ${date}`,
        greeting: 'Olá,',
        ends: (date) => `O teste grátis da sua conta na Clarevo termina em ${date}.`,
        after: 'Quando o teste terminar, sem assinatura, a conta fica só para ver e exportar; nada é apagado. Tudo o que você anotou continua guardado, ' +
            'e você pode assinar quando quiser para voltar a anotar.',
        howTo: 'Para assinar, abra Conta, Assinatura, no app ou na web:',
        oneTime: 'Este é um aviso único sobre a sua conta.',
        signature: 'Clarevo',
        support: (email) => `Dúvidas: ${email}`,
    };
    const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    function trialEndingEmail(trialEndsOn, appUrl) {
        const t = exports.TRIAL_ENDING_EMAIL_TEXT;
        const date = noticeDate(trialEndsOn);
        const url = subscriptionUrl(appUrl);
        if (!/^https:\/\/[a-z0-9.-]+\/conta\/assinatura$/.test(url) && !/^http:\/\/localhost(:\d+)?\/conta\/assinatura$/.test(url)) {
            throw new Error('endereço do app inválido');
        }
        const subject = t.subject(date);
        const text = [t.greeting, '', t.ends(date), '', t.after, '', t.howTo, url, '', t.oneTime, '', t.signature, t.support(legal_1.SUPPORT_EMAIL), ''].join('\n');
        const p = (inner, style = '') => `<p style="margin:0 0 16px${style}">${inner}</p>`;
        const html = [
            '<!doctype html>',
            '<html lang="pt-BR">',
            '<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">',
            `<title>${escapeHtml(subject)}</title></head>`,
            '<body style="margin:0;padding:24px;background:#ffffff;color:#17223B;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5">',
            p(escapeHtml(t.greeting)),
            p(escapeHtml(t.ends(date))),
            p(escapeHtml(t.after)),
            p(`${escapeHtml(t.howTo)}<br><a href="${escapeHtml(url)}" style="color:#2457F5">${escapeHtml(url)}</a>`),
            p(escapeHtml(t.oneTime)),
            p(`${escapeHtml(t.signature)}<br>${escapeHtml(t.support(''))}<a href="mailto:${escapeHtml(legal_1.SUPPORT_EMAIL)}" style="color:#2457F5">${escapeHtml(legal_1.SUPPORT_EMAIL)}</a>`, ';font-size:14px'),
            '</body>',
            '</html>',
            '',
        ].join('\n');
        return { subject, text, html };
    }
  },
  // packages/core/src/legal.ts
  function (module, exports, __req) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.SIGNUP_CONSENT_TEXT = exports.LEGAL_TEXT = exports.SITE_PAGES = exports.SUPPORT_TEXT = exports.CONTACT_EMAIL = exports.PRIVACY_EMAIL = exports.SUPPORT_EMAIL = void 0;
    exports.normalizeSiteUrl = normalizeSiteUrl;
    exports.sitePageUrl = sitePageUrl;
    exports.signupConsentParts = signupConsentParts;
    exports.SUPPORT_EMAIL = 'suporte@clarevo.app.br';
    exports.PRIVACY_EMAIL = 'privacidade@clarevo.app.br';
    exports.CONTACT_EMAIL = 'contato@clarevo.app.br';
    exports.SUPPORT_TEXT = {
        title: 'Ajuda e contato',
        hint: `Dúvidas sobre o app ou um problema: escreva para ${exports.SUPPORT_EMAIL}. Pedidos sobre os seus dados: ${exports.PRIVACY_EMAIL}.`,
        write: 'Escrever para o suporte',
        writeFailed: `Não foi possível abrir o e-mail neste aparelho. Escreva para ${exports.SUPPORT_EMAIL}.`,
    };
    exports.SITE_PAGES = {
        privacidade: 'privacidade.html',
        termos: 'termos.html',
        exclusao: 'excluir-conta.html',
        suporte: 'suporte.html',
    };
    const SITE_URL_RE = /^(https:\/\/[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:\d{1,5})?|http:\/\/localhost(:\d{1,5})?)(\/[^\s?#]*)?$/i;
    function normalizeSiteUrl(raw) {
        const texto = (raw ?? '').trim();
        if (!texto || !SITE_URL_RE.test(texto))
            return null;
        return texto.replace(/\/+$/, '');
    }
    function sitePageUrl(siteUrl, page) {
        const base = normalizeSiteUrl(siteUrl);
        return base ? `${base}/${exports.SITE_PAGES[page]}` : null;
    }
    exports.LEGAL_TEXT = {
        signup: {
            before: 'Ao criar a conta, você confirma que tem 18 anos ou mais e concorda com os ',
            terms: 'Termos de uso',
            between: ' e a ',
            privacy: 'Política de privacidade',
            after: '.',
        },
        account: {
            title: 'Privacidade e termos',
            hint: 'Abrem o site da Clarevo no navegador.',
            privacy: 'Política de privacidade',
            terms: 'Termos de uso',
            deletion: 'Excluir conta: como funciona',
            openFailed: 'Não foi possível abrir a página agora. Tente de novo em instantes.',
        },
        whoSees: {
            personal: 'Única pessoa do app que vê, anota, edita e exclui registros em Pessoal.',
            team: 'A equipe da Clarevo não olha os seus dados no dia a dia. Só acessa quando a lei exigir ou para resolver um problema que você pediu.',
            security: 'Seus registros ficam protegidos por permissões no servidor: entre as pessoas do app, só você vê o espaço Pessoal. Na Família, cada pessoa vê o que o papel dela permite.',
        },
    };
    function signupConsentParts() {
        const t = exports.LEGAL_TEXT.signup;
        return [{ text: t.before }, { text: t.terms, page: 'termos' }, { text: t.between }, { text: t.privacy, page: 'privacidade' }, { text: t.after }];
    }
    exports.SIGNUP_CONSENT_TEXT = signupConsentParts()
        .map((p) => p.text)
        .join('');
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
];
const __cache = [];
function __req(i) {
  if (__cache[i]) return __cache[i].exports;
  const module = { exports: {} };
  __cache[i] = module;
  __mods[i](module, module.exports, __req);
  return module.exports;
}

const aviso = __req(0);
const handler = aviso.createAvisoFimDoTesteHandler({
  config: aviso.avisoFimDoTesteConfigFrom((name) => Deno.env.get(name)),
  fetch: (url, init) => fetch(url, { method: init.method, headers: init.headers, body: init.body, signal: AbortSignal.timeout(init.timeoutMs) }),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  log: (message) => console.error(message),
});

Deno.serve(async (req) => {
  const res = await handler({ method: req.method, header: (name) => req.headers.get(name) });
  return new Response(res.body, { status: res.status, headers: res.headers });
});
