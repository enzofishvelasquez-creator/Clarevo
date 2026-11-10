/// <reference types="node" />
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';
import {
  GOOGLE_BASE_PLAN,
  REVENUECAT_API_URL,
  STORE_MAX_CUSTOMERS_PER_EVENT,
  STORE_PRODUCT_IDS,
  STORE_SUBSCRIPTION_FUNCTION,
  STORE_SUBSCRIPTION_TEXT,
  assinaturaLojasConfigFrom,
  canSubscribeInStore,
  createAssinaturaLojasHandler,
  isStoreSubscription,
  parseStoreForget,
  parseStoreSync,
  planOfStoreProduct,
  revenueCatEventFrom,
  sha256Hex,
  storeExternalRef,
  storeProviderOf,
  storeSubscriptionsFrom,
  storeValidity,
  subscriptionEnd,
  type AssinaturaLojasConfig,
  type StoreHttpFetch,
  type StoreSubscription,
} from '../src';

/** Dados FICTÍCIOS: chaves, pessoas e identificadores inventados. */
const RC_KEY = 'sk_chave_secreta_de_teste_0000000000';
const TOKEN = 'token_dos_avisos_de_teste_0123456789abcdef';
const JWT = 'eyJ.sessao.de.teste';
const ANA = '0d2f4a6c-1b3e-4c5d-8e9f-0a1b2c3d4e5f';
const BIA = '7a1c2e3f-4b5d-4e6f-9a0b-1c2d3e4f5a6b';
const NOW = new Date('2026-11-10T15:00:00.000Z');

const config: AssinaturaLojasConfig = {
  revenueCatKey: RC_KEY,
  webhookToken: TOKEN,
  supabaseUrl: 'https://projeto.supabase.co',
  serviceKey: 'sb_secret_x',
  userApiKey: 'sb_publishable_x',
};

/** Uma assinatura como a API v1 do RevenueCat a devolve em subscriber.subscriptions. */
const rcSub = (extra: Record<string, unknown> = {}) => ({
  store: 'app_store',
  expires_date: '2026-12-10T15:00:00Z',
  purchase_date: '2026-11-10T15:00:00Z',
  original_purchase_date: '2026-11-10T15:00:00Z',
  grace_period_expires_date: null,
  refunded_at: null,
  unsubscribe_detected_at: null,
  billing_issues_detected_at: null,
  is_sandbox: false,
  period_type: 'normal',
  ownership_type: 'PURCHASED',
  ...extra,
});
const subscriber = (subscriptions: Record<string, unknown>) => ({ request_date_ms: NOW.getTime(), subscriber: { original_app_user_id: ANA, subscriptions, entitlements: {} } });

type Answer = (init: { method: string; body?: string }) => { status: number; body: unknown };

/** A rede falsa: o RevenueCat e o banco, com o que cada endereço responde, e o registro do que foi mandado. */
function fakeNet(answers: Record<string, Answer> = {}) {
  const sent: { method: string; url: string; headers: Record<string, string>; body: unknown; timeoutMs: number }[] = [];
  const fetcher: StoreHttpFetch = async (url, init) => {
    sent.push({ method: init.method, url, headers: init.headers, body: init.body === undefined ? undefined : JSON.parse(init.body), timeoutMs: init.timeoutMs });
    const key = `${init.method} ${url.replace(/^https:\/\/[^/]+/, '').replace(/\?.*$/, '')}`;
    const r = answers[key]?.(init) ?? { status: 404, body: { code: 7259 } };
    return { status: r.status, text: async () => (typeof r.body === 'string' ? r.body : JSON.stringify(r.body)) };
  };
  return { sent, fetcher };
}

