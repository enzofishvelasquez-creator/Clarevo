/// <reference types="node" />
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';
import {
  APP_URL_DEFAULT,
  ASAAS_PRODUCTION_URL,
  ASAAS_SANDBOX_URL,
  PLAN_PRICE_CENTS,
  WEB_GRACE_DAYS,
  WEB_SUBSCRIPTION_TEXT,
  asaasEventFrom,
  asaasPaymentFrom,
  asaasSubscriptionFrom,
  assinaturaWebConfigFrom,
  checkoutLink,
  checkoutPixRequest,
  checkoutRequest,
  corsHeaders,
  createAssinaturaWebHandler,
  parseAsaasDate,
  parsePixReference,
  parseWebPaymentReturn,
  parseWebReference,
  parseWebSubscriptionCancel,
  parseWebSubscriptionStart,
  periodEnd,
  pixCanPayNext,
  pixNextPaymentFrom,
  pixPaidOn,
  pixReference,
  sha256Hex,
  webReference,
  webValidity,
  type AsaasPayment,
  type AsaasSubscription,
  type AssinaturaWebConfig,
  type HttpFetch,
} from '../src';

/** Dados FICTÍCIOS: chaves, pessoa e identificadores inventados. */
const API_KEY = '$aact_hmlg_000000000000000000000000000000000000000000000000000000chave_de_teste';
const TOKEN = 'token_dos_avisos_de_teste_0123456789abcdef';
const JWT = 'eyJ.sessao.de.teste';
const ANA = '0d2f4a6c-1b3e-4c5d-8e9f-0a1b2c3d4e5f';
const SUB = 'sub_teste0001';
const CHECKOUT = 'c7b1c696-b27b-4d3d-80b9-d1c018e387f8';
// 06/11/2026, 12h em Brasília.
const NOW = new Date('2026-11-06T15:00:00.000Z');

const config: AssinaturaWebConfig = {
  apiKey: API_KEY,
  apiBase: ASAAS_SANDBOX_URL,
  sandbox: true,
  webhookToken: TOKEN,
  supabaseUrl: 'https://projeto.supabase.co',
  serviceKey: 'sb_secret_x',
  userApiKey: 'sb_publishable_x',
  appUrl: APP_URL_DEFAULT,
};

const sub = (extra: Partial<AsaasSubscription> = {}): AsaasSubscription => ({
  id: SUB,
  status: 'ACTIVE',
  deleted: false,
  cycle: 'MONTHLY',
  value: 29.9,
  nextDueDate: '2026-12-06',
  externalReference: webReference(ANA, 'individual'),
  checkoutSession: CHECKOUT,
  ...extra,
});
const pay = (dueDate: string, status = 'CONFIRMED', extra: Partial<AsaasPayment> = {}): AsaasPayment => ({
  id: `pay_${dueDate}`,
  status,
  deleted: false,
  dueDate,
  subscription: SUB,
  externalReference: null,
  checkoutSession: null,
  paidOn: null,
  ...extra,
});

/** A rede falsa: o Asaas e o banco, com o que cada endereço responde, e o registro do que foi mandado. */
function fakeNet(answers: Partial<Record<string, (init: { method: string; body?: string }) => { status: number; body: unknown }>> = {}) {
  const sent: { method: string; url: string; headers: Record<string, string>; body: unknown; timeoutMs: number }[] = [];
  const fetcher: HttpFetch = async (url, init) => {
    sent.push({ method: init.method, url, headers: init.headers, body: init.body === undefined ? undefined : JSON.parse(init.body), timeoutMs: init.timeoutMs });
    const key = `${init.method} ${url.replace(/^https:\/\/[^/]+/, '').replace(/\?.*$/, '')}`;
    const match = Object.entries(answers).find(([k]) => k === key) ?? Object.entries(answers).find(([k]) => k.endsWith('*') && key.startsWith(k.slice(0, -1)));
    const r = match?.[1]?.(init) ?? { status: 404, body: { errors: [{ code: 'not_found' }] } };
    return { status: r.status, text: async () => (typeof r.body === 'string' ? r.body : JSON.stringify(r.body)) };
  };
  return { sent, fetcher };
}