function request(opts: { method?: string; headers?: Record<string, string>; body?: string }) {
  const headers = Object.fromEntries(Object.entries(opts.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
  return { method: opts.method ?? 'POST', header: (name: string) => headers[name.toLowerCase()] ?? null, body: async () => opts.body ?? '' };
}
const webhookReq = (payload: unknown, auth: string | null = `Bearer ${TOKEN}`) =>
  request({ headers: auth === null ? {} : { Authorization: auth }, body: JSON.stringify(payload) });
const appReq = (body: unknown, jwt: string | null = JWT) => request({ headers: jwt === null ? {} : { Authorization: `Bearer ${jwt}` }, body: JSON.stringify(body) });

const rcEvent = (extra: Record<string, unknown> = {}) => ({
  api_version: '1.0',
  event: {
    id: 'e1f2a3b4-0000-4000-8000-000000000001',
    type: 'INITIAL_PURCHASE',
    app_user_id: ANA,
    original_app_user_id: ANA,
    aliases: [ANA, '$RCAnonymousID:8b1e2f3a4c5d'],
    product_id: STORE_PRODUCT_IDS.individual,
    store: 'APP_STORE',
    environment: 'PRODUCTION',
    event_timestamp_ms: Date.parse('2026-11-10T14:59:00Z'),
    ...extra,
  },
});

/** O banco de sempre: o aviso aplicado e nenhum direito anterior; guarda o que billing_apply recebeu. */
function db(opts: { previous?: Record<string, { person_id: string; plan: string }>; result?: string; status?: number } = {}) {
  const applied: Record<string, unknown>[] = [];
  const lookups: Record<string, unknown>[] = [];
  const answers: Record<string, Answer> = {
    'POST /rest/v1/rpc/billing_apply': (init) => {
      applied.push(JSON.parse(init.body ?? '{}'));
      return { status: opts.status ?? 200, body: { result: opts.result ?? 'aplicado' } };
    },
    'POST /rest/v1/rpc/billing_person_by_external_ref': (init) => {
      const args = JSON.parse(init.body ?? '{}') as { p_provider: string; p_external_ref: string };
      lookups.push(args);
      const row = Object.entries(opts.previous ?? {}).find(([k]) => k === `${args.p_provider}:${args.p_external_ref}`)?.[1];
      return { status: 200, body: row ?? null };
    },
  };
  return { answers, applied, lookups };
}
const rcAnswer = (person: string, subs: Record<string, unknown>, status = 200): Record<string, Answer> => ({
  [`GET /v1/subscribers/${person}`]: () => ({ status, body: status === 200 ? subscriber(subs) : { code: 7225 } }),
});
const user = (id: string = ANA): Record<string, Answer> => ({ 'GET /auth/v1/user': () => ({ status: 200, body: { id } }) });

describe('Assinatura pelas lojas (D-090): produtos e configuração', () => {
  it('os mesmos identificadores nas duas lojas; no Google, com o plano básico mensal', () => {
    expect(STORE_PRODUCT_IDS).toEqual({ individual: 'clarevo_individual_mensal', familiar: 'clarevo_familia_mensal' });
    expect(GOOGLE_BASE_PLAN).toBe('mensal');
    expect(planOfStoreProduct('clarevo_individual_mensal')).toBe('individual');
    expect(planOfStoreProduct('clarevo_familia_mensal:mensal')).toBe('familiar');
    expect(planOfStoreProduct('clarevo_individual_anual')).toBeNull();
    expect(planOfStoreProduct('outro_app_mensal')).toBeNull();
    expect(planOfStoreProduct(undefined)).toBeNull();
    expect(STORE_SUBSCRIPTION_FUNCTION).toBe('assinatura-lojas');
  });

  it('só funciona com a chave secreta do RevenueCat, o token dos avisos (diferente da chave) e o banco', () => {
    const env = (extra: Record<string, string | undefined>) => (name: string) =>
      ({ REVENUECAT_API_KEY: RC_KEY, REVENUECAT_WEBHOOK_TOKEN: TOKEN, SUPABASE_URL: 'https://projeto.supabase.co/', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_x', ...extra })[name];
    expect(assinaturaLojasConfigFrom(env({}))).toMatchObject({ revenueCatKey: RC_KEY, supabaseUrl: 'https://projeto.supabase.co', userApiKey: 'sb_secret_x' });
    expect(assinaturaLojasConfigFrom(env({ SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_x' }))?.userApiKey).toBe('sb_publishable_x');
    // A chave pública do SDK (appl_, goog_) não serve na função.
    expect(assinaturaLojasConfigFrom(env({ REVENUECAT_API_KEY: 'appl_chavepublica0000' }))).toBeNull();
    expect(assinaturaLojasConfigFrom(env({ REVENUECAT_API_KEY: '' }))).toBeNull();
    expect(assinaturaLojasConfigFrom(env({ REVENUECAT_WEBHOOK_TOKEN: 'curto' }))).toBeNull();
    expect(assinaturaLojasConfigFrom(env({ REVENUECAT_WEBHOOK_TOKEN: RC_KEY }))).toBeNull();
    expect(assinaturaLojasConfigFrom(env({ SUPABASE_URL: '' }))).toBeNull();
    expect(assinaturaLojasConfigFrom(env({ SUPABASE_SERVICE_ROLE_KEY: '' }))).toBeNull();
  });
});

describe('Assinatura pelas lojas (D-090): o aviso e a validade', () => {
  it('o aviso traz as pessoas no formato da conta, sem repetir; anônimos do RevenueCat e o teste do painel ficam de fora', () => {
    const ev = revenueCatEventFrom(rcEvent(), NOW);
    expect(ev).toEqual({ id: 'e1f2a3b4-0000-4000-8000-000000000001', type: 'INITIAL_PURCHASE', at: new Date('2026-11-10T14:59:00Z'), customers: [ANA] });
    const transfer = revenueCatEventFrom(rcEvent({ type: 'TRANSFER', app_user_id: undefined, original_app_user_id: undefined, aliases: undefined, transferred_from: [ANA.toUpperCase()], transferred_to: [BIA] }), NOW);
    expect(transfer?.customers).toEqual([ANA, BIA]);
    expect(revenueCatEventFrom(rcEvent({ type: 'TEST', app_user_id: '$RCAnonymousID:teste', original_app_user_id: 'teste', aliases: [] }), NOW)?.customers).toEqual([]);
    const many = Array.from({ length: 8 }, (_, i) => `00000000-0000-4000-8000-00000000000${i}`);
    expect(revenueCatEventFrom(rcEvent({ aliases: many }), NOW)?.customers).toHaveLength(STORE_MAX_CUSTOMERS_PER_EVENT);
    // Sem hora, ou com hora no futuro, vale a do recebimento.
    expect(revenueCatEventFrom(rcEvent({ event_timestamp_ms: undefined }), NOW)?.at).toEqual(NOW);
    expect(revenueCatEventFrom(rcEvent({ event_timestamp_ms: NOW.getTime() + 3_600_000 }), NOW)?.at).toEqual(NOW);
    expect(revenueCatEventFrom({ event: { type: 'RENEWAL' } }, NOW)).toBeNull();
    expect(revenueCatEventFrom({ id: 'x' }, NOW)).toBeNull();
  });

  it('lê as assinaturas da API v1: a loja, o plano pelo produto, as datas e o reembolso', () => {
    const subs = storeSubscriptionsFrom(
      subscriber({
        clarevo_individual_mensal: rcSub(),
        'clarevo_familia_mensal:mensal': rcSub({ store: 'play_store', is_sandbox: true, grace_period_expires_date: '2026-12-13T15:00:00Z' }),
        promo_qualquer: rcSub({ store: 'promotional' }),
      }),
    );
    expect(subs).toHaveLength(3);
    expect(subs[0]).toMatchObject({ product: 'clarevo_individual_mensal', plan: 'individual', provider: 'apple', expiresAt: new Date('2026-12-10T15:00:00Z'), sandbox: false });
    expect(subs[1]).toMatchObject({ plan: 'familiar', provider: 'google', graceUntil: new Date('2026-12-13T15:00:00Z'), sandbox: true });
    expect(subs[2]).toMatchObject({ plan: null, provider: null });
    expect(storeProviderOf('app_store')).toBe('apple');
    expect(storeProviderOf('play_store')).toBe('google');
    expect(storeProviderOf('rc_billing')).toBeNull();
    expect(storeSubscriptionsFrom({})).toEqual([]);
    expect(storeSubscriptionsFrom(null)).toEqual([]);
  });

  it('até quando vale: o período pago ou a tolerância da loja; o reembolso termina na data dele; outra loja não conta', () => {
    const s = (extra: Partial<StoreSubscription>): StoreSubscription => ({
      product: STORE_PRODUCT_IDS.individual,
      plan: 'individual',
      provider: 'apple',
      expiresAt: new Date('2026-12-10T15:00:00Z'),
      graceUntil: null,
      refundedAt: null,
      sandbox: false,
      ...extra,
    });
    expect(subscriptionEnd(s({}))).toEqual(new Date('2026-12-10T15:00:00Z'));
    expect(subscriptionEnd(s({ graceUntil: new Date('2026-12-26T15:00:00Z') }))).toEqual(new Date('2026-12-26T15:00:00Z'));
    expect(subscriptionEnd(s({ refundedAt: new Date('2026-11-12T10:00:00Z') }))).toEqual(new Date('2026-11-12T10:00:00Z'));
    expect(subscriptionEnd(s({ expiresAt: new Date('2026-11-01T00:00:00Z'), refundedAt: new Date('2026-11-12T10:00:00Z') }))).toEqual(new Date('2026-11-01T00:00:00Z'));
    expect(storeValidity([s({})], 'apple')).toEqual({ plan: 'individual', validUntil: new Date('2026-12-10T15:00:00Z') });
    expect(storeValidity([s({})], 'google')).toBeNull();
    // Na troca de plano, vale a de fim mais distante; empate fica com o Família.
    const upgrade = [s({ expiresAt: new Date('2026-11-10T15:00:00Z') }), s({ product: STORE_PRODUCT_IDS.familiar, plan: 'familiar', expiresAt: new Date('2026-12-10T15:00:00Z') })];
    expect(storeValidity(upgrade, 'apple')).toEqual({ plan: 'familiar', validUntil: new Date('2026-12-10T15:00:00Z') });
    const tie = [s({}), s({ product: STORE_PRODUCT_IDS.familiar, plan: 'familiar' })];
    expect(storeValidity(tie, 'apple')?.plan).toBe('familiar');
    // Terminada: o direito acaba na data do fim; produto de fora não conta.
    expect(storeValidity([s({ expiresAt: new Date('2026-10-10T15:00:00Z') })], 'apple')?.validUntil).toEqual(new Date('2026-10-10T15:00:00Z'));
    expect(storeValidity([s({ plan: null, product: 'outro' })], 'apple')).toBeNull();
  });

  it('o identificador no banco é o resumo de "revenuecat:<pessoa>", o mesmo em maiúsculas e minúsculas', () => {
    expect(storeExternalRef(ANA)).toBe(sha256Hex(`revenuecat:${ANA}`));
    expect(storeExternalRef(ANA.toUpperCase())).toBe(storeExternalRef(ANA));
    expect(storeExternalRef(ANA)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('Assinatura pelas lojas (D-090): a função, avisos do RevenueCat', () => {
  it('compra na App Store: consulta o RevenueCat com a chave secreta e aplica no banco a loja, o plano, o fim do período e a hora do evento', async () => {
    const base = db();
    const net = fakeNet({ ...base.answers, ...rcAnswer(ANA, { clarevo_individual_mensal: rcSub() }) });
    const h = createAssinaturaLojasHandler({ config, fetch: net.fetcher, now: () => NOW });
    const res = await h(webhookReq(rcEvent()));
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ received: true, outcome: ['aplicado'] });
    const rc = net.sent.find((x) => x.url.startsWith(REVENUECAT_API_URL));
    expect(rc).toMatchObject({ method: 'GET', url: `${REVENUECAT_API_URL}/subscribers/${ANA}` });
    expect(rc?.headers.Authorization).toBe(`Bearer ${RC_KEY}`);
    expect(base.applied).toEqual([
      {
        p_event_id: `rc:e1f2a3b4-0000-4000-8000-000000000001:${sha256Hex(`${ANA}:apple`).slice(0, 16)}`,
        p_provider: 'apple',
        p_person: ANA,
        p_external_ref: storeExternalRef(ANA),
        p_plan: 'individual',
        p_valid_until: '2026-12-10T15:00:00.000Z',
        p_event_at: '2026-11-10T14:59:00.000Z',
      },
    ]);
    // Sem assinatura do Google e sem direito anterior por ele: só a consulta, nada aplicado.
    expect(base.lookups).toEqual([{ p_provider: 'google', p_external_ref: storeExternalRef(ANA) }]);
    // O identificador do aviso no banco não leva a pessoa.
    expect(String(base.applied[0]?.p_event_id)).not.toContain(ANA);
    expect(net.sent.every((x) => x.timeoutMs > 0)).toBe(true);
  });

  it('o token vale com ou sem "Bearer"; token errado vira pedido do app sem sessão válida', async () => {
    const base = db();
    const answers = { ...base.answers, ...rcAnswer(ANA, { clarevo_individual_mensal: rcSub() }), 'GET /auth/v1/user': () => ({ status: 401, body: {} }) };
    const h = createAssinaturaLojasHandler({ config, fetch: fakeNet(answers).fetcher, now: () => NOW });
    expect((await h(webhookReq(rcEvent(), TOKEN))).status).toBe(200);
    const wrong = await h(webhookReq(rcEvent(), 'Bearer token_errado_0123456789abcdefghijklmnop'));
    expect(wrong.status).toBe(401);
    expect(JSON.parse(wrong.body)).toEqual({ result: 'nao_autenticado' });
    expect((await h(webhookReq(rcEvent(), null))).status).toBe(401);
    expect(base.applied).toHaveLength(1);
  });

  it('aviso sem pessoa da Clarevo (o teste do painel, um anônimo) responde 200 sem consultar nada', async () => {
    const net = fakeNet();
    const h = createAssinaturaLojasHandler({ config, fetch: net.fetcher, now: () => NOW });
    const res = await h(webhookReq(rcEvent({ type: 'TEST', app_user_id: '$RCAnonymousID:abc', original_app_user_id: 'abc', aliases: [] })));
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ received: true, outcome: 'ignorado' });
    expect(net.sent).toEqual([]);
    expect((await h(request({ headers: { Authorization: `Bearer ${TOKEN}` }, body: 'não é json' }))).status).toBe(400);
  });

  it('transferência: a conta que perdeu a compra tem o direito encerrado agora; a que ganhou passa a ter', async () => {
    const base = db({ previous: { [`apple:${storeExternalRef(ANA)}`]: { person_id: ANA, plan: 'familiar' } } });
    const net = fakeNet({
      ...base.answers,
      ...rcAnswer(ANA, {}),
      ...rcAnswer(BIA, { clarevo_familia_mensal: rcSub() }),
    });
    const h = createAssinaturaLojasHandler({ config, fetch: net.fetcher, now: () => NOW });
    const ev = rcEvent({ type: 'TRANSFER', app_user_id: undefined, original_app_user_id: undefined, aliases: undefined, transferred_from: [ANA], transferred_to: [BIA] });
    const res = await h(webhookReq(ev));
    expect(JSON.parse(res.body)).toEqual({ received: true, outcome: ['encerrado', 'aplicado'] });
    expect(base.applied.map((a) => [a.p_person, a.p_provider, a.p_plan, a.p_valid_until])).toEqual([
      [ANA, 'apple', 'familiar', NOW.toISOString()],
      [BIA, 'apple', 'familiar', '2026-12-10T15:00:00.000Z'],
    ]);
  });

  it('as duas lojas da mesma pessoa são aplicadas separadas, e o Google vale pelo produto com o plano básico', async () => {
    const base = db();
    const net = fakeNet({
      ...base.answers,
      ...rcAnswer(ANA, {
        clarevo_individual_mensal: rcSub({ expires_date: '2026-10-01T00:00:00Z' }),
        'clarevo_familia_mensal:mensal': rcSub({ store: 'play_store' }),
      }),
    });
    const h = createAssinaturaLojasHandler({ config, fetch: net.fetcher, now: () => NOW });
    await h(webhookReq(rcEvent({ type: 'RENEWAL' })));
    expect(base.applied.map((a) => [a.p_provider, a.p_plan, a.p_valid_until])).toEqual([
      ['apple', 'individual', '2026-10-01T00:00:00.000Z'],
      ['google', 'familiar', '2026-12-10T15:00:00.000Z'],
    ]);
    expect(base.lookups).toEqual([]);
  });

  it('falha passageira (RevenueCat fora, chave recusada, limite de pedidos, banco fora) responde 500, para o aviso voltar', async () => {
    for (const status of [500, 401, 429]) {
      const base = db();
      const h = createAssinaturaLojasHandler({ config, fetch: fakeNet({ ...base.answers, ...rcAnswer(ANA, {}, status) }).fetcher, now: () => NOW });
      const res = await h(webhookReq(rcEvent()));
      expect(res.status, String(status)).toBe(500);
      expect(base.applied).toEqual([]);
    }
    const down = fakeNet({ ...rcAnswer(ANA, { clarevo_individual_mensal: rcSub() }), 'POST /rest/v1/rpc/billing_apply': () => ({ status: 503, body: {} }) });
    const h = createAssinaturaLojasHandler({ config, fetch: down.fetcher, now: () => NOW });
    expect((await h(webhookReq(rcEvent()))).status).toBe(500);
    const offline: StoreHttpFetch = async () => {
      throw new Error('rede');
    };
    expect((await createAssinaturaLojasHandler({ config, fetch: offline, now: () => NOW })(webhookReq(rcEvent()))).status).toBe(500);
  });

  it('recusa do banco e conta excluída respondem 200 (repetir não resolve), com o resultado no corpo', async () => {
    const refused = db({ status: 400 });
    const h = createAssinaturaLojasHandler({ config, fetch: fakeNet({ ...refused.answers, ...rcAnswer(ANA, { clarevo_individual_mensal: rcSub() }) }).fetcher, now: () => NOW });
    const r1 = await h(webhookReq(rcEvent()));
    expect(r1.status).toBe(200);
    expect(JSON.parse(r1.body).outcome).toEqual(['recusado']);
    const gone = db({ result: 'sem_pessoa' });
    const h2 = createAssinaturaLojasHandler({ config, fetch: fakeNet({ ...gone.answers, ...rcAnswer(ANA, { clarevo_individual_mensal: rcSub() }) }).fetcher, now: () => NOW });
    expect(JSON.parse((await h2(webhookReq(rcEvent()))).body).outcome).toEqual(['sem_pessoa']);
  });

  it('sem os segredos, 503; outro método, 405; a consulta prévia, 204; corpo grande demais, 413', async () => {
    const off = createAssinaturaLojasHandler({ config: null, fetch: fakeNet().fetcher });
    expect((await off(webhookReq(rcEvent()))).status).toBe(503);
    const h = createAssinaturaLojasHandler({ config, fetch: fakeNet().fetcher, now: () => NOW });
    expect((await h(request({ method: 'GET' }))).status).toBe(405);
    expect((await h(request({ method: 'OPTIONS' }))).status).toBe(204);
    const big = request({ headers: { Authorization: `Bearer ${TOKEN}` }, body: 'x'.repeat(200 * 1024) });
    expect((await h(big)).status).toBe(413);
  });
});

describe('Assinatura pelas lojas (D-090): a função, pedido do app', () => {
  it('"sincronizar" confere a sessão e aplica a assinatura da própria pessoa', async () => {
    const base = db();
    const net = fakeNet({ ...base.answers, ...user(), ...rcAnswer(ANA, { clarevo_individual_mensal: rcSub() }) });
    const h = createAssinaturaLojasHandler({ config, fetch: net.fetcher, now: () => NOW });
    const res = await h(appReq({ action: 'sincronizar' }));
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ result: 'sincronizado' });
    expect(net.sent[0]).toMatchObject({ method: 'GET', url: 'https://projeto.supabase.co/auth/v1/user' });
    expect(net.sent[0]?.headers).toMatchObject({ apikey: 'sb_publishable_x', Authorization: `Bearer ${JWT}` });
    expect(base.applied).toHaveLength(1);
    expect(base.applied[0]).toMatchObject({ p_person: ANA, p_provider: 'apple', p_event_at: NOW.toISOString() });
    // O mesmo estado gera o mesmo identificador: sincronizar de novo não grava aviso novo no banco.
    expect(String(base.applied[0]?.p_event_id)).toMatch(/^rc-app:[0-9a-f]{40}$/);
    await h(appReq({ action: 'sincronizar' }));
    expect(base.applied[1]?.p_event_id).toBe(base.applied[0]?.p_event_id);
  });

  it('sem compra nas lojas: "sem_compra"; sem sessão válida: 401; pedido errado: 400; RevenueCat fora: 503', async () => {
    const base = db();
    const h = createAssinaturaLojasHandler({ config, fetch: fakeNet({ ...base.answers, ...user(), ...rcAnswer(ANA, {}) }).fetcher, now: () => NOW });
    expect(JSON.parse((await h(appReq({ action: 'sincronizar' }))).body)).toEqual({ result: 'sem_compra' });
    expect(base.applied).toEqual([]);
    expect((await h(appReq({ action: 'sincronizar' }, null))).status).toBe(401);
    expect((await h(appReq({ action: 'assinar' }))).status).toBe(400);
    const anon = createAssinaturaLojasHandler({ config, fetch: fakeNet({ 'GET /auth/v1/user': () => ({ status: 401, body: {} }) }).fetcher, now: () => NOW });
    expect((await anon(appReq({ action: 'sincronizar' }))).status).toBe(401);
    const down = createAssinaturaLojasHandler({ config, fetch: fakeNet({ ...user(), ...rcAnswer(ANA, {}, 502) }).fetcher, now: () => NOW });
    const r = await down(appReq({ action: 'sincronizar' }));
    expect(r.status).toBe(503);
    expect(JSON.parse(r.body)).toEqual({ result: 'tente_de_novo' });
  });

  it('"esquecer" (antes de excluir a conta) apaga a pessoa no RevenueCat só se ela já teve direito por alguma loja', async () => {
    const deleted: string[] = [];
    const del: Record<string, Answer> = {
      [`DELETE /v1/subscribers/${ANA}`]: () => {
        deleted.push(ANA);
        return { status: 200, body: { app_user_id: ANA, deleted: true } };
      },
    };
    const never = db();
    const h = createAssinaturaLojasHandler({ config, fetch: fakeNet({ ...never.answers, ...user(), ...del }).fetcher, now: () => NOW });
    expect(JSON.parse((await h(appReq({ action: 'esquecer' }))).body)).toEqual({ result: 'sem_compra' });
    expect(deleted).toEqual([]);
    expect(never.lookups).toHaveLength(2);
    const had = db({ previous: { [`google:${storeExternalRef(ANA)}`]: { person_id: ANA, plan: 'individual' } } });
    const net = fakeNet({ ...had.answers, ...user(), ...del });
    const h2 = createAssinaturaLojasHandler({ config, fetch: net.fetcher, now: () => NOW });
    expect(JSON.parse((await h2(appReq({ action: 'esquecer' }))).body)).toEqual({ result: 'esquecido' });
    expect(deleted).toEqual([ANA]);
    expect(net.sent.find((x) => x.method === 'DELETE')?.headers.Authorization).toBe(`Bearer ${RC_KEY}`);
    // Já apagada no RevenueCat: tudo bem. RevenueCat fora: tente de novo (a exclusão da conta segue no app mesmo assim).
    const gone = createAssinaturaLojasHandler({ config, fetch: fakeNet({ ...had.answers, ...user(), [`DELETE /v1/subscribers/${ANA}`]: () => ({ status: 404, body: {} }) }).fetcher, now: () => NOW });
    expect(JSON.parse((await gone(appReq({ action: 'esquecer' }))).body)).toEqual({ result: 'esquecido' });
    const down = createAssinaturaLojasHandler({ config, fetch: fakeNet({ ...had.answers, ...user(), [`DELETE /v1/subscribers/${ANA}`]: () => ({ status: 503, body: {} }) }).fetcher, now: () => NOW });
    expect((await down(appReq({ action: 'esquecer' }))).status).toBe(503);
  });

  it('a resposta lida pelo app: o que não é conhecido vira "tente_de_novo"', () => {
    expect(parseStoreForget({ result: 'esquecido' })).toBe('esquecido');
    expect(parseStoreForget({ result: 'sem_compra' })).toBe('sem_compra');
    expect(parseStoreForget({ result: 'outro' })).toBe('tente_de_novo');
    expect(parseStoreSync({ result: 'sincronizado' })).toBe('sincronizado');
    expect(parseStoreSync({ result: 'sem_compra' })).toBe('sem_compra');
    expect(parseStoreSync({ result: 'indisponivel' })).toBe('indisponivel');
    expect(parseStoreSync({ result: 'nao_autenticado' })).toBe('tente_de_novo');
    expect(parseStoreSync(null)).toBe('tente_de_novo');
  });
});

describe('Assinatura pelas lojas (D-090): a tela', () => {
  it('assinar pela loja aparece no teste, em só leitura e para quem está coberto pela Família; antes do lançamento, só no teste da equipe', () => {
    expect(canSubscribeInStore('teste', false)).toBe(true);
    expect(canSubscribeInStore('leitura', false)).toBe(true);
    expect(canSubscribeInStore('familia', false)).toBe(true);
    expect(canSubscribeInStore('pre_lancamento', false)).toBe(false);
    expect(canSubscribeInStore('pre_lancamento', true)).toBe(true);
    expect(canSubscribeInStore('assinatura', true)).toBe(false);
    expect(canSubscribeInStore('beneficio', true)).toBe(false);
    expect(canSubscribeInStore('cortesia', true)).toBe(false);
  });

  it('gerenciar e mudar de plano só para a assinatura desta loja', () => {
    expect(isStoreSubscription('assinatura', 'apple', 'apple')).toBe(true);
    expect(isStoreSubscription('assinatura', 'google', 'apple')).toBe(false);
    expect(isStoreSubscription('assinatura', 'web', 'google')).toBe(false);
    expect(isStoreSubscription('assinatura', 'apple', null)).toBe(false);
    expect(isStoreSubscription('cortesia', 'equipe', 'apple')).toBe(false);
  });

  it('os textos seguem as regras: sem travessão, sem "fazer sentido", neutros, com preço, renovação e cancelamento antes da compra', () => {
    const T = STORE_SUBSCRIPTION_TEXT;
    const all = [
      ...(Object.values(T).filter((v) => typeof v === 'string') as string[]),
      ...Object.values(T.errors),
      T.subscribe('individual'),
      T.subscribe('familiar'),
      T.howItWorks('apple'),
      T.howItWorks('google'),
      T.manage('apple'),
      T.manage('google'),
      T.manageHint('apple'),
      T.changePlan('familiar'),
      T.deleteNote('google'),
    ];
    for (const t of all) {
      expect(t).not.toMatch(/—|–/);
      expect(t).not.toMatch(/fazer sentido/i);
      expect(t).not.toMatch(/\b(cobrado|obrigado|sozinho|bem-vindo)\b/i);
      expect(t).not.toMatch(/D-\d{3}/);
    }
    expect(T.autoRenew).toMatch(/mensal/);
    expect(T.autoRenew).toMatch(/renova sozinha/);
    expect(T.autoRenew).toMatch(/24 horas antes/);
    expect(T.howItWorks('apple')).toContain('App Store');
    expect(T.howItWorks('google')).toContain('Google Play');
    expect(T.deleteNote('apple')).toMatch(/não cancela a cobrança da loja/);
  });
});

describe('Assinatura pelas lojas (D-090): a função gerada', () => {
  it('está em dia com o núcleo e roda como no Deno', async () => {
    const root = join(__dirname, '../../..');
    execFileSync('node', [join(root, 'scripts/gerar-funcoes.js'), '--conferir']);
    const src = readFileSync(join(root, 'supabase/functions/assinatura-lojas/index.ts'), 'utf8');
    const env: Record<string, string> = { REVENUECAT_API_KEY: RC_KEY, REVENUECAT_WEBHOOK_TOKEN: TOKEN, SUPABASE_URL: 'https://projeto.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_x' };
    let serve: ((req: Request) => Promise<Response>) | undefined;
    const deno = { env: { get: (n: string) => env[n] }, serve: (h: (req: Request) => Promise<Response>) => (serve = h) };
    const base = db();
    const answers: Record<string, Answer> = { ...base.answers, ...rcAnswer(ANA, { clarevo_individual_mensal: rcSub() }) };
    const sent: string[] = [];
    const fakeFetch = async (url: string, init: { method: string; body?: string; signal?: AbortSignal }) => {
      sent.push(`${init.method} ${url}`);
      expect(init.signal).toBeInstanceOf(AbortSignal);
      const key = `${init.method} ${url.replace(/^https:\/\/[^/]+/, '').replace(/\?.*$/, '')}`;
      const r = answers[key]?.(init) ?? { status: 404, body: {} };
      return new Response(JSON.stringify(r.body), { status: r.status });
    };
    new Function('Deno', 'fetch', 'console', src)(deno, fakeFetch, { error: () => {} });
    expect(serve).toBeDefined();
    const post = await serve!(new Request('https://f/assinatura-lojas', { method: 'POST', body: JSON.stringify(rcEvent()), headers: { Authorization: `Bearer ${TOKEN}` } }));
    expect(post.status).toBe(200);
    expect(post.headers.get('Content-Type')).toContain('application/json');
    expect(await post.json()).toEqual({ received: true, outcome: ['aplicado'] });
    expect(sent).toContain(`GET ${REVENUECAT_API_URL}/subscribers/${ANA}`);
    expect(sent).toContain('POST https://projeto.supabase.co/rest/v1/rpc/billing_apply');
    const pre = await serve!(new Request('https://f/assinatura-lojas', { method: 'OPTIONS' }));
    expect(pre.status).toBe(204);
    // A função leva só o servidor: nenhum texto da tela.
    expect(src).not.toContain(STORE_SUBSCRIPTION_TEXT.autoRenew);
  });

  it('nenhuma chave no código: o módulo e a função gerada não trazem chave do RevenueCat, token nem segredo', () => {
    const dir = join(__dirname, '../src/assinatura-lojas');
    const files = [...readdirSync(dir).map((f) => join(dir, f)), join(__dirname, '../../../supabase/functions/assinatura-lojas/index.ts')];
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/\b(sk|appl|goog)_[A-Za-z0-9]{12,}|sb_secret_[A-Za-z0-9]{8,}|eyJ[A-Za-z0-9_-]{20,}\./);
    }
  });
});