function request(opts: { method?: string; headers?: Record<string, string>; body?: string }) {
  let read = false;
  const headers = Object.fromEntries(Object.entries(opts.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    req: {
      method: opts.method ?? 'POST',
      header: (name: string) => headers[name.toLowerCase()] ?? null,
      body: async () => {
        read = true;
        return opts.body ?? '';
      },
    },
    wasRead: () => read,
  };
}
const webhookReq = (payload: unknown, token: string | null = TOKEN) =>
  request({ headers: token === null ? {} : { 'asaas-access-token': token }, body: JSON.stringify(payload) });
const appReq = (body: unknown, jwt: string | null = JWT, origin = APP_URL_DEFAULT) =>
  request({ headers: { ...(jwt === null ? {} : { Authorization: `Bearer ${jwt}` }), Origin: origin }, body: JSON.stringify(body) });

const event = (name: string, extra: Record<string, unknown> = {}, id = 'evt_1') => ({
  id,
  event: name,
  dateCreated: '2026-11-06 11:59:00',
  ...extra,
});

/** O banco e o Asaas de sempre: a assinatura da Ana, uma cobrança confirmada, a pessoa achada e o aviso aplicado. */
function happyAnswers(subscription: Record<string, unknown> = sub() as unknown as Record<string, unknown>, payments: AsaasPayment[] = [pay('2026-11-06')]) {
  const applied: unknown[] = [];
  const answers = {
    [`GET /v3/subscriptions/${SUB}`]: () => ({ status: 200, body: subscription }),
    'GET /v3/payments': () => ({ status: 200, body: { object: 'list', data: payments } }),
    'POST /rest/v1/rpc/billing_apply': (init: { body?: string }) => {
      applied.push(JSON.parse(init.body ?? '{}'));
      return { status: 200, body: { result: 'aplicado', access: { status: 'assinatura' } } };
    },
  };
  return { answers, applied };
}

describe('Assinatura na web (D-084): configuração e referência', () => {
  it('a chave do Asaas define o ambiente; sem token válido, sem banco ou com o token igual à chave, nada funciona', () => {
    const env = (extra: Record<string, string | undefined>) => (name: string) =>
      ({ ASAAS_API_KEY: API_KEY, ASAAS_WEBHOOK_TOKEN: TOKEN, SUPABASE_URL: 'https://projeto.supabase.co/', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_x', ...extra })[name];
    const c = assinaturaWebConfigFrom(env({}));
    expect(c).toMatchObject({ sandbox: true, apiBase: ASAAS_SANDBOX_URL, supabaseUrl: 'https://projeto.supabase.co', appUrl: 'https://app.clarevo.app.br' });
    expect(assinaturaWebConfigFrom(env({ ASAAS_API_KEY: '$aact_prod_abc' }))).toMatchObject({ sandbox: false, apiBase: ASAAS_PRODUCTION_URL });
    expect(assinaturaWebConfigFrom(env({ ASAAS_API_KEY: 'outra_chave_qualquer' }))).toBeNull();
    expect(assinaturaWebConfigFrom(env({ ASAAS_API_KEY: '' }))).toBeNull();
    expect(assinaturaWebConfigFrom(env({ ASAAS_WEBHOOK_TOKEN: 'curto' }))).toBeNull();
    expect(assinaturaWebConfigFrom(env({ ASAAS_WEBHOOK_TOKEN: 'com espaço e tamanho suficiente para passar 12345' }))).toBeNull();
    expect(assinaturaWebConfigFrom(env({ ASAAS_WEBHOOK_TOKEN: API_KEY, ASAAS_API_KEY: API_KEY }))).toBeNull();
    expect(assinaturaWebConfigFrom(env({ SUPABASE_URL: '' }))).toBeNull();
    expect(assinaturaWebConfigFrom(env({ SUPABASE_SERVICE_ROLE_KEY: '' }))).toBeNull();
    expect(assinaturaWebConfigFrom(env({ SUPABASE_SERVICE_ROLE_KEY: '', SUPABASE_SECRET_KEYS: '{"default":"sb_secret_nova"}' }))?.serviceKey).toBe('sb_secret_nova');
    expect(assinaturaWebConfigFrom(env({ CLAREVO_APP_URL: 'http://localhost:8081/' }))?.appUrl).toBe('http://localhost:8081');
    expect(assinaturaWebConfigFrom(env({ CLAREVO_APP_URL: 'javascript:alert(1)' }))).toBeNull();
    // As chamadas feitas como a pessoa usam a chave pública do projeto (que o Supabase fornece à função); sem ela, a de serviço.
    expect(assinaturaWebConfigFrom(env({}))?.userApiKey).toBe('sb_secret_x');
    expect(assinaturaWebConfigFrom(env({ SUPABASE_ANON_KEY: 'sb_publishable_antiga' }))?.userApiKey).toBe('sb_publishable_antiga');
    expect(assinaturaWebConfigFrom(env({ SUPABASE_ANON_KEY: 'x', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_nova' }))?.userApiKey).toBe('sb_publishable_nova');
  });

  it('a referência leva a pessoa e o plano, nunca nome ou e-mail, e só a nossa é lida', () => {
    expect(webReference(ANA.toUpperCase(), 'familiar')).toBe(`clarevo:${ANA}:familiar`);
    expect(parseWebReference(`clarevo:${ANA}:individual`)).toEqual({ personId: ANA, plan: 'individual' });
    expect(parseWebReference(` clarevo:${ANA.toUpperCase()}:familiar `)).toEqual({ personId: ANA, plan: 'familiar' });
    for (const bad of [null, '', 'pedido-123', `clarevo:${ANA}`, `clarevo:${ANA}:mensal`, 'clarevo:nao-e-uuid:individual', `outra:${ANA}:individual`]) {
      expect(parseWebReference(bad), String(bad)).toBeNull();
    }
  });

  it('as datas do Asaas são de Brasília; ISO também vale', () => {
    expect(parseAsaasDate('2026-11-06 11:59:00')?.toISOString()).toBe('2026-11-06T14:59:00.000Z');
    expect(parseAsaasDate('2026-11-06T11:59:00-03:00')?.toISOString()).toBe('2026-11-06T14:59:00.000Z');
    expect(parseAsaasDate('2026-11-06T14:59:00.000Z')?.toISOString()).toBe('2026-11-06T14:59:00.000Z');
    expect(parseAsaasDate('2026-11-06T14:59:00+0000')?.toISOString()).toBe('2026-11-06T14:59:00.000Z');
    expect(parseAsaasDate('ontem')).toBeNull();
    expect(parseAsaasDate(null)).toBeNull();
  });
});

describe('Assinatura na web: até quando vale', () => {
  it('o período de uma cobrança vai do vencimento até o próximo, pelo ciclo (mensal na Clarevo, com o dia limitado ao fim do mês)', () => {
    expect(periodEnd('2026-11-06', 'MONTHLY')).toBe('2026-12-06');
    expect(periodEnd('2026-01-31', 'MONTHLY')).toBe('2026-02-28');
    expect(periodEnd('2026-11-06', 'YEARLY')).toBe('2027-11-06');
    expect(periodEnd('2026-11-06', 'WEEKLY')).toBe('2026-11-13');
    expect(periodEnd('2026-11-06', 'QUALQUER')).toBe('2026-12-06');
  });

  it('cobrança paga: até o fim do período, mais 3 dias de tolerância com a assinatura ativa; cancelada, só até o fim do período pago', () => {
    const paid = webValidity(sub(), [pay('2026-11-06')], NOW);
    expect(paid.paidThrough).toBe('2026-12-06');
    // 09/12/2026, 23:59:59 em Brasília (06/12 + 3 dias).
    expect(paid.validUntil.toISOString()).toBe('2026-12-10T02:59:59.999Z');
    expect(WEB_GRACE_DAYS).toBe(3);
    const cancelled = webValidity(sub({ deleted: true }), [pay('2026-11-06')], NOW);
    expect(cancelled.validUntil.toISOString()).toBe('2026-12-07T02:59:59.999Z');
    const inactive = webValidity(sub({ status: 'INACTIVE' }), [pay('2026-11-06')], NOW);
    expect(inactive.validUntil.toISOString()).toBe('2026-12-07T02:59:59.999Z');
  });

  it('vale a última cobrança paga; pendente, vencida, estornada, contestada ou removida não conta; sem nenhuma paga, não vale nada', () => {
    const renewed = webValidity(sub(), [pay('2026-11-06', 'RECEIVED'), pay('2026-12-06', 'CONFIRMED'), pay('2027-01-06', 'PENDING')], NOW);
    expect(renewed.paidThrough).toBe('2027-01-06');
    const overdue = webValidity(sub(), [pay('2026-11-06', 'RECEIVED'), pay('2026-12-06', 'OVERDUE')], NOW);
    expect(overdue.paidThrough).toBe('2026-12-06');
    for (const status of ['REFUNDED', 'REFUND_REQUESTED', 'REFUND_IN_PROGRESS', 'CHARGEBACK_REQUESTED', 'CHARGEBACK_DISPUTE', 'AWAITING_RISK_ANALYSIS']) {
      expect(webValidity(sub(), [pay('2026-11-06', status)], NOW).paidThrough, status).toBeNull();
    }
    expect(webValidity(sub(), [pay('2026-11-06', 'CONFIRMED', { deleted: true })], NOW).paidThrough).toBeNull();
    expect(webValidity(sub(), [pay('2026-11-06', 'AWAITING_CHARGEBACK_REVERSAL')], NOW).paidThrough).toBe('2026-12-06');
    const none = webValidity(sub(), [], NOW);
    expect(none.paidThrough).toBeNull();
    expect(none.validUntil).toBe(NOW);
    // Estorno da renovação: volta a valer só o período anterior (e a tolerância, com a assinatura ativa).
    expect(webValidity(sub(), [pay('2026-11-06', 'RECEIVED'), pay('2026-12-06', 'REFUNDED')], NOW).paidThrough).toBe('2026-12-06');
  });

  it('lê os objetos do Asaas sem depender de campos que não existem e aceita campos novos', () => {
    expect(asaasSubscriptionFrom({ id: SUB, status: 'ACTIVE', novoCampo: 1 })).toMatchObject({ id: SUB, cycle: 'MONTHLY', deleted: false, externalReference: null, checkoutSession: null });
    expect(asaasSubscriptionFrom({ status: 'ACTIVE' })).toBeNull();
    expect(asaasPaymentFrom({ id: 'pay_1', status: 'CONFIRMED', dueDate: '2026-11-06T00:00:00', subscription: SUB })).toMatchObject({ dueDate: '2026-11-06' });
    expect(asaasPaymentFrom({ id: 'pay_1', dueDate: 'hoje' })).toMatchObject({ status: 'PENDING', dueDate: null });
    const ev = asaasEventFrom(event('PAYMENT_CONFIRMED', { payment: { id: 'pay_1', status: 'CONFIRMED', subscription: SUB } }), NOW);
    expect(ev).toMatchObject({ id: 'evt_1', event: 'PAYMENT_CONFIRMED', subscriptionId: SUB, subscription: null });
    expect(ev?.at.toISOString()).toBe('2026-11-06T14:59:00.000Z');
    expect(asaasEventFrom(event('SUBSCRIPTION_CREATED', { subscription: sub(), dateCreated: 'ontem' }), NOW)?.at).toBe(NOW);
    expect(asaasEventFrom(event('CHECKOUT_PAID', { checkout: { id: CHECKOUT } }), NOW)?.subscriptionId).toBeNull();
    expect(asaasEventFrom({ event: 'PAYMENT_CONFIRMED' }, NOW)).toBeNull();
    expect(asaasEventFrom(event('X', {}, 'e'.repeat(201)), NOW)).toBeNull();
  });
});

describe('Assinatura na web: o pedido ao Asaas', () => {
  it('Checkout recorrente: cartão, mensal, primeira cobrança hoje, preço do plano em reais, referência da pessoa e volta para a tela', () => {
    const body = checkoutRequest(ANA, 'familiar', APP_URL_DEFAULT, '2026-11-06');
    expect(body).toEqual({
      billingTypes: ['CREDIT_CARD'],
      chargeTypes: ['RECURRENT'],
      minutesToExpire: 60,
      externalReference: `clarevo:${ANA}:familiar`,
      callback: {
        successUrl: 'https://app.clarevo.app.br/conta/assinatura?pagamento=sucesso',
        cancelUrl: 'https://app.clarevo.app.br/conta/assinatura?pagamento=cancelado',
        expiredUrl: 'https://app.clarevo.app.br/conta/assinatura?pagamento=expirado',
      },
      items: [{ name: 'Clarevo, plano Família', description: 'Assinatura mensal', quantity: 1, value: 69.9 }],
      subscription: { cycle: 'MONTHLY', nextDueDate: '2026-11-06' },
    });
    expect(checkoutRequest(ANA, 'individual', APP_URL_DEFAULT, '2026-11-06').items).toEqual([
      { name: 'Clarevo, plano Individual', description: 'Assinatura mensal', quantity: 1, value: PLAN_PRICE_CENTS.individual / 100 },
    ]);
    // Nada da pessoa além do identificador: nem nome, nem e-mail, nem CPF (a página do Asaas pede o que precisa).
    expect(JSON.stringify(body)).not.toMatch(/customer|email|cpf/i);
  });

  it('o link é o que o Asaas devolve (só do domínio do Asaas) ou o endereço padrão com o identificador', () => {
    expect(checkoutLink({ id: CHECKOUT, link: `https://sandbox.asaas.com/checkoutSession/show?id=${CHECKOUT}` }, true)).toBe(`https://sandbox.asaas.com/checkoutSession/show?id=${CHECKOUT}`);
    expect(checkoutLink({ id: CHECKOUT, link: null }, false)).toBe(`https://asaas.com/checkoutSession/show?id=${CHECKOUT}`);
    expect(checkoutLink({ id: CHECKOUT, link: 'https://exemplo.test/x' }, true)).toBe(`https://sandbox.asaas.com/checkoutSession/show?id=${CHECKOUT}`);
    expect(checkoutLink({ errors: [] }, true)).toBeNull();
  });
});

describe('Assinatura na web: a função do servidor, avisos do Asaas', () => {
  it('sem os segredos, não faz nada; só POST; o token é conferido antes de ler o corpo; corpo grande ou inválido é recusado', async () => {
    const logs: string[] = [];
    const off = createAssinaturaWebHandler({ config: null, fetch: fakeNet().fetcher, log: (m) => logs.push(m) });
    expect((await off(webhookReq(event('PAYMENT_CONFIRMED')).req)).status).toBe(503);
    expect(logs).toHaveLength(1);
    const net = fakeNet();
    const h = createAssinaturaWebHandler({ config, fetch: net.fetcher, now: () => NOW });
    expect((await h(request({ method: 'GET', headers: { 'asaas-access-token': TOKEN } }).req)).status).toBe(405);
    for (const token of ['', 'errado', `${TOKEN}x`, TOKEN.slice(0, -1)]) {
      const r = webhookReq(event('PAYMENT_CONFIRMED'), token);
      expect((await h(r.req)).status, token).toBe(401);
      expect(r.wasRead()).toBe(false);
    }
    expect((await h(request({ headers: { 'asaas-access-token': TOKEN, 'content-length': '300000' }, body: '{}' }).req)).status).toBe(413);
    expect((await h(request({ headers: { 'asaas-access-token': TOKEN }, body: 'x'.repeat(300_000) }).req)).status).toBe(413);
    expect((await h(request({ headers: { 'asaas-access-token': TOKEN }, body: 'não é json' }).req)).status).toBe(400);
    expect(net.sent).toEqual([]);
  });

  it('cobrança confirmada: lê a assinatura e as cobranças no Asaas e aplica no banco com a pessoa da referência, o resumo da assinatura e até quando vale', async () => {
    const { answers, applied } = happyAnswers();
    const net = fakeNet(answers);
    const h = createAssinaturaWebHandler({ config, fetch: net.fetcher, now: () => NOW });
    const res = await h(webhookReq(event('PAYMENT_CONFIRMED', { payment: { id: 'pay_1', status: 'CONFIRMED', subscription: SUB } })).req);
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ received: true, outcome: 'aplicado' });
    expect(net.sent.map((s) => `${s.method} ${s.url}`)).toEqual([
      `GET ${ASAAS_SANDBOX_URL}/subscriptions/${SUB}`,
      // Só as cobranças com vencimento nos últimos 4 meses (a última paga e as seguintes), sem depender da página de 100 do Asaas.
      `GET ${ASAAS_SANDBOX_URL}/payments?subscription=${SUB}&dueDate%5Bge%5D=2026-07-06&limit=100`,
      'POST https://projeto.supabase.co/rest/v1/rpc/billing_apply',
    ]);
    // A chave do Asaas vai só ao Asaas, no cabeçalho access_token, com o User-Agent que o Asaas exige; a de serviço, só ao banco.
    expect(net.sent[0]?.headers).toMatchObject({ access_token: API_KEY, 'User-Agent': 'Clarevo' });
    expect(net.sent[2]?.headers).toEqual({ apikey: 'sb_secret_x', 'Content-Type': 'application/json' });
    // Cada chamada tem prazo, dentro do orçamento do pedido (o Asaas desiste em 10 segundos).
    expect(net.sent.every((s) => s.timeoutMs > 0 && s.timeoutMs <= 3000)).toBe(true);
    expect(JSON.stringify(net.sent[2]?.headers)).not.toContain(API_KEY);
    expect(applied).toEqual([
      {
        p_event_id: 'evt_1',
        p_provider: 'web',
        p_person: ANA,
        p_external_ref: sha256Hex(SUB),
        p_plan: 'individual',
        p_valid_until: '2026-12-10T02:59:59.999Z',
        p_event_at: '2026-11-06T14:59:00.000Z',
      },
    ]);
  });

  it('assinatura sem referência: acha a pessoa pelo Checkout no banco (só o resumo) e grava a referência na assinatura do Asaas', async () => {
    const { answers, applied } = happyAnswers(sub({ externalReference: null, value: 69.9 }) as unknown as Record<string, unknown>);
    const looked: unknown[] = [];
    const net = fakeNet({
      ...answers,
      'POST /rest/v1/rpc/billing_checkout_person': (init) => {
        looked.push(JSON.parse(init.body ?? '{}'));
        return { status: 200, body: { person_id: ANA, plan: 'familiar' } };
      },
      [`PUT /v3/subscriptions/${SUB}`]: () => ({ status: 200, body: sub() }),
    });
    const h = createAssinaturaWebHandler({ config, fetch: net.fetcher, now: () => NOW });
    const res = await h(webhookReq(event('SUBSCRIPTION_CREATED', { subscription: sub({ externalReference: null }) })).req);
    expect(JSON.parse(res.body)).toEqual({ received: true, outcome: 'aplicado' });
    expect(looked).toEqual([{ p_checkout_hash: sha256Hex(CHECKOUT) }]);
    const put = net.sent.find((s) => s.method === 'PUT');
    expect(put?.body).toEqual({ externalReference: `clarevo:${ANA}:familiar` });
    expect(applied[0]).toMatchObject({ p_person: ANA, p_plan: 'familiar' });
    // Sem Checkout conhecido nem assinatura já aplicada: nada a aplicar, e 200 para a fila do Asaas não parar.
    const nobody = { 'POST /rest/v1/rpc/billing_checkout_person': () => ({ status: 200, body: null }), 'POST /rest/v1/rpc/billing_person_by_external_ref': () => ({ status: 200, body: null }) };
    const unknown = fakeNet({ ...answers, ...nobody });
    const h2 = createAssinaturaWebHandler({ config, fetch: unknown.fetcher, now: () => NOW });
    const r2 = await h2(webhookReq(event('SUBSCRIPTION_CREATED', { subscription: sub({ externalReference: null }) })).req);
    expect(r2.status).toBe(200);
    expect(JSON.parse(r2.body)).toEqual({ received: true, outcome: 'sem_referencia' });
    expect(unknown.sent.some((s) => s.url.endsWith('/rpc/billing_apply'))).toBe(false);
    expect(unknown.sent.find((s) => s.url.endsWith('/rpc/billing_person_by_external_ref'))?.body).toEqual({ p_provider: 'web', p_external_ref: sha256Hex(SUB) });
    // O PUT da referência recusado (4xx) só fica no registro: o aviso é aplicado do mesmo jeito.
    const logs: string[] = [];
    const putRefused = fakeNet({
      ...answers,
      'POST /rest/v1/rpc/billing_checkout_person': () => ({ status: 200, body: { person_id: ANA, plan: 'individual' } }),
      [`PUT /v3/subscriptions/${SUB}`]: () => ({ status: 400, body: { errors: [{ code: 'invalid' }] } }),
    });
    const h3 = createAssinaturaWebHandler({ config, fetch: putRefused.fetcher, now: () => NOW, log: (m) => logs.push(m) });
    const r3 = await h3(webhookReq(event('SUBSCRIPTION_CREATED', { subscription: sub({ externalReference: null }) })).req);
    expect(JSON.parse(r3.body)).toEqual({ received: true, outcome: 'aplicado' });
    expect(logs).toEqual(['não gravou a referência na assinatura (400)']);
  });

  it('aviso de Checkout criado ou expirado, de transferência ou de evento desconhecido: 200 sem tocar no Asaas nem no banco', async () => {
    const net = fakeNet();
    const h = createAssinaturaWebHandler({ config, fetch: net.fetcher, now: () => NOW });
    for (const payload of [
      event('CHECKOUT_CREATED', { checkout: { id: CHECKOUT, status: 'ACTIVE' } }),
      event('CHECKOUT_EXPIRED', { checkout: { id: CHECKOUT, status: 'EXPIRED' } }),
      event('TRANSFER_DONE', { transfer: { id: 'tra_1' } }),
      { id: 'evt_estranho' },
    ]) {
      const res = await h(webhookReq(payload).req);
      expect(res.status).toBe(200);
      expect(JSON.parse(res.body)).toEqual({ received: true, outcome: 'ignorado' });
    }
    expect(net.sent).toEqual([]);
  });

  it('assinatura removida (cancelamento): o Asaas pode não devolvê-la; vale a do aviso, as cobranças pagas continuam e a tolerância acaba', async () => {
    const { answers, applied } = happyAnswers();
    delete (answers as Record<string, unknown>)[`GET /v3/subscriptions/${SUB}`];
    const net = fakeNet(answers);
    const h = createAssinaturaWebHandler({ config, fetch: net.fetcher, now: () => NOW });
    const res = await h(webhookReq(event('SUBSCRIPTION_DELETED', { subscription: sub({ deleted: true }) })).req);
    expect(JSON.parse(res.body)).toEqual({ received: true, outcome: 'aplicado' });
    expect(applied[0]).toMatchObject({ p_valid_until: '2026-12-07T02:59:59.999Z' });
    // Estorno depois do cancelamento: o aviso de cobrança não traz a assinatura e o Asaas responde 404; a pessoa é achada pelo resumo da
    // assinatura já aplicada (billing_person_by_external_ref) e, sem cobrança paga, o acesso acaba agora.
    const refund = happyAnswers(undefined, [pay('2026-11-06', 'REFUNDED')]);
    delete (refund.answers as Record<string, unknown>)[`GET /v3/subscriptions/${SUB}`];
    const net2 = fakeNet({
      ...refund.answers,
      'POST /rest/v1/rpc/billing_checkout_person': () => ({ status: 200, body: null }),
      'POST /rest/v1/rpc/billing_person_by_external_ref': () => ({ status: 200, body: { person_id: ANA, plan: 'individual' } }),
    });
    const h2 = createAssinaturaWebHandler({ config, fetch: net2.fetcher, now: () => NOW });
    const r2 = await h2(webhookReq(event('PAYMENT_REFUNDED', { payment: { id: 'pay_1', status: 'REFUNDED', subscription: SUB } })).req);
    expect(JSON.parse(r2.body)).toEqual({ received: true, outcome: 'aplicado' });
    expect(refund.applied[0]).toMatchObject({ p_person: ANA, p_external_ref: sha256Hex(SUB), p_valid_until: NOW.toISOString() });
    // Assinatura removida não recebe PUT.
    expect(net2.sent.some((s) => s.method === 'PUT')).toBe(false);
  });

  it('orçamento de tempo: esgotado, responde 500 sem começar outra chamada (o Asaas entrega de novo), e nada da pessoa vai ao registro', async () => {
    const { answers } = happyAnswers();
    let t = NOW.getTime();
    const slow = fakeNet(answers);
    const fetcher: HttpFetch = async (url, init) => {
      t += 5000; // cada chamada leva 5 segundos: a segunda ainda cabe no orçamento de 8,5; a terceira não começa
      return slow.fetcher(url, init);
    };
    const logs: string[] = [];
    const h = createAssinaturaWebHandler({ config, fetch: fetcher, now: () => new Date(t), log: (m) => logs.push(m) });
    const res = await h(webhookReq(event('PAYMENT_CONFIRMED', { payment: { id: 'pay_1', status: 'CONFIRMED', subscription: SUB } })).req);
    expect(res.status).toBe(500);
    expect(slow.sent).toHaveLength(2);
    expect(logs.join(' ')).toContain('sem tempo');
    // Falha de rede ao listar assinaturas: o registro leva o caminho sem a consulta (que traz a referência da pessoa).
    const broken: HttpFetch = async (url, init) => {
      if (url.includes('/subscriptions?')) throw new Error(`fetch failed ${url}`);
      return slow.fetcher(url, init);
    };
    const logs2: string[] = [];
    const h2 = createAssinaturaWebHandler({
      config,
      fetch: broken,
      now: () => NOW,
      log: (m) => logs2.push(m),
    });
    const user = fakeNet({ 'GET /auth/v1/user': () => ({ status: 200, body: { id: ANA } }) });
    const h3 = createAssinaturaWebHandler({
      config,
      fetch: async (url, init) => (url.includes('/subscriptions?') ? broken(url, init) : user.fetcher(url, init)),
      now: () => NOW,
      log: (m) => logs2.push(m),
    });
    expect((await h3(appReq({ action: 'cancelar' }).req)).status).toBe(503);
    expect(logs2.join(' ')).not.toContain(ANA);
    expect(logs2.join(' ')).toContain('Asaas indisponível em GET /subscriptions');
    void h2;
  });

  it('conta excluída (sem_pessoa): remove a assinatura no Asaas para não cobrar mais; recusa do banco não se repete; falha passageira pede de novo', async () => {
    const base = happyAnswers().answers;
    const gone = fakeNet({
      ...base,
      'POST /rest/v1/rpc/billing_apply': () => ({ status: 200, body: { result: 'sem_pessoa' } }),
      [`DELETE /v3/subscriptions/${SUB}`]: () => ({ status: 200, body: { deleted: true, id: SUB } }),
    });
    const h = createAssinaturaWebHandler({ config, fetch: gone.fetcher, now: () => NOW });
    const res = await h(webhookReq(event('PAYMENT_CONFIRMED', { payment: { id: 'pay_1', status: 'CONFIRMED', subscription: SUB } })).req);
    expect(JSON.parse(res.body)).toEqual({ received: true, outcome: 'cancelada_sem_pessoa' });
    expect(gone.sent.some((s) => s.method === 'DELETE' && s.url.endsWith(`/subscriptions/${SUB}`))).toBe(true);

    const refused = fakeNet({ ...base, 'POST /rest/v1/rpc/billing_apply': () => ({ status: 400, body: { message: 'assinatura_de_outra_pessoa' } }) });
    const logs: string[] = [];
    const h2 = createAssinaturaWebHandler({ config, fetch: refused.fetcher, now: () => NOW, log: (m) => logs.push(m) });
    const r2 = await h2(webhookReq(event('PAYMENT_CONFIRMED', { payment: { id: 'pay_1', status: 'CONFIRMED', subscription: SUB } })).req);
    expect(r2.status).toBe(200);
    expect(JSON.parse(r2.body)).toEqual({ received: true, outcome: 'recusado' });
    expect(logs).toHaveLength(1);

    for (const broken of [
      { ...base, 'POST /rest/v1/rpc/billing_apply': () => ({ status: 503, body: 'indisponível' }) },
      { ...base, 'GET /v3/payments': () => ({ status: 500, body: '' }) },
      { ...base, [`GET /v3/subscriptions/${SUB}`]: () => ({ status: 502, body: '' }) },
    ]) {
      const net = fakeNet(broken);
      const h3 = createAssinaturaWebHandler({ config, fetch: net.fetcher, now: () => NOW });
      const r3 = await h3(webhookReq(event('PAYMENT_CONFIRMED', { payment: { id: 'pay_1', status: 'CONFIRMED', subscription: SUB } })).req);
      expect(r3.status).toBe(500);
    }
    const dead = createAssinaturaWebHandler({
      config,
      fetch: async () => {
        throw new Error('rede');
      },
      now: () => NOW,
    });
    expect((await dead(webhookReq(event('PAYMENT_CONFIRMED', { payment: { id: 'pay_1', status: 'CONFIRMED', subscription: SUB } })).req)).status).toBe(500);
  });
});

describe('Assinatura na web: a função do servidor, pedidos do app', () => {
  const user = { 'GET /auth/v1/user': () => ({ status: 200, body: { id: ANA, email: 'ana@exemplo.test' } }) };
  const access = (status: string) => ({ 'POST /rest/v1/rpc/my_access': () => ({ status: 200, body: { status, plan: null, until: null, can_write: true } }) });
  const noSubs = { 'GET /v3/subscriptions': () => ({ status: 200, body: { object: 'list', data: [] } }) };

  it('CORS só para a origem do app (e localhost): a consulta prévia responde 204; outra origem não recebe os cabeçalhos', async () => {
    const h = createAssinaturaWebHandler({ config, fetch: fakeNet().fetcher });
    const pre = await h(request({ method: 'OPTIONS', headers: { Origin: APP_URL_DEFAULT } }).req);
    expect(pre.status).toBe(204);
    expect(pre.headers['Access-Control-Allow-Origin']).toBe(APP_URL_DEFAULT);
    expect(pre.headers['Access-Control-Allow-Headers']).toContain('authorization');
    expect(corsHeaders('http://localhost:8081', APP_URL_DEFAULT)['Access-Control-Allow-Origin']).toBe('http://localhost:8081');
    expect(corsHeaders('https://outro.exemplo.test', APP_URL_DEFAULT)).toEqual({});
    expect(corsHeaders(null, APP_URL_DEFAULT)).toEqual({});
    const other = await h(request({ method: 'OPTIONS', headers: { Origin: 'https://outro.exemplo.test' } }).req);
    expect(other.headers['Access-Control-Allow-Origin']).toBeUndefined();
  });

  it('sem sessão, 401; token que o Supabase não reconhece, 401; pedido fora do formato, 400', async () => {
    const net = fakeNet({ 'GET /auth/v1/user': () => ({ status: 401, body: { message: 'invalid' } }) });
    const h = createAssinaturaWebHandler({ config, fetch: net.fetcher });
    expect((await h(appReq({ action: 'assinar', plan: 'individual' }, null).req)).status).toBe(401);
    expect((await h(appReq({ action: 'assinar', plan: 'individual' }).req)).status).toBe(401);
    expect(net.sent.map((s) => s.url)).toEqual(['https://projeto.supabase.co/auth/v1/user']);
    expect(net.sent[0]?.headers).toEqual({ apikey: 'sb_publishable_x', Authorization: `Bearer ${JWT}` });
    const h2 = createAssinaturaWebHandler({ config, fetch: fakeNet(user).fetcher });
    for (const body of [{ action: 'assinar' }, { action: 'assinar', plan: 'mensal' }, { action: 'outra' }, 'texto', null]) {
      const res = await h2(appReq(body).req);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.headers['Access-Control-Allow-Origin']).toBe(APP_URL_DEFAULT);
    }
    expect((await h2(request({ headers: { Authorization: `Bearer ${JWT}`, 'content-length': '9000' }, body: '{}' }).req)).status).toBe(413);
  });

  it('assinar: confere a pessoa e o acesso, cria o Checkout com a primeira cobrança hoje (Brasília), liga o Checkout à pessoa no banco e devolve o link', async () => {
    const recorded: unknown[] = [];
    const net = fakeNet({
      ...user,
      ...access('teste'),
      ...noSubs,
      'POST /v3/checkouts': () => ({ status: 200, body: { id: CHECKOUT, link: `https://sandbox.asaas.com/checkoutSession/show?id=${CHECKOUT}`, status: 'ACTIVE' } }),
      'POST /rest/v1/rpc/billing_checkout_record': (init) => {
        recorded.push(JSON.parse(init.body ?? '{}'));
        return { status: 200, body: { result: 'gravado' } };
      },
    });
    // 06/11/2026, 23h30 em Brasília: já é 07/11 em UTC, e o vencimento é o dia de Brasília.
    const h = createAssinaturaWebHandler({ config, fetch: net.fetcher, now: () => new Date('2026-11-07T02:30:00.000Z') });
    const res = await h(appReq({ action: 'assinar', plan: 'familiar' }).req);
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ result: 'checkout', url: `https://sandbox.asaas.com/checkoutSession/show?id=${CHECKOUT}` });
    expect(res.headers['Access-Control-Allow-Origin']).toBe(APP_URL_DEFAULT);
    const urls = net.sent.map((s) => `${s.method} ${s.url}`);
    expect(urls).toEqual([
      'GET https://projeto.supabase.co/auth/v1/user',
      'POST https://projeto.supabase.co/rest/v1/rpc/my_access',
      `GET ${ASAAS_SANDBOX_URL}/subscriptions?externalReference=${encodeURIComponent(webReference(ANA, 'individual'))}&status=ACTIVE&limit=10`,
      `GET ${ASAAS_SANDBOX_URL}/subscriptions?externalReference=${encodeURIComponent(webReference(ANA, 'familiar'))}&status=ACTIVE&limit=10`,
      `POST ${ASAAS_SANDBOX_URL}/checkouts`,
      'POST https://projeto.supabase.co/rest/v1/rpc/billing_checkout_record',
    ]);
    // my_access como a pessoa: o token dela em Authorization e a chave pública do projeto em apikey (nunca a de serviço com o token dela).
    expect(net.sent[1]?.headers).toMatchObject({ apikey: 'sb_publishable_x', Authorization: `Bearer ${JWT}` });
    expect(net.sent[0]?.headers).toEqual({ apikey: 'sb_publishable_x', Authorization: `Bearer ${JWT}` });
    expect(net.sent[4]?.body).toMatchObject({ externalReference: `clarevo:${ANA}:familiar`, subscription: { cycle: 'MONTHLY', nextDueDate: '2026-11-06' } });
    expect(recorded).toEqual([{ p_checkout_hash: sha256Hex(CHECKOUT), p_person: ANA, p_plan: 'familiar' }]);
  });

  it('assinar com assinatura ativa (no banco ou no Asaas), benefício ou cortesia: não cria Checkout', async () => {
    const h = (extra: Record<string, (init: { method: string; body?: string }) => { status: number; body: unknown }>) => {
      const net = fakeNet({ ...user, ...noSubs, 'POST /v3/checkouts': () => ({ status: 200, body: { id: CHECKOUT } }), ...extra });
      return { net, h: createAssinaturaWebHandler({ config, fetch: net.fetcher, now: () => NOW }) };
    };
    const a = h(access('assinatura'));
    expect(JSON.parse((await a.h(appReq({ action: 'assinar', plan: 'individual' }).req)).body)).toEqual({ result: 'ja_assinante' });
    for (const status of ['beneficio', 'cortesia']) {
      const b = h(access(status));
      expect(JSON.parse((await b.h(appReq({ action: 'assinar', plan: 'individual' }).req)).body), status).toEqual({ result: 'sem_necessidade' });
      expect(b.net.sent.some((s) => s.url.endsWith('/checkouts'))).toBe(false);
    }
    const c = h({ ...access('leitura'), 'GET /v3/subscriptions': () => ({ status: 200, body: { data: [sub()] } }) });
    expect(JSON.parse((await c.h(appReq({ action: 'assinar', plan: 'familiar' }).req)).body)).toEqual({ result: 'ja_assinante' });
    expect(c.net.sent.some((s) => s.url.endsWith('/checkouts'))).toBe(false);
    // O Asaas recusou o Checkout: indisponível, sem gravar nada.
    const d = h({ ...access('leitura'), 'POST /v3/checkouts': () => ({ status: 400, body: { errors: [{ code: 'invalid' }] } }) });
    expect((await d.h(appReq({ action: 'assinar', plan: 'individual' }).req)).status).toBe(502);
    // O banco não gravou a ligação: cancela o Checkout e pede para tentar de novo.
    const e = h({ ...access('leitura'), 'POST /rest/v1/rpc/billing_checkout_record': () => ({ status: 503, body: '' }), [`POST /v3/checkouts/${CHECKOUT}/cancel`]: () => ({ status: 200, body: {} }) });
    expect((await e.h(appReq({ action: 'assinar', plan: 'individual' }).req)).status).toBe(503);
    expect(e.net.sent.some((s) => s.url.endsWith(`/checkouts/${CHECKOUT}/cancel`))).toBe(true);
    // Mais de 5 Checkouts em uma hora: o banco recusa, o Checkout criado é cancelado e a resposta é 429.
    const f = h({ ...access('leitura'), 'POST /rest/v1/rpc/billing_checkout_record': () => ({ status: 200, body: { result: 'muitas_tentativas' } }), [`POST /v3/checkouts/${CHECKOUT}/cancel`]: () => ({ status: 200, body: {} }) });
    const tooMany = await f.h(appReq({ action: 'assinar', plan: 'individual' }).req);
    expect(tooMany.status).toBe(429);
    expect(JSON.parse(tooMany.body)).toEqual({ result: 'muitas_tentativas' });
    expect(f.net.sent.some((s) => s.url.endsWith(`/checkouts/${CHECKOUT}/cancel`))).toBe(true);
  });

  it('cancelar: remove no Asaas as assinaturas ativas da pessoa (pela referência); sem nenhuma, diz que não há', async () => {
    const deleted: string[] = [];
    const net = fakeNet({
      ...user,
      'GET /v3/subscriptions': (init) => ({ status: 200, body: { data: [] } }),
      [`DELETE /v3/subscriptions/${SUB}`]: () => {
        deleted.push(SUB);
        return { status: 200, body: { deleted: true } };
      },
    });
    const h = createAssinaturaWebHandler({ config, fetch: net.fetcher });
    expect(JSON.parse((await h(appReq({ action: 'cancelar' }).req)).body)).toEqual({ result: 'sem_assinatura' });
    const withSub = fakeNet({
      ...user,
      // A busca é por referência exata, uma por plano: a assinatura Individual aparece só na primeira; a mesma assinatura em duas
      // respostas (não acontece no Asaas) também seria removida uma vez só.
      'GET /v3/subscriptions': () => ({ status: 200, body: { data: [sub()] } }),
      [`DELETE /v3/subscriptions/${SUB}`]: () => {
        deleted.push(SUB);
        return { status: 200, body: { deleted: true } };
      },
    });
    const h2 = createAssinaturaWebHandler({ config, fetch: withSub.fetcher });
    expect(JSON.parse((await h2(appReq({ action: 'cancelar' }).req)).body)).toEqual({ result: 'cancelada' });
    expect(deleted).toEqual([SUB]);
    expect(withSub.sent.filter((s) => s.method === 'GET' && s.url.includes('/subscriptions?'))).toHaveLength(2);
    expect(withSub.sent.filter((s) => s.method === 'DELETE').every((s) => s.headers.access_token === API_KEY)).toBe(true);
  });

  it('a função gerada (supabase/functions/assinatura-web) está em dia com o núcleo e roda como no Deno, inclusive a consulta prévia de CORS', async () => {
    const root = join(__dirname, '../../..');
    execFileSync('node', [join(root, 'scripts/gerar-funcoes.js'), '--conferir']);
    const src = readFileSync(join(root, 'supabase/functions/assinatura-web/index.ts'), 'utf8');
    const env: Record<string, string> = { ASAAS_API_KEY: API_KEY, ASAAS_WEBHOOK_TOKEN: TOKEN, SUPABASE_URL: 'https://projeto.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_x' };
    let serve: ((req: Request) => Promise<Response>) | undefined;
    const deno = { env: { get: (n: string) => env[n] }, serve: (h: (req: Request) => Promise<Response>) => (serve = h) };
    const { answers } = happyAnswers();
    const sent: string[] = [];
    const fakeFetch = async (url: string, init: { method: string; body?: string; signal?: AbortSignal }) => {
      sent.push(`${init.method} ${url}`);
      expect(init.signal).toBeInstanceOf(AbortSignal);
      const key = `${init.method} ${url.replace(/^https:\/\/[^/]+/, '').replace(/\?.*$/, '')}`;
      const r = answers[key as keyof typeof answers]?.(init) ?? { status: 404, body: {} };
      return new Response(JSON.stringify(r.body), { status: r.status });
    };
    new Function('Deno', 'fetch', 'console', src)(deno, fakeFetch, { error: () => {} });
    expect(serve).toBeDefined();
    const body = JSON.stringify(event('PAYMENT_CONFIRMED', { payment: { id: 'pay_1', status: 'CONFIRMED', subscription: SUB } }));
    const post = await serve!(new Request('https://f/assinatura-web', { method: 'POST', body, headers: { 'asaas-access-token': TOKEN } }));
    expect(post.status).toBe(200);
    expect(post.headers.get('Content-Type')).toContain('application/json');
    expect(await post.json()).toEqual({ received: true, outcome: 'aplicado' });
    expect(sent).toContain('POST https://projeto.supabase.co/rest/v1/rpc/billing_apply');
    const bad = await serve!(new Request('https://f/assinatura-web', { method: 'POST', body, headers: { 'asaas-access-token': 'errado' } }));
    expect(bad.status).toBe(401);
    const pre = await serve!(new Request('https://f/assinatura-web', { method: 'OPTIONS', headers: { Origin: APP_URL_DEFAULT } }));
    expect(pre.status).toBe(204);
    expect(pre.headers.get('Access-Control-Allow-Origin')).toBe(APP_URL_DEFAULT);
    // A função leva só o servidor: nenhum texto da tela.
    expect(src).not.toContain(WEB_SUBSCRIPTION_TEXT.howItWorks);
    expect(src).not.toContain('respostas.ts');
  });

  it('nenhuma chave no código: o módulo e a função gerada não trazem chave do Asaas, token nem segredo', () => {
    const dir = join(__dirname, '../src/assinatura-web');
    const files = [...readdirSync(dir).map((f) => join(dir, f)), join(__dirname, '../../../supabase/functions/assinatura-web/index.ts')];
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/\$aact_(prod|hmlg)_[A-Za-z0-9]{8,}|sb_secret_[A-Za-z0-9]{8,}|eyJ[A-Za-z0-9_-]{20,}\./);
    }
  });
});

describe('Pix mês a mês (D-093, caminho B): o pedido, os avisos e o pedido do app', () => {
  const PIX_PAY = 'pay_pix0001';
  const pixPay = (extra: Record<string, unknown> = {}) => ({
    id: PIX_PAY,
    status: 'RECEIVED',
    billingType: 'PIX',
    dueDate: '2026-11-06',
    paymentDate: '2026-11-06',
    externalReference: pixReference(ANA, 'individual'),
    checkoutSession: CHECKOUT,
    ...extra,
  });
  /** O Asaas devolve a cobrança atual e o banco aplica; guarda o que foi aplicado e as pessoas procuradas. */
  function pixNet(payment: Record<string, unknown> | null, extra: Record<string, (init: { method: string; body?: string }) => { status: number; body: unknown }> = {}) {
    const applied: unknown[] = [];
    const net = fakeNet({
      [`GET /v3/payments/${PIX_PAY}`]: () => (payment ? { status: 200, body: payment } : { status: 404, body: { errors: [{ code: 'not_found' }] } }),
      'POST /rest/v1/rpc/billing_pix_apply': (init) => {
        applied.push(JSON.parse(init.body ?? '{}'));
        return { status: 200, body: { result: 'aplicado', paid_through: '2026-12-06', access: { status: 'assinatura', provider: 'pix' } } };
      },
      ...extra,
    });
    return { net, applied, h: createAssinaturaWebHandler({ config, fetch: net.fetcher, now: () => NOW }) };
  }

  it('a referência de Pix é própria e só a nossa é lida; o Checkout é Pix avulso de um mês, sem assinatura, com o nome do item curto', () => {
    expect(pixReference(ANA.toUpperCase(), 'familiar')).toBe(`clarevo-pix:${ANA}:familiar`);
    expect(parsePixReference(`clarevo-pix:${ANA}:individual`)).toEqual({ personId: ANA, plan: 'individual' });
    for (const bad of [webReference(ANA, 'individual'), `clarevo-pix:${ANA}:anual`, 'clarevo-pix:nao-e-uuid:individual', null, 42]) expect(parsePixReference(bad)).toBeNull();
    // A referência da assinatura no cartão não confunde com a de Pix.
    expect(parseWebReference(pixReference(ANA, 'individual'))).toBeNull();
    for (const plan of ['individual', 'familiar'] as const) {
      const body = checkoutPixRequest(ANA, plan, APP_URL_DEFAULT) as { items: { name: string; value: number }[] };
      expect(body).toMatchObject({
        billingTypes: ['PIX'],
        chargeTypes: ['DETACHED'],
        minutesToExpire: 60,
        externalReference: `clarevo-pix:${ANA}:${plan}`,
        callback: { successUrl: `${APP_URL_DEFAULT}/conta/assinatura?pagamento=sucesso`, cancelUrl: `${APP_URL_DEFAULT}/conta/assinatura?pagamento=cancelado` },
      });
      expect(body).not.toHaveProperty('subscription');
      expect(body.items[0]!.name.length).toBeLessThanOrEqual(30);
      expect(body.items[0]!.value).toBe(PLAN_PRICE_CENTS[plan] / 100);
    }
  });

  it('o dia que conta: o do pagamento (sem data ou no futuro, hoje); estornada, pendente ou removida não conta', () => {
    const p = (extra: Partial<AsaasPayment>) => pay('2026-11-06', 'RECEIVED', { subscription: null, ...extra });
    expect(pixPaidOn(p({ paidOn: '2026-11-05' }), '2026-11-06')).toBe('2026-11-05');
    expect(pixPaidOn(p({ paidOn: null }), '2026-11-06')).toBe('2026-11-06');
    expect(pixPaidOn(p({ paidOn: '2026-11-09' }), '2026-11-06')).toBe('2026-11-06');
    for (const status of ['PENDING', 'REFUNDED', 'OVERDUE', 'REFUND_REQUESTED']) expect(pixPaidOn(p({ status }), '2026-11-06'), status).toBeNull();
    expect(pixPaidOn(p({ deleted: true }), '2026-11-06')).toBeNull();
    // A data vem da liquidação; sem ela, a do pagador ou a confirmação.
    expect(asaasPaymentFrom({ id: 'x', paymentDate: '2026-11-04', clientPaymentDate: '2026-11-03' })?.paidOn).toBe('2026-11-04');
    expect(asaasPaymentFrom({ id: 'x', clientPaymentDate: '2026-11-03' })?.paidOn).toBe('2026-11-03');
    expect(asaasPaymentFrom({ id: 'x', confirmedDate: '2026-11-02' })?.paidOn).toBe('2026-11-02');
  });

  it('a janela para pagar o próximo mês: nos últimos 10 dias do mês pago (o fim do acesso já tem os 3 dias de tolerância)', () => {
    const until = '2026-12-09T02:59:59.999Z'; // 08/12 em Brasília: pago até 05/12, mais 3 dias
    expect(pixCanPayNext(until, new Date('2026-11-24T12:00:00Z'))).toBe(false);
    expect(pixCanPayNext(until, new Date('2026-11-26T03:00:00Z'))).toBe(true);
    expect(pixCanPayNext(null, NOW)).toBe(true);
    expect(pixNextPaymentFrom(until)?.toISOString()).toBe('2026-11-26T02:59:59.999Z');
  });

  it('cobrança de Pix paga: lê a cobrança atual no Asaas e grava só o resumo do identificador e o dia do pagamento, pela referência', async () => {
    const t = pixNet(pixPay());
    const res = await t.h(webhookReq(event('PAYMENT_RECEIVED', { payment: pixPay() })).req);
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ received: true, outcome: 'aplicado' });
    expect(t.net.sent.map((s) => `${s.method} ${s.url}`)).toEqual([`GET ${ASAAS_SANDBOX_URL}/payments/${PIX_PAY}`, 'POST https://projeto.supabase.co/rest/v1/rpc/billing_pix_apply']);
    expect(t.applied).toEqual([
      { p_event_id: 'evt_1', p_person: ANA, p_plan: 'individual', p_payment_hash: sha256Hex(PIX_PAY), p_paid_on: '2026-11-06', p_event_at: '2026-11-06T14:59:00.000Z' },
    ]);
    // Criada e ainda não paga: grava sem dia (o banco não libera nada).
    const pending = pixNet(pixPay({ status: 'PENDING', paymentDate: null }));
    await pending.h(webhookReq(event('PAYMENT_CREATED', { payment: pixPay({ status: 'PENDING' }) })).req);
    expect(pending.applied[0]).toMatchObject({ p_paid_on: null });
  });

  it('sem a referência na cobrança: acha a pessoa pelo Checkout no banco e, depois, pelo pagamento já gravado (estorno antigo)', async () => {
    const looked: string[] = [];
    const viaCheckout = pixNet(pixPay({ externalReference: null }), {
      'POST /rest/v1/rpc/billing_checkout_person': (init) => {
        looked.push(`checkout ${JSON.parse(init.body ?? '{}').p_checkout_hash}`);
        return { status: 200, body: { person_id: ANA, plan: 'familiar' } };
      },
    });
    expect(JSON.parse((await viaCheckout.h(webhookReq(event('PAYMENT_RECEIVED', { payment: pixPay({ externalReference: null }) })).req)).body)).toEqual({ received: true, outcome: 'aplicado' });
    expect(looked).toEqual([`checkout ${sha256Hex(CHECKOUT)}`]);
    expect(viaCheckout.applied[0]).toMatchObject({ p_person: ANA, p_plan: 'familiar' });
    // Estorno de um pagamento de meses atrás: o Checkout já saiu do banco (90 dias), mas o pagamento está gravado.
    const refunded = pixNet(pixPay({ externalReference: null, status: 'REFUNDED' }), {
      'POST /rest/v1/rpc/billing_checkout_person': () => ({ status: 200, body: null }),
      'POST /rest/v1/rpc/billing_pix_person': (init) => {
        expect(JSON.parse(init.body ?? '{}')).toEqual({ p_payment_hash: sha256Hex(PIX_PAY) });
        return { status: 200, body: { person_id: ANA, plan: 'individual' } };
      },
    });
    await refunded.h(webhookReq(event('PAYMENT_REFUNDED', { payment: pixPay({ externalReference: null, status: 'REFUNDED' }) })).req);
    expect(refunded.applied[0]).toMatchObject({ p_person: ANA, p_plan: 'individual', p_paid_on: null });
    // Cobrança avulsa que não é da Clarevo (sem referência, sem Checkout, sem pagamento gravado): 200, sem gravar nada.
    const logs: string[] = [];
    const foreign = fakeNet({
      [`GET /v3/payments/${PIX_PAY}`]: () => ({ status: 200, body: pixPay({ externalReference: null, checkoutSession: null }) }),
      'POST /rest/v1/rpc/billing_pix_person': () => ({ status: 200, body: null }),
    });
    const hf = createAssinaturaWebHandler({ config, fetch: foreign.fetcher, now: () => NOW, log: (m) => logs.push(m) });
    const rf = await hf(webhookReq(event('PAYMENT_RECEIVED', { payment: pixPay({ externalReference: null, checkoutSession: null }) })).req);
    expect(JSON.parse(rf.body)).toEqual({ received: true, outcome: 'sem_referencia' });
    expect(foreign.sent.some((s) => s.url.endsWith('/rpc/billing_pix_apply'))).toBe(false);
    expect(logs).toEqual(['aviso PAYMENT_RECEIVED de cobrança avulsa sem referência da Clarevo']);
    expect(logs.join(' ')).not.toContain(ANA);
  });

  it('cobrança que o Asaas diz ser de assinatura fica com o fluxo da assinatura; removida (404) conta como não paga; conta excluída não cancela nada', async () => {
    const ofSub = pixNet(pixPay({ subscription: SUB }));
    expect(JSON.parse((await ofSub.h(webhookReq(event('PAYMENT_UPDATED', { payment: pixPay() })).req)).body)).toEqual({ received: true, outcome: 'ignorado' });
    expect(ofSub.applied).toEqual([]);
    const removed = pixNet(null);
    expect(JSON.parse((await removed.h(webhookReq(event('PAYMENT_DELETED', { payment: pixPay() })).req)).body)).toEqual({ received: true, outcome: 'aplicado' });
    expect(removed.applied[0]).toMatchObject({ p_paid_on: null, p_payment_hash: sha256Hex(PIX_PAY) });
    const gone = pixNet(pixPay(), { 'POST /rest/v1/rpc/billing_pix_apply': () => ({ status: 200, body: { result: 'sem_pessoa' } }) });
    expect(JSON.parse((await gone.h(webhookReq(event('PAYMENT_RECEIVED', { payment: pixPay() })).req)).body)).toEqual({ received: true, outcome: 'sem_pessoa' });
    expect(gone.net.sent.some((s) => s.method === 'DELETE')).toBe(false);
    // Asaas fora do ar ao ler a cobrança: 500, e o Asaas entrega de novo.
    const down = pixNet(pixPay(), { [`GET /v3/payments/${PIX_PAY}`]: () => ({ status: 503, body: '' }) });
    expect((await down.h(webhookReq(event('PAYMENT_RECEIVED', { payment: pixPay() })).req)).status).toBe(500);
  });

  it('CHECKOUT_PAID: lista as cobranças do Checkout e aplica cada uma, com um identificador de aviso por cobrança', async () => {
    const t = pixNet(pixPay({ externalReference: null }), {
      'GET /v3/payments': () => ({ status: 200, body: { object: 'list', data: [pixPay({ externalReference: null })] } }),
      'POST /rest/v1/rpc/billing_checkout_person': () => ({ status: 200, body: { person_id: ANA, plan: 'individual' } }),
    });
    const res = await t.h(webhookReq(event('CHECKOUT_PAID', { checkout: { id: CHECKOUT, status: 'PAID' } })).req);
    expect(JSON.parse(res.body)).toEqual({ received: true, outcome: 'aplicado' });
    expect(t.net.sent[0]?.url).toBe(`${ASAAS_SANDBOX_URL}/payments?checkoutSession=${CHECKOUT}&limit=10`);
    expect(t.applied).toEqual([expect.objectContaining({ p_event_id: `evt_1:${PIX_PAY}`, p_person: ANA, p_paid_on: '2026-11-06' })]);
  });

  describe('pedido do app: "pix"', () => {
    const user = { 'GET /auth/v1/user': () => ({ status: 200, body: { id: ANA, email: 'ana@exemplo.test' } }) };
    const access = (status: string, provider: string | null = null, until: string | null = null) => ({
      'POST /rest/v1/rpc/my_access': () => ({ status: 200, body: { status, plan: status === 'assinatura' ? 'individual' : null, until, can_write: true, provider } }),
    });
    const noSubs = { 'GET /v3/subscriptions': () => ({ status: 200, body: { object: 'list', data: [] } }) };
    const make = (extra: Record<string, (init: { method: string; body?: string }) => { status: number; body: unknown }>) => {
      const net = fakeNet({
        ...user,
        ...noSubs,
        'POST /v3/checkouts': () => ({ status: 200, body: { id: CHECKOUT, link: `https://sandbox.asaas.com/checkoutSession/show?id=${CHECKOUT}` } }),
        'POST /rest/v1/rpc/billing_checkout_record': () => ({ status: 200, body: { result: 'gravado' } }),
        ...extra,
      });
      return { net, h: createAssinaturaWebHandler({ config, fetch: net.fetcher, now: () => NOW }) };
    };

    it('no teste ou em só leitura: cria o Checkout de Pix, liga à pessoa no banco e devolve o link', async () => {
      const t = make(access('leitura'));
      const res = await t.h(appReq({ action: 'pix', plan: 'familiar' }).req);
      expect(JSON.parse(res.body)).toEqual({ result: 'checkout', url: `https://sandbox.asaas.com/checkoutSession/show?id=${CHECKOUT}` });
      const created = t.net.sent.find((s) => s.url.endsWith('/checkouts'));
      expect(created?.body).toMatchObject({ billingTypes: ['PIX'], chargeTypes: ['DETACHED'], externalReference: `clarevo-pix:${ANA}:familiar` });
      expect(t.net.sent.find((s) => s.url.endsWith('/rpc/billing_checkout_record'))?.body).toEqual({ p_checkout_hash: sha256Hex(CHECKOUT), p_person: ANA, p_plan: 'familiar' });
      expect((await t.h(appReq({ action: 'pix' }).req)).status).toBe(400);
      expect((await t.h(appReq({ action: 'pix', plan: 'anual' }).req)).status).toBe(400);
    });

    it('quem paga com Pix: o próximo mês só nos últimos dias do mês pago; cartão, loja, benefício ou assinatura ativa no Asaas não abrem Pix', async () => {
      // Pago até 05/12 (acesso até 08/12): em 06/11 ainda é cedo.
      const early = make(access('assinatura', 'pix', '2026-12-09T02:59:59.999Z'));
      expect(JSON.parse((await early.h(appReq({ action: 'pix', plan: 'individual' }).req)).body)).toEqual({ result: 'ja_pago' });
      expect(early.net.sent.some((s) => s.url.endsWith('/checkouts'))).toBe(false);
      // Acesso até 15/11: já dá para pagar o próximo.
      const ready = make(access('assinatura', 'pix', '2026-11-16T02:59:59.999Z'));
      expect(JSON.parse((await ready.h(appReq({ action: 'pix', plan: 'individual' }).req)).body)).toMatchObject({ result: 'checkout' });
      for (const provider of ['web', 'apple', 'google']) {
        const other = make(access('assinatura', provider, '2026-11-16T02:59:59.999Z'));
        expect(JSON.parse((await other.h(appReq({ action: 'pix', plan: 'individual' }).req)).body), provider).toEqual({ result: 'ja_assinante' });
      }
      // Quem paga com Pix não abre o Checkout do cartão enquanto o mês pago vale.
      const card = make(access('assinatura', 'pix', '2026-11-16T02:59:59.999Z'));
      expect(JSON.parse((await card.h(appReq({ action: 'assinar', plan: 'individual' }).req)).body)).toEqual({ result: 'ja_assinante' });
      const benefit = make(access('beneficio'));
      expect(JSON.parse((await benefit.h(appReq({ action: 'pix', plan: 'individual' }).req)).body)).toEqual({ result: 'sem_necessidade' });
      const cardInAsaas = make({ ...access('leitura'), 'GET /v3/subscriptions': () => ({ status: 200, body: { data: [sub()] } }) });
      expect(JSON.parse((await cardInAsaas.h(appReq({ action: 'pix', plan: 'individual' }).req)).body)).toEqual({ result: 'ja_assinante' });
    });
  });
});

describe('Assinatura na web: o que o app usa', () => {
  it('lê as respostas da função sem confiar em link fora do Asaas', () => {
    expect(parseWebSubscriptionStart({ result: 'checkout', url: 'https://asaas.com/checkoutSession/show?id=1' })).toEqual({ result: 'checkout', url: 'https://asaas.com/checkoutSession/show?id=1' });
    expect(parseWebSubscriptionStart({ result: 'checkout', url: 'https://golpe.test/asaas.com/' })).toEqual({ result: 'tente_de_novo' });
    expect(parseWebSubscriptionStart({ result: 'ja_assinante' })).toEqual({ result: 'ja_assinante' });
    expect(parseWebSubscriptionStart(null)).toEqual({ result: 'tente_de_novo' });
    expect(parseWebSubscriptionCancel({ result: 'cancelada' })).toBe('cancelada');
    expect(parseWebSubscriptionCancel({ result: 'x' })).toBe('tente_de_novo');
    expect(parseWebPaymentReturn('sucesso')).toBe('sucesso');
    expect(parseWebPaymentReturn('ok')).toBeNull();
  });

  it('os textos seguem as regras: sem travessão longo, sem "fazer sentido", sem código de decisão, sem apontar pagamento fora da loja no celular (só a web os mostra)', () => {
    const texts = Object.values(WEB_SUBSCRIPTION_TEXT).flatMap((v) =>
      typeof v === 'string' ? [v] : typeof v === 'function' ? [v('individual'), v('familiar')] : Object.values(v),
    );
    expect(texts.length).toBeGreaterThan(10);
    for (const t of texts) {
      expect(t).not.toMatch(/—|–/);
      expect(t).not.toMatch(/fa(z|ç)er? sentido|faz sentido/i);
      expect(t).not.toMatch(/D-0\d\d|cofrinho|caixinha/i);
    }
    expect(WEB_SUBSCRIPTION_TEXT.subscribe('familiar')).toBe('Assinar o plano Família');
    expect(WEB_SUBSCRIPTION_TEXT.howItWorks).toContain('a Clarevo não vê nem guarda');
  });
});
