/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';
import {
  APP_URL_DEFAULT,
  ASAAS_PRODUCTION_URL,
  ASAAS_SANDBOX_URL,
  WEB_WITHDRAWAL_TEXT,
  WITHDRAWAL_OPEN,
  WITHDRAWAL_REFUND_DESCRIPTION,
  asaasPaymentFrom,
  cardChargeDay,
  cardWithdrawal,
  createAssinaturaWebHandler,
  parseWebWithdrawalResult,
  parseWebWithdrawalState,
  parseWithdrawalOptions,
  pixWithdrawal,
  pixWithdrawalStart,
  sha256Hex,
  storeRefundNoteApplies,
  webReference,
  withdrawalAfterText,
  withdrawalConfirmLines,
  withdrawalDeadline,
  withdrawalLastDay,
  withdrawalMayApply,
  withdrawalReceiptLines,
  withinWithdrawal,
  type Access,
  type AsaasPayment,
  type AssinaturaWebConfig,
  type HttpFetch,
  type WebWithdrawalOffer,
} from '../src';

/**
 * A desistência em 7 dias pela web (D-131, item F). Dados FICTÍCIOS: chaves, pessoas e identificadores inventados. O Asaas e o banco são
 * uma rede falsa: nenhum pedido sai do teste.
 */
const API_KEY = '$aact_hmlg_000000000000000000000000000000000000000000000000000000chave_de_teste';
const TOKEN = 'token_dos_avisos_de_teste_0123456789abcdef';
const JWT = 'eyJ.sessao.de.teste';
const ANA = '0d2f4a6c-1b3e-4c5d-8e9f-0a1b2c3d4e5f';
const EDU = '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const SUB = 'sub_desist0001';
const PAY = 'pay_desist0001';
const PIX = 'pay_pix_desist01';
// 27/11/2026, 12h em Brasília.
const NOW = new Date('2026-11-27T15:00:00.000Z');
const REQUESTED = '2026-11-27T15:00:00.000+00:00';

const sandbox: AssinaturaWebConfig = {
  apiKey: API_KEY,
  apiBase: ASAAS_SANDBOX_URL,
  sandbox: true,
  webhookToken: TOKEN,
  supabaseUrl: 'https://projeto.supabase.co',
  serviceKey: 'sb_secret_x',
  userApiKey: 'sb_publishable_x',
  appUrl: APP_URL_DEFAULT,
};
const production: AssinaturaWebConfig = { ...sandbox, apiKey: '$aact_prod_000000000000000000000000000000000000chave_de_teste', apiBase: ASAAS_PRODUCTION_URL, sandbox: false };

const pay = (dueDate: string, status = 'CONFIRMED', extra: Partial<AsaasPayment> = {}): AsaasPayment => ({
  id: PAY,
  status,
  deleted: false,
  dueDate,
  subscription: SUB,
  externalReference: null,
  checkoutSession: null,
  paidOn: null,
  billingType: 'CREDIT_CARD',
  confirmedOn: dueDate,
  valueCents: 2990,
  ...extra,
});

type Answer = (init: { method: string; body?: string }, url: string) => { status: number; body: unknown };

/** A rede falsa: o Asaas e o banco, com o que cada endereço responde, e o registro do que foi mandado. */
function fakeNet(answers: Record<string, Answer> = {}) {
  const sent: { method: string; url: string; body: unknown }[] = [];
  const fetcher: HttpFetch = async (url, init) => {
    sent.push({ method: init.method, url, body: init.body === undefined ? undefined : JSON.parse(init.body) });
    const key = `${init.method} ${url.replace(/^https:\/\/[^/]+/, '').replace(/\?.*$/, '')}`;
    const r = answers[key]?.(init, url) ?? { status: 404, body: { errors: [{ code: 'not_found' }] } };
    return { status: r.status, text: async () => (typeof r.body === 'string' ? r.body : JSON.stringify(r.body)) };
  };
  const calls = (prefix: string) => sent.filter((s) => `${s.method} ${s.url}`.includes(prefix));
  return { sent, fetcher, calls };
}

function appReq(body: unknown) {
  const headers: Record<string, string> = { authorization: `Bearer ${JWT}`, origin: APP_URL_DEFAULT };
  return { method: 'POST', header: (n: string) => headers[n.toLowerCase()] ?? null, body: async () => JSON.stringify(body) };
}

const user = (id = ANA): Record<string, Answer> => ({ 'GET /auth/v1/user': () => ({ status: 200, body: { id, email: 'ana@exemplo.test' } }) });
const afterLeitura = { status: 'leitura', plan: null, until: '2026-11-10T15:00:00+00:00', can_write: false, provider: null, period: null };
const afterTeste = { status: 'teste', plan: null, until: '2026-12-09T15:00:00+00:00', can_write: true, provider: null, period: null };

/** billing_withdrawal_options: as compras que o banco liga à pessoa. */
function options(o: { web?: unknown[]; pix?: unknown[]; withdrawals?: unknown[] } = {}): Record<string, Answer> {
  return {
    'POST /rest/v1/rpc/billing_withdrawal_options': () => ({ status: 200, body: { result: 'ok', web: o.web ?? [], pix: o.pix ?? [], withdrawals: o.withdrawals ?? [] } }),
  };
}
const webCandidate = (sub = SUB, plan = 'individual', after: unknown = afterLeitura) => ({ external_ref: sha256Hex(sub), plan, period: 'mensal', access_after: after });

/** A assinatura no Asaas (pela referência da pessoa) e as cobranças dela. */
function asaasCard(o: { cycle?: string; status?: string; deleted?: boolean; ref?: string; payments: () => unknown[] }): Record<string, Answer> {
  return {
    'GET /v3/subscriptions': (_init, url) => ({
      status: 200,
      body: {
        data: url.includes(encodeURIComponent(webReference(ANA, 'individual')))
          ? [{ id: SUB, status: o.status ?? 'ACTIVE', deleted: o.deleted ?? false, cycle: o.cycle ?? 'MONTHLY', externalReference: o.ref ?? webReference(ANA, 'individual'), dateCreated: '2026-11-27' }]
          : [],
      },
    }),
    'GET /v3/payments': () => ({ status: 200, body: { data: o.payments(), hasMore: false } }),
  };
}
const asaasPayment = (status: string, extra: Record<string, unknown> = {}) => ({
  id: PAY,
  status,
  subscription: SUB,
  dueDate: '2026-11-27',
  confirmedDate: '2026-11-27',
  value: 29.9,
  billingType: 'CREDIT_CARD',
  ...extra,
});

/** billing_withdrawal_begin e billing_withdrawal_finish, com o registro dos argumentos. */
function bank(beginResult: unknown = { result: 'nova', requested_at: REQUESTED }) {
  const begun: Record<string, unknown>[] = [];
  const finished: Record<string, unknown>[] = [];
  const answers: Record<string, Answer> = {
    'POST /rest/v1/rpc/billing_withdrawal_begin': (init) => {
      begun.push(JSON.parse(init.body ?? '{}'));
      return { status: 200, body: typeof beginResult === 'function' ? (beginResult as () => unknown)() : beginResult };
    },
    'POST /rest/v1/rpc/billing_withdrawal_finish': (init) => {
      finished.push(JSON.parse(init.body ?? '{}'));
      return { status: 200, body: { result: 'devolvida', requested_at: REQUESTED, refunded_at: REQUESTED } };
    },
  };
  return { begun, finished, answers };
}

describe('Desistência em 7 dias (D-131, item F): o interruptor e o prazo', () => {
  it('sai desligada: WITHDRAWAL_OPEN é falso (ligar é um PR que troca este teste junto, depois do texto do advogado)', () => {
    expect(WITHDRAWAL_OPEN).toBe(false);
  });

  it('o prazo vai até o fim do 7º dia seguinte (o dia do começo não conta), no fuso mais a oeste do Brasil (Acre, UTC-5)', () => {
    expect(withdrawalLastDay('2026-11-27')).toBe('2026-12-04');
    expect(withdrawalDeadline('2026-11-27').toISOString()).toBe('2026-12-05T04:59:59.999Z');
    // 04/12 às 23h59 no Acre (01h59 de 05/12 em Brasília): ainda vale; um minuto depois, não.
    expect(withinWithdrawal('2026-11-27', new Date('2026-12-05T04:59:00.000Z'))).toBe(true);
    expect(withinWithdrawal('2026-11-27', new Date('2026-12-05T05:00:00.000Z'))).toBe(false);
    // O começo à frente (o Pix pago no teste conta do fim do teste): já vale antes dele.
    expect(withinWithdrawal('2026-12-09', NOW)).toBe(true);
  });

  it('cartão: o dia da cobrança é o vencimento ou, se a confirmação veio depois, o dela; nunca o do crédito (32 dias depois)', () => {
    expect(cardChargeDay(pay('2026-11-27'))).toBe('2026-11-27');
    // O Checkout aberto antes da meia-noite e pago depois: o vencimento é a véspera, a confirmação é hoje.
    expect(cardChargeDay(pay('2026-11-26', 'CONFIRMED', { confirmedOn: '2026-11-27' }))).toBe('2026-11-27');
    // RECEIVED 32 dias depois: o paymentDate é o do crédito, e o dia continua o da cobrança.
    expect(cardChargeDay(pay('2026-11-27', 'RECEIVED', { paidOn: '2026-12-29' }))).toBe('2026-11-27');
    expect(cardChargeDay(pay('2026-11-27', 'PENDING'))).toBeNull();
    expect(cardChargeDay(pay('2026-11-27', 'REFUNDED'))).toBe('2026-11-27');
    expect(cardChargeDay(pay('2026-11-27', 'CONFIRMED', { deleted: true }))).toBeNull();
    // A leitura do objeto do Asaas: o dia da confirmação e o valor em centavos (o Asaas manda em reais).
    const p = asaasPaymentFrom({ id: 'p', status: 'CONFIRMED', dueDate: '2026-11-26', confirmedDate: '2026-11-27', paymentDate: '2026-12-29', value: 269.9 });
    expect([p?.confirmedOn, p?.valueCents, p?.paidOn]).toEqual(['2026-11-27', 26990, '2026-12-29']);
    expect(asaasPaymentFrom({ id: 'p', value: 'x' })?.valueCents).toBeNull();
  });

  it('cartão: no prazo, devolve as cobranças pagas da assinatura; antes da primeira cobrança, nada a devolver; depois do prazo, nada', () => {
    expect(cardWithdrawal([pay('2026-11-27')], NOW)).toEqual({ state: 'pode', startDay: '2026-11-27', refundable: [pay('2026-11-27')], amountCents: 2990 });
    // Assinou no teste grátis (D-129) e a primeira cobrança ainda não aconteceu: Cancelar assinatura já não cobra nada.
    expect(cardWithdrawal([pay('2026-12-09', 'PENDING')], NOW)).toEqual({ state: 'nada_cobrado' });
    expect(cardWithdrawal([], NOW)).toEqual({ state: 'nada_cobrado' });
    // Assinou no teste: o prazo conta da primeira cobrança, no fim do teste (09/12): vale até 16/12.
    const trialCharge = pay('2026-12-09', 'CONFIRMED', { valueCents: 26990 });
    expect(cardWithdrawal([trialCharge], new Date('2026-12-16T20:00:00.000Z'))).toMatchObject({ state: 'pode', startDay: '2026-12-09', amountCents: 26990 });
    expect(cardWithdrawal([trialCharge], new Date('2026-12-17T06:00:00.000Z'))).toEqual({ state: 'fora_do_prazo', startDay: '2026-12-09' });
    // Mensal assinado há 8 dias: fora do prazo; a renovação do mês seguinte não abre prazo novo (conta a primeira cobrança paga).
    expect(cardWithdrawal([pay('2026-11-19')], NOW)).toEqual({ state: 'fora_do_prazo', startDay: '2026-11-19' });
    expect(cardWithdrawal([pay('2026-10-27', 'RECEIVED', { id: 'p1' }), pay('2026-11-27', 'CONFIRMED', { id: 'p2' })], NOW)).toMatchObject({ state: 'fora_do_prazo' });
    // Já devolvida (uma tentativa anterior deu certo): nunca outra devolução.
    expect(cardWithdrawal([pay('2026-11-27', 'REFUNDED')], NOW)).toEqual({ state: 'devolvida', startDay: '2026-11-27' });
    expect(cardWithdrawal([pay('2026-11-27', 'REFUND_IN_PROGRESS')], NOW)).toEqual({ state: 'devolvida', startDay: '2026-11-27' });
    // Em contestação, ou sem o valor: fica com a equipe.
    expect(cardWithdrawal([pay('2026-11-27', 'CHARGEBACK_REQUESTED')], NOW)).toEqual({ state: 'sem_compra' });
    expect(cardWithdrawal([pay('2026-11-27', 'CONFIRMED', { valueCents: null })], NOW)).toEqual({ state: 'sem_compra' });
    // A próxima cobrança pendente (gerada antes) não volta nem impede: sai com a assinatura.
    expect(cardWithdrawal([pay('2026-11-27'), pay('2026-12-27', 'PENDING', { id: 'p2' })], NOW)).toMatchObject({ state: 'pode', amountCents: 2990 });
  });

  it('Pix: o prazo conta do dia do pagamento ou, pago no teste grátis, do começo do período pago (o fim do teste, D-129)', () => {
    expect(pixWithdrawalStart({ paidOn: '2026-11-27', startsOn: null })).toBe('2026-11-27');
    expect(pixWithdrawalStart({ paidOn: '2026-11-27', startsOn: '2026-12-09' })).toBe('2026-12-09');
    const p = pay('2026-11-27', 'RECEIVED', { id: PIX, subscription: null, billingType: 'PIX', valueCents: 2990 });
    expect(pixWithdrawal({ paidOn: '2026-11-27', startsOn: null }, p, NOW)).toMatchObject({ state: 'pode', startDay: '2026-11-27', amountCents: 2990 });
    expect(pixWithdrawal({ paidOn: '2026-11-19', startsOn: null }, p, NOW)).toEqual({ state: 'fora_do_prazo', startDay: '2026-11-19' });
    // Pago no 3º dia do teste, há 9 dias: o período começa no fim do teste (dali a 5 dias), e o prazo ainda vale.
    expect(pixWithdrawal({ paidOn: '2026-11-18', startsOn: '2026-12-02' }, p, NOW)).toMatchObject({ state: 'pode', startDay: '2026-12-02' });
    expect(pixWithdrawal({ paidOn: '2026-11-27', startsOn: null }, { ...p, status: 'REFUNDED' }, NOW)).toEqual({ state: 'devolvida', startDay: '2026-11-27' });
    expect(pixWithdrawal({ paidOn: '2026-11-27', startsOn: null }, { ...p, status: 'PENDING' }, NOW)).toEqual({ state: 'sem_compra' });
  });

  it('lê o que o banco devolve sem confiar em campo fora do formato', () => {
    const o = parseWithdrawalOptions({
      result: 'ok',
      web: [webCandidate(), { external_ref: 'curto', plan: 'individual' }, { external_ref: sha256Hex('x'), plan: 'empresa' }],
      pix: [{ payment_hash: sha256Hex(PIX), plan: 'familiar', period: 'anual', paid_on: '2026-11-27', starts_on: null, access_after: afterTeste }, { payment_hash: sha256Hex('y'), plan: 'individual', paid_on: null }],
      withdrawals: [{ provider: 'pix', purchase_hash: sha256Hex(PIX), status: 'devolvida', requested_at: REQUESTED, amount_cents: 62990 }, { provider: 'apple', purchase_hash: sha256Hex('z'), status: 'pedida', requested_at: REQUESTED }],
    });
    expect(o).toEqual({
      web: [{ externalRef: sha256Hex(SUB), plan: 'individual', after: { status: 'leitura', until: '2026-11-10T15:00:00+00:00', provider: null } }],
      pix: [{ paymentHash: sha256Hex(PIX), plan: 'familiar', period: 'anual', paidOn: '2026-11-27', startsOn: null, after: { status: 'teste', until: '2026-12-09T15:00:00+00:00', provider: null } }],
      withdrawals: [{ provider: 'pix', purchaseHash: sha256Hex(PIX), status: 'devolvida', requestedAt: REQUESTED, amountCents: 62990, contractedOn: null }],
    });
    expect(parseWithdrawalOptions({ result: 'sem_pessoa' })).toBe('sem_pessoa');
    expect(parseWithdrawalOptions(null)).toBeNull();
  });
});

describe('Desistência em 7 dias: a função do servidor', () => {
  it('desligada (WITHDRAWAL_OPEN falso), com a chave de produção: 503 "indisponivel" nas duas ações, sem tocar no banco nem no Asaas', async () => {
    const net = fakeNet({ ...user(), ...options({ web: [webCandidate()] }) });
    const h = createAssinaturaWebHandler({ config: production, fetch: net.fetcher, now: () => NOW });
    for (const action of ['desistencia', 'desistir']) {
      const res = await h(appReq({ action }));
      expect([res.status, JSON.parse(res.body)], action).toEqual([503, { result: 'indisponivel' }]);
      expect(res.headers['Access-Control-Allow-Origin']).toBe(APP_URL_DEFAULT);
    }
    expect(net.sent).toEqual([]);
  });

  it('"desistencia" no cartão: confere no Asaas a assinatura que o banco liga à pessoa (também a removida) e diz o valor, o último dia e o acesso depois, sem mudar nada', async () => {
    const net = fakeNet({ ...user(), ...options({ web: [webCandidate()] }), ...asaasCard({ payments: () => [asaasPayment('CONFIRMED')] }) });
    const h = createAssinaturaWebHandler({ config: sandbox, fetch: net.fetcher, now: () => NOW });
    const res = await h(appReq({ action: 'desistencia' }));
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({
      result: 'pode',
      meio: 'cartao',
      plan: 'individual',
      period: 'mensal',
      amountCents: 2990,
      lastDay: '2026-12-04',
      after: { status: 'leitura', until: '2026-11-10T15:00:00+00:00', provider: null },
    });
    expect(net.sent.map((s) => `${s.method} ${s.url}`)).toEqual([
      'GET https://projeto.supabase.co/auth/v1/user',
      'POST https://projeto.supabase.co/rest/v1/rpc/billing_withdrawal_options',
      `GET ${ASAAS_SANDBOX_URL}/subscriptions?externalReference=${encodeURIComponent(webReference(ANA, 'individual'))}&includeDeleted=true&limit=100`,
      `GET ${ASAAS_SANDBOX_URL}/payments?subscription=${SUB}&limit=100`,
    ]);
    expect(net.sent[1]?.body).toEqual({ p_person: ANA });
  });

  it('"desistencia" sem compra que o banco ligue à pessoa: "sem_direito" sem perguntar ao Asaas; antes da primeira cobrança ou fora do prazo, também', async () => {
    const none = fakeNet({ ...user(), ...options() });
    const h = createAssinaturaWebHandler({ config: sandbox, fetch: none.fetcher, now: () => NOW });
    expect(JSON.parse((await h(appReq({ action: 'desistencia' }))).body)).toEqual({ result: 'sem_direito' });
    expect(none.sent.some((s) => s.url.includes('asaas'))).toBe(false);
    for (const payments of [[asaasPayment('PENDING', { dueDate: '2026-12-09', confirmedDate: null })], [asaasPayment('CONFIRMED', { dueDate: '2026-11-19', confirmedDate: '2026-11-19' })]]) {
      const net = fakeNet({ ...user(), ...options({ web: [webCandidate()] }), ...asaasCard({ payments: () => payments }) });
      const h2 = createAssinaturaWebHandler({ config: sandbox, fetch: net.fetcher, now: () => NOW });
      expect(JSON.parse((await h2(appReq({ action: 'desistencia' }))).body)).toEqual({ result: 'sem_direito' });
    }
  });

  it('a assinatura só conta se o banco a liga à pessoa e a referência é dela (o Asaas que ignora o filtro não muda isso)', async () => {
    // O Asaas devolve uma assinatura com a referência de outra pessoa: ignorada.
    const other = fakeNet({ ...user(), ...options({ web: [webCandidate()] }), ...asaasCard({ ref: webReference(EDU, 'individual'), payments: () => [asaasPayment('CONFIRMED')] }) });
    const h = createAssinaturaWebHandler({ config: sandbox, fetch: other.fetcher, now: () => NOW });
    expect(JSON.parse((await h(appReq({ action: 'desistir' }))).body)).toEqual({ result: 'sem_compra' });
    expect(other.calls('/payments').length).toBe(0);
    // O banco liga outra assinatura à pessoa (o resumo não bate): ignorada, e nada é devolvido.
    const unknown = fakeNet({ ...user(), ...options({ web: [webCandidate('sub_outra')] }), ...asaasCard({ payments: () => [asaasPayment('CONFIRMED')] }) });
    const h2 = createAssinaturaWebHandler({ config: sandbox, fetch: unknown.fetcher, now: () => NOW });
    expect(JSON.parse((await h2(appReq({ action: 'desistir' }))).body)).toEqual({ result: 'sem_compra' });
    expect(unknown.sent.some((s) => s.method === 'POST' && s.url.includes('/refund'))).toBe(false);
  });

  it('"desistir" no cartão: grava o pedido, remove a assinatura (nada mais é cobrado) e só então pede a devolução integral; responde com a hora do pedido', async () => {
    const b = bank();
    const net = fakeNet({
      ...user(),
      ...options({ web: [webCandidate('sub_desist0001', 'individual', afterLeitura)] }),
      ...asaasCard({ cycle: 'YEARLY', payments: () => [asaasPayment('CONFIRMED', { value: 269.9 }), asaasPayment('PENDING', { id: 'pay_prox', dueDate: '2027-11-27', confirmedDate: null })] }),
      [`DELETE /v3/subscriptions/${SUB}`]: () => ({ status: 200, body: { deleted: true, id: SUB } }),
      [`POST /v3/payments/${PAY}/refund`]: () => ({ status: 200, body: { id: PAY, status: 'REFUNDED' } }),
      ...b.answers,
    });
    const h = createAssinaturaWebHandler({ config: sandbox, fetch: net.fetcher, now: () => NOW });
    const res = await h(appReq({ action: 'desistir' }));
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ result: 'recebida', meio: 'cartao', requestedAt: REQUESTED, amountCents: 26990, after: { status: 'leitura', until: '2026-11-10T15:00:00+00:00', provider: null } });
    const writes = net.sent.filter((s) => s.method !== 'GET').map((s) => `${s.method} ${s.url.replace(/^https:\/\/[^/]+/, '')}`);
    expect(writes).toEqual([
      'POST /rest/v1/rpc/billing_withdrawal_options',
      'POST /rest/v1/rpc/billing_withdrawal_begin',
      `DELETE /v3/subscriptions/${SUB}`,
      `POST /v3/payments/${PAY}/refund`,
      'POST /rest/v1/rpc/billing_withdrawal_finish',
    ]);
    // A devolução sem valor (o Asaas devolve o integral), só da cobrança paga; a pendente sai com a assinatura.
    expect(net.calls('/refund').map((s) => s.body)).toEqual([{ description: WITHDRAWAL_REFUND_DESCRIPTION }]);
    expect(b.begun).toEqual([{ p_person: ANA, p_provider: 'web', p_purchase_hash: sha256Hex(SUB), p_plan: 'individual', p_period: 'anual', p_amount_cents: 26990, p_contracted_on: '2026-11-27' }]);
    expect(b.finished).toEqual([{ p_person: ANA, p_provider: 'web', p_purchase_hash: sha256Hex(SUB), p_refunded: true }]);
  });

  it('"desistir" de novo (segundo toque, outra aba, repetição): nunca outra devolução', async () => {
    // Em andamento (o banco trava a tentativa): nada vai ao Asaas.
    const b1 = bank({ result: 'em_andamento', requested_at: REQUESTED });
    const busy = fakeNet({ ...user(), ...options({ web: [webCandidate()] }), ...asaasCard({ payments: () => [asaasPayment('CONFIRMED')] }), ...b1.answers });
    const h1 = createAssinaturaWebHandler({ config: sandbox, fetch: busy.fetcher, now: () => NOW });
    expect(JSON.parse((await h1(appReq({ action: 'desistir' }))).body)).toEqual({ result: 'em_andamento', requestedAt: REQUESTED });
    expect(busy.sent.some((s) => s.method === 'DELETE' || s.url.includes('/refund'))).toBe(false);
    // Já devolvida no Asaas, com o pedido gravado: a confirmação de antes, com a mesma hora, sem devolução nem remoção.
    const b2 = bank();
    const done = fakeNet({
      ...user(),
      ...options({ web: [webCandidate()], withdrawals: [{ provider: 'web', purchase_hash: sha256Hex(SUB), status: 'devolvida', requested_at: REQUESTED, amount_cents: 2990 }] }),
      ...asaasCard({ deleted: true, status: 'INACTIVE', payments: () => [asaasPayment('REFUNDED')] }),
      ...b2.answers,
    });
    const h2 = createAssinaturaWebHandler({ config: sandbox, fetch: done.fetcher, now: () => NOW });
    for (const action of ['desistir', 'desistencia']) {
      expect(JSON.parse((await h2(appReq({ action }))).body), action).toEqual({ result: 'recebida', meio: 'cartao', requestedAt: REQUESTED, amountCents: 2990, after: { status: 'leitura', until: '2026-11-10T15:00:00+00:00', provider: null } });
    }
    expect(done.sent.some((s) => s.method === 'DELETE' || s.url.includes('/refund'))).toBe(false);
    expect(b2.begun).toEqual([]);
    // Devolvida no Asaas, mas o banco ficou sem a marca (a resposta da tentativa anterior se perdeu): marca agora e confirma.
    const b3 = bank();
    const unmarked = fakeNet({
      ...user(),
      ...options({ web: [webCandidate()], withdrawals: [{ provider: 'web', purchase_hash: sha256Hex(SUB), status: 'pedida', requested_at: REQUESTED, amount_cents: 2990 }] }),
      ...asaasCard({ deleted: true, payments: () => [asaasPayment('REFUNDED')] }),
      ...b3.answers,
    });
    const h3 = createAssinaturaWebHandler({ config: sandbox, fetch: unmarked.fetcher, now: () => NOW });
    expect(JSON.parse((await h3(appReq({ action: 'desistir' }))).body)).toMatchObject({ result: 'recebida', requestedAt: REQUESTED });
    expect(b3.finished).toEqual([{ p_person: ANA, p_provider: 'web', p_purchase_hash: sha256Hex(SUB), p_refunded: true }]);
    expect(unmarked.sent.some((s) => s.url.includes('/refund'))).toBe(false);
  });

  it('falha do Asaas: o pedido continua gravado com a hora, a resposta é neutra; a devolução sem resposta clara segura a trava, a recusa clara a solta', async () => {
    let refundStatus = 503;
    let current = 'CONFIRMED';
    const b = bank();
    const net = fakeNet({
      ...user(),
      ...options({ web: [webCandidate()] }),
      ...asaasCard({ deleted: true, payments: () => [asaasPayment(current)] }),
      [`POST /v3/payments/${PAY}/refund`]: () => ({ status: refundStatus, body: { errors: [{ code: 'x' }] } }),
      [`GET /v3/payments/${PAY}`]: () => ({ status: 200, body: asaasPayment(current) }),
      ...b.answers,
    });
    const h = createAssinaturaWebHandler({ config: sandbox, fetch: net.fetcher, now: () => NOW });
    // 5xx no pedido de devolução: não se sabe se devolveu; a trava fica (p_unclear, 5 minutos no banco) e a pessoa vê a hora do pedido.
    let res = await h(appReq({ action: 'desistir' }));
    expect([res.status, JSON.parse(res.body)]).toEqual([503, { result: 'tente_de_novo', requestedAt: REQUESTED }]);
    expect(b.finished.at(-1)).toEqual({ p_person: ANA, p_provider: 'web', p_purchase_hash: sha256Hex(SUB), p_refunded: false, p_unclear: true });
    // Recusa (400) com a cobrança ainda paga: nada feito, a mesma resposta neutra, e a trava sai na hora.
    refundStatus = 400;
    res = await h(appReq({ action: 'desistir' }));
    expect([res.status, JSON.parse(res.body)]).toEqual([503, { result: 'tente_de_novo', requestedAt: REQUESTED }]);
    expect(b.finished.at(-1)).toEqual({ p_person: ANA, p_provider: 'web', p_purchase_hash: sha256Hex(SUB), p_refunded: false, p_unclear: false });
    // Recusa porque a tentativa anterior já devolveu: a cobrança relida está devolvida, e conta como feita.
    current = 'CONFIRMED';
    net.sent.length = 0;
    const once = fakeNet({
      ...user(),
      ...options({ web: [webCandidate()] }),
      ...asaasCard({ deleted: true, payments: () => [asaasPayment('CONFIRMED')] }),
      [`POST /v3/payments/${PAY}/refund`]: () => ({ status: 400, body: { errors: [{ code: 'invalid_action' }] } }),
      [`GET /v3/payments/${PAY}`]: () => ({ status: 200, body: asaasPayment('REFUNDED') }),
      ...bank().answers,
    });
    const h2 = createAssinaturaWebHandler({ config: sandbox, fetch: once.fetcher, now: () => NOW });
    expect(JSON.parse((await h2(appReq({ action: 'desistir' }))).body)).toMatchObject({ result: 'recebida' });
    expect(once.calls('/refund').length).toBe(1);
    // A assinatura já removida (quem cancelou e depois desistiu, ou a tentativa anterior): não se remove de novo.
    expect(once.sent.some((s) => s.method === 'DELETE')).toBe(false);
  });

  it('"desistir" antes da primeira cobrança (assinou no teste): "nada_cobrado"; fora do prazo: "fora_do_prazo"; sem nada: "sem_compra"', async () => {
    const cases: [unknown[], string][] = [
      [[asaasPayment('PENDING', { dueDate: '2026-12-09', confirmedDate: null })], 'nada_cobrado'],
      [[asaasPayment('CONFIRMED', { dueDate: '2026-11-19', confirmedDate: '2026-11-19' })], 'fora_do_prazo'],
    ];
    for (const [payments, result] of cases) {
      const b = bank();
      const net = fakeNet({ ...user(), ...options({ web: [webCandidate()] }), ...asaasCard({ payments: () => payments }), ...b.answers });
      const h = createAssinaturaWebHandler({ config: sandbox, fetch: net.fetcher, now: () => NOW });
      expect(JSON.parse((await h(appReq({ action: 'desistir' }))).body), result).toEqual({ result });
      expect(b.begun).toEqual([]);
      expect(net.sent.some((s) => s.method === 'DELETE' || s.url.includes('/refund'))).toBe(false);
    }
    const h = createAssinaturaWebHandler({ config: sandbox, fetch: fakeNet({ ...user(), ...options() }).fetcher, now: () => NOW });
    expect(JSON.parse((await h(appReq({ action: 'desistir' }))).body)).toEqual({ result: 'sem_compra' });
  });

  it('Pix sem a referência na cobrança: acha a cobrança da pessoa pelos dias que o banco diz (e o resumo), devolve o integral por Pix e não remove nada; com várias páginas, segue até achar', async () => {
    const row = { payment_hash: sha256Hex(PIX), plan: 'familiar', period: 'anual', paid_on: '2026-11-27', starts_on: null, access_after: afterTeste };
    const other = (i: number) => ({ id: `pay_outra_${i}`, status: 'RECEIVED', billingType: 'PIX', value: 29.9, paymentDate: '2026-11-27' });
    const b = bank();
    const logs: string[] = [];
    const net = fakeNet({
      ...user(),
      ...options({ pix: [row] }),
      'GET /v3/payments': (_init, url) => ({
        status: 200,
        body: url.includes('externalReference=')
          ? { data: [], hasMore: false }
          : url.includes('offset=0')
            ? { data: [other(1), other(2)], hasMore: true }
            : { data: [other(3), { id: PIX, status: 'RECEIVED', billingType: 'PIX', value: 629.9, paymentDate: '2026-11-27' }], hasMore: false },
      }),
      [`POST /v3/payments/${PIX}/refund`]: () => ({ status: 200, body: { id: PIX, status: 'REFUND_IN_PROGRESS' } }),
      ...b.answers,
    });
    const h = createAssinaturaWebHandler({ config: sandbox, fetch: net.fetcher, now: () => NOW, log: (m) => logs.push(m) });
    expect(JSON.parse((await h(appReq({ action: 'desistencia' }))).body)).toEqual({
      result: 'pode',
      meio: 'pix',
      plan: 'familiar',
      period: 'anual',
      amountCents: 62990,
      lastDay: '2026-12-04',
      after: { status: 'teste', until: '2026-12-09T15:00:00+00:00', provider: null },
    });
    expect(net.calls('/v3/payments?').map((s) => s.url.replace(ASAAS_SANDBOX_URL, ''))).toEqual([
      `/payments?externalReference=${encodeURIComponent(`clarevo-pix:${ANA}:familiar:anual`)}&limit=100`,
      '/payments?billingType=PIX&paymentDate%5Bge%5D=2026-11-26&paymentDate%5Ble%5D=2026-11-28&limit=100&offset=0',
      '/payments?billingType=PIX&paymentDate%5Bge%5D=2026-11-26&paymentDate%5Ble%5D=2026-11-28&limit=100&offset=100',
    ]);
    // O registro diz que a busca pelos dias foi usada, só com contagens (nenhum identificador de ninguém).
    expect(logs).toEqual(['desistência: 1 pagamento(s) de Pix sem a referência na cobrança do Asaas; 1 achado(s) pelos dias de pagamento, em 2 página(s)']);
    expect(logs.join(' ')).not.toContain(ANA);
    const res = await h(appReq({ action: 'desistir' }));
    expect(JSON.parse(res.body)).toMatchObject({ result: 'recebida', meio: 'pix', amountCents: 62990 });
    // Só a cobrança da pessoa volta; nenhuma das outras, nenhuma assinatura removida.
    expect(net.calls('/refund').map((s) => s.url)).toEqual([`${ASAAS_SANDBOX_URL}/payments/${PIX}/refund`]);
    expect(net.sent.some((s) => s.method === 'DELETE')).toBe(false);
    expect(b.begun).toEqual([{ p_person: ANA, p_provider: 'pix', p_purchase_hash: sha256Hex(PIX), p_plan: 'familiar', p_period: 'anual', p_amount_cents: 62990, p_contracted_on: '2026-11-27' }]);
  });

  it('o banco sem a migração 0050 (a função não existe): indisponível, sem chamar o Asaas; conta excluída: 401', async () => {
    const missing = fakeNet({ ...user(), 'POST /rest/v1/rpc/billing_withdrawal_options': () => ({ status: 404, body: { code: 'PGRST202' } }) });
    const logs: string[] = [];
    const h = createAssinaturaWebHandler({ config: sandbox, fetch: missing.fetcher, now: () => NOW, log: (m) => logs.push(m) });
    expect([(await h(appReq({ action: 'desistencia' }))).status]).toEqual([503]);
    expect(missing.sent.some((s) => s.url.includes('asaas'))).toBe(false);
    expect(logs.join(' ')).not.toContain(ANA);
    const gone = fakeNet({ ...user(), 'POST /rest/v1/rpc/billing_withdrawal_options': () => ({ status: 200, body: { result: 'sem_pessoa' } }) });
    const h2 = createAssinaturaWebHandler({ config: sandbox, fetch: gone.fetcher, now: () => NOW });
    expect((await h2(appReq({ action: 'desistir' }))).status).toBe(401);
  });

  it('depois da desistência, o aviso de estorno do Asaas tira o período pago na hora (o caminho de sempre): cartão e Pix', async () => {
    // Cartão: a assinatura removida e a única cobrança estornada: billing_apply com o fim do direito no agora (sem tolerância, sem janela).
    const applied: Record<string, unknown>[] = [];
    const card = fakeNet({
      [`GET /v3/subscriptions/${SUB}`]: () => ({ status: 200, body: { id: SUB, status: 'INACTIVE', deleted: true, cycle: 'YEARLY', externalReference: webReference(ANA, 'individual'), dateCreated: '2026-11-27' } }),
      'GET /v3/payments': () => ({ status: 200, body: { data: [asaasPayment('REFUNDED', { value: 269.9 })] } }),
      'POST /rest/v1/rpc/billing_apply': (init) => {
        applied.push(JSON.parse(init.body ?? '{}'));
        return { status: 200, body: { result: 'aplicado' } };
      },
    });
    const h = createAssinaturaWebHandler({ config: sandbox, fetch: card.fetcher, now: () => NOW });
    const hook = (payload: unknown) => ({ method: 'POST', header: (n: string) => (n.toLowerCase() === 'asaas-access-token' ? TOKEN : null), body: async () => JSON.stringify(payload) });
    const res = await h(hook({ id: 'evt_estorno', event: 'PAYMENT_REFUNDED', dateCreated: '2026-11-27 12:01:00', payment: { id: PAY, status: 'REFUNDED', subscription: SUB } }));
    expect(JSON.parse(res.body)).toEqual({ received: true, outcome: 'aplicado' });
    expect(applied).toHaveLength(1);
    expect(applied[0]).toMatchObject({ p_provider: 'web', p_person: ANA, p_external_ref: sha256Hex(SUB), p_valid_until: NOW.toISOString(), p_period: 'anual' });
    expect(applied[0]).not.toHaveProperty('p_valid_from');
    // Pix: a cobrança devolvida vai ao banco sem o dia pago, e o banco recalcula (volta ao teste ou só ver e exportar, migração 0050, teste 5).
    const pix: Record<string, unknown>[] = [];
    const pixNet = fakeNet({
      [`GET /v3/payments/${PIX}`]: () => ({ status: 200, body: { id: PIX, status: 'REFUND_IN_PROGRESS', billingType: 'PIX', externalReference: `clarevo-pix:${ANA}:familiar:anual`, value: 629.9 } }),
      'POST /rest/v1/rpc/billing_pix_apply': (init) => {
        pix.push(JSON.parse(init.body ?? '{}'));
        return { status: 200, body: { result: 'aplicado' } };
      },
    });
    const h2 = createAssinaturaWebHandler({ config: sandbox, fetch: pixNet.fetcher, now: () => NOW });
    await h2(hook({ id: 'evt_pix_estorno', event: 'PAYMENT_REFUND_IN_PROGRESS', dateCreated: '2026-11-27 12:01:00', payment: { id: PIX, status: 'REFUND_IN_PROGRESS' } }));
    expect(pix).toEqual([expect.objectContaining({ p_person: ANA, p_plan: 'familiar', p_payment_hash: sha256Hex(PIX), p_paid_on: null, p_period: 'anual' })]);
  });

  it('a função gerada leva o interruptor e a desistência, e nenhum texto da tela', () => {
    const src = readFileSync(join(__dirname, '../../../supabase/functions/assinatura-web/index.ts'), 'utf8');
    expect(src).toContain('WITHDRAWAL_OPEN = false');
    expect(src).toContain('billing_withdrawal_begin');
    expect(src).toContain('includeDeleted=true');
    expect(src).not.toContain(WEB_WITHDRAWAL_TEXT.action);
    expect(src).not.toContain('PENDENTES DA REVISÃO');
  });
});

describe('Desistência em 7 dias: revisão independente de 27/11/2026', () => {
  // A compra de 20/11: o último dia é 27/11 (até 04h59 UTC de 28/11, a meia-noite no Acre). 28/11 às 06h UTC: 01h no Acre, o 8º dia.
  const LATE = new Date('2026-11-28T06:00:00.000Z');
  const cardPay = (status: string, extra: Record<string, unknown> = {}) => asaasPayment(status, { dueDate: '2026-11-20', confirmedDate: '2026-11-20', ...extra });
  const pedida = (provider: 'web' | 'pix', id: string, extra: Record<string, unknown> = {}) => ({
    provider,
    purchase_hash: sha256Hex(id),
    status: 'pedida',
    requested_at: '2026-11-28T02:50:00.000Z',
    amount_cents: 2990,
    contracted_on: '2026-11-20',
    ...extra,
  });
  const hook = (payload: unknown) => ({ method: 'POST', header: (n: string) => (n.toLowerCase() === 'asaas-access-token' ? TOKEN : null), body: async () => JSON.stringify(payload) });

  it('regras: o pedido gravado no prazo (recorded) continua depois dele, no cartão e no Pix; sem pedido, o prazo vale', () => {
    expect(withinWithdrawal('2026-11-20', new Date('2026-11-28T04:59:00.000Z'))).toBe(true);
    expect(cardWithdrawal([pay('2026-11-20')], LATE)).toEqual({ state: 'fora_do_prazo', startDay: '2026-11-20' });
    expect(cardWithdrawal([pay('2026-11-20')], LATE, true)).toMatchObject({ state: 'pode', startDay: '2026-11-20', amountCents: 2990 });
    expect(cardWithdrawal([pay('2026-11-20', 'REFUND_IN_PROGRESS')], LATE, true)).toEqual({ state: 'devolvida', startDay: '2026-11-20' });
    expect(cardWithdrawal([pay('2026-12-09', 'PENDING')], LATE, true)).toEqual({ state: 'nada_cobrado' });
    const p = pay('2026-11-20', 'RECEIVED', { id: PIX, subscription: null, billingType: 'PIX' });
    expect(pixWithdrawal({ paidOn: '2026-11-20', startsOn: null }, p, LATE)).toEqual({ state: 'fora_do_prazo', startDay: '2026-11-20' });
    expect(pixWithdrawal({ paidOn: '2026-11-20', startsOn: null }, p, LATE, true)).toMatchObject({ state: 'pode', startDay: '2026-11-20' });
    expect(pixWithdrawal({ paidOn: '2026-11-20', startsOn: null }, { ...p, deleted: true }, LATE, true)).toEqual({ state: 'sem_compra' });
  });

  it('o estorno que ficou sem resposta no 7º dia: no dia seguinte, a repetição relê a cobrança e conclui a devolução (não "fora_do_prazo")', async () => {
    const b = bank({ result: 'retomar', requested_at: '2026-11-28T02:50:00.000Z' });
    const net = fakeNet({
      ...user(),
      ...options({ web: [webCandidate()], withdrawals: [pedida('web', SUB)] }),
      // A assinatura já removida na tentativa de antes; a cobrança ainda paga.
      ...asaasCard({ deleted: true, status: 'INACTIVE', payments: () => [cardPay('CONFIRMED')] }),
      [`GET /v3/payments/${PAY}`]: () => ({ status: 200, body: cardPay('CONFIRMED') }),
      [`POST /v3/payments/${PAY}/refund`]: () => ({ status: 200, body: { id: PAY, status: 'REFUNDED' } }),
      ...b.answers,
    });
    const h = createAssinaturaWebHandler({ config: sandbox, fetch: net.fetcher, now: () => LATE });
    // A leitura continua oferecendo (o último dia é o de verdade, 27/11).
    expect(JSON.parse((await h(appReq({ action: 'desistencia' }))).body)).toMatchObject({ result: 'pode', meio: 'cartao', lastDay: '2026-11-27', amountCents: 2990 });
    const res = await h(appReq({ action: 'desistir' }));
    expect([res.status, JSON.parse(res.body)]).toEqual([200, { result: 'recebida', meio: 'cartao', requestedAt: '2026-11-28T02:50:00.000Z', amountCents: 2990, after: { status: 'leitura', until: '2026-11-10T15:00:00+00:00', provider: null } }]);
    const asaasCalls = net.sent.filter((x) => x.url.includes('asaas') && !x.url.includes('/subscriptions')).map((x) => `${x.method} ${x.url.replace(ASAAS_SANDBOX_URL, '').replace(/\?.*$/, '')}`);
    // Na repetição, a própria cobrança é relida antes do pedido de devolução; nada de remover a assinatura de novo.
    expect(asaasCalls.slice(-3)).toEqual(['GET /payments', `GET /payments/${PAY}`, `POST /payments/${PAY}/refund`]);
    expect(net.sent.some((x) => x.method === 'DELETE')).toBe(false);
    expect(b.finished).toEqual([{ p_person: ANA, p_provider: 'web', p_purchase_hash: sha256Hex(SUB), p_refunded: true }]);
  });

  it('a repetição que acha a cobrança já devolvida ao reler (a tentativa sem resposta deu certo): conclui sem pedir outra devolução', async () => {
    const b = bank({ result: 'retomar', requested_at: REQUESTED });
    const net = fakeNet({
      ...user(),
      ...options({ web: [webCandidate()], withdrawals: [pedida('web', SUB, { requested_at: REQUESTED })] }),
      // A lista ainda mostra a cobrança paga; a leitura da própria cobrança já mostra a devolução em andamento.
      ...asaasCard({ deleted: true, status: 'INACTIVE', payments: () => [asaasPayment('CONFIRMED')] }),
      [`GET /v3/payments/${PAY}`]: () => ({ status: 200, body: asaasPayment('REFUND_IN_PROGRESS') }),
      [`POST /v3/payments/${PAY}/refund`]: () => ({ status: 200, body: {} }),
      ...b.answers,
    });
    const h = createAssinaturaWebHandler({ config: sandbox, fetch: net.fetcher, now: () => NOW });
    expect(JSON.parse((await h(appReq({ action: 'desistir' }))).body)).toMatchObject({ result: 'recebida', requestedAt: REQUESTED });
    expect(net.calls('/refund')).toEqual([]);
    expect(b.finished).toEqual([{ p_person: ANA, p_provider: 'web', p_purchase_hash: sha256Hex(SUB), p_refunded: true }]);
  });

  it('a trava: o pedido de devolução sem resposta (rede, prazo, 5xx) a segura por 5 minutos; a falha antes dele a solta na hora', async () => {
    const cases: { name: string; answers: Record<string, Answer>; begin?: unknown; throwOn?: string; unclear: boolean }[] = [
      { name: 'rede caiu no pedido de devolução', answers: {}, throwOn: `POST /v3/payments/${PAY}/refund`, unclear: true },
      { name: '502 no pedido de devolução', answers: { [`POST /v3/payments/${PAY}/refund`]: () => ({ status: 502, body: 'bad gateway' }) }, unclear: true },
      {
        name: 'a remoção da assinatura falhou (antes do pedido de devolução)',
        answers: { [`DELETE /v3/subscriptions/${SUB}`]: () => ({ status: 503, body: {} }), [`POST /v3/payments/${PAY}/refund`]: () => ({ status: 200, body: {} }) },
        unclear: false,
      },
      {
        name: 'a releitura da cobrança na repetição falhou (antes do pedido de devolução)',
        begin: { result: 'retomar', requested_at: REQUESTED },
        answers: { [`GET /v3/payments/${PAY}`]: () => ({ status: 500, body: {} }), [`POST /v3/payments/${PAY}/refund`]: () => ({ status: 200, body: {} }) },
        unclear: false,
      },
    ];
    for (const c of cases) {
      const b = bank(c.begin);
      const net = fakeNet({ ...user(), ...options({ web: [webCandidate()] }), ...asaasCard({ payments: () => [asaasPayment('CONFIRMED')] }), ...c.answers, ...b.answers });
      const fetcher: HttpFetch = async (url, init) => {
        if (c.throwOn && `${init.method} ${url.replace(/^https:\/\/[^/]+/, '')}` === c.throwOn) throw new Error('rede');
        return net.fetcher(url, init);
      };
      const h = createAssinaturaWebHandler({ config: sandbox, fetch: fetcher, now: () => NOW });
      const res = await h(appReq({ action: 'desistir' }));
      expect([res.status, JSON.parse(res.body)], c.name).toEqual([503, { result: 'tente_de_novo', requestedAt: REQUESTED }]);
      expect(b.finished, c.name).toEqual([{ p_person: ANA, p_provider: 'web', p_purchase_hash: sha256Hex(SUB), p_refunded: false, p_unclear: c.unclear }]);
      if (!c.unclear) expect(net.calls('/refund'), c.name).toEqual([]);
    }
  });

  it('Pix: acha a cobrança pela referência do Checkout de Pix da pessoa (a do mês, sem o período), sem varrer os dias de pagamento', async () => {
    const row = { payment_hash: sha256Hex(PIX), plan: 'individual', period: 'mensal', paid_on: '2026-11-27', starts_on: null, access_after: afterLeitura };
    const logs: string[] = [];
    const net = fakeNet({
      ...user(),
      ...options({ pix: [row] }),
      'GET /v3/payments': (_init, url) => ({
        status: 200,
        body: url.includes('externalReference=')
          ? { data: [{ id: 'pay_outra', status: 'RECEIVED', billingType: 'PIX', value: 29.9 }, { id: PIX, status: 'RECEIVED', billingType: 'PIX', value: 29.9, externalReference: `clarevo-pix:${ANA}:individual` }], hasMore: false }
          : { data: [], hasMore: false },
      }),
    });
    const h = createAssinaturaWebHandler({ config: sandbox, fetch: net.fetcher, now: () => NOW, log: (m) => logs.push(m) });
    expect(JSON.parse((await h(appReq({ action: 'desistencia' }))).body)).toMatchObject({ result: 'pode', meio: 'pix', plan: 'individual', period: 'mensal', amountCents: 2990, lastDay: '2026-12-04' });
    expect(net.calls('/v3/payments?').map((x) => x.url.replace(ASAAS_SANDBOX_URL, ''))).toEqual([`/payments?externalReference=${encodeURIComponent(`clarevo-pix:${ANA}:individual`)}&limit=100`]);
    expect(logs).toEqual([]);
  });

  it('Pix já devolvido pelo aviso de estorno (sem o dia pago no banco), com o pedido ainda "pedida": a repetição acha a devolução e marca; a leitura confirma sem gravar', async () => {
    const row = { payment_hash: sha256Hex(PIX), plan: 'individual', period: 'mensal', paid_on: null, starts_on: null, access_after: afterLeitura };
    const opts = { pix: [row], withdrawals: [pedida('pix', PIX, { requested_at: REQUESTED, contracted_on: '2026-11-27' })] };
    expect(parseWithdrawalOptions({ result: 'ok', web: [], ...opts })).toMatchObject({ pix: [{ paymentHash: sha256Hex(PIX), paidOn: null }] });
    const b = bank();
    const net = fakeNet({
      ...user(),
      ...options(opts),
      'GET /v3/payments': () => ({ status: 200, body: { data: [{ id: PIX, status: 'REFUNDED', billingType: 'PIX', value: 29.9 }], hasMore: false } }),
      ...b.answers,
    });
    const h = createAssinaturaWebHandler({ config: sandbox, fetch: net.fetcher, now: () => LATE });
    const receipt = { result: 'recebida', meio: 'pix', requestedAt: REQUESTED, amountCents: 2990, after: { status: 'leitura', until: '2026-11-10T15:00:00+00:00', provider: null } };
    expect(JSON.parse((await h(appReq({ action: 'desistencia' }))).body)).toEqual(receipt);
    expect(b.finished).toEqual([]);
    expect(JSON.parse((await h(appReq({ action: 'desistir' }))).body)).toEqual(receipt);
    expect(b.begun).toEqual([]);
    expect(b.finished).toEqual([{ p_person: ANA, p_provider: 'pix', p_purchase_hash: sha256Hex(PIX), p_refunded: true }]);
    expect(net.calls('/refund')).toEqual([]);
  });

  it('o aviso de estorno do Asaas marca o pedido de desistência como devolvido (cartão e Pix), só com a cobrança já estornada, e nunca falha o aviso', async () => {
    const finished: Record<string, unknown>[] = [];
    let finishAnswer: () => { status: number; body: unknown } = () => ({ status: 200, body: { result: 'devolvida' } });
    let current = 'REFUNDED';
    const net = fakeNet({
      [`GET /v3/subscriptions/${SUB}`]: () => ({ status: 200, body: { id: SUB, status: 'INACTIVE', deleted: true, cycle: 'MONTHLY', externalReference: webReference(ANA, 'individual'), dateCreated: '2026-11-27' } }),
      'GET /v3/payments': () => ({ status: 200, body: { data: [asaasPayment(current)] } }),
      [`GET /v3/payments/${PIX}`]: () => ({ status: 200, body: { id: PIX, status: current === 'REFUNDED' ? 'REFUND_IN_PROGRESS' : current, billingType: 'PIX', externalReference: `clarevo-pix:${ANA}:individual`, value: 29.9 } }),
      'POST /rest/v1/rpc/billing_apply': () => ({ status: 200, body: { result: 'aplicado' } }),
      'POST /rest/v1/rpc/billing_pix_apply': () => ({ status: 200, body: { result: 'aplicado' } }),
      'POST /rest/v1/rpc/billing_withdrawal_finish': (init) => {
        finished.push(JSON.parse(init.body ?? '{}'));
        return finishAnswer();
      },
    });
    const logs: string[] = [];
    const h = createAssinaturaWebHandler({ config: sandbox, fetch: net.fetcher, now: () => NOW, log: (m) => logs.push(m) });
    const card = (event: string, id = 'evt_c') => hook({ id, event, dateCreated: '2026-11-27 12:01:00', payment: { id: PAY, status: current, subscription: SUB } });
    const pixHook = (event: string, id = 'evt_p') => hook({ id, event, dateCreated: '2026-11-27 12:01:00', payment: { id: PIX, status: current } });
    expect(JSON.parse((await h(card('PAYMENT_REFUNDED'))).body)).toEqual({ received: true, outcome: 'aplicado' });
    expect(JSON.parse((await h(pixHook('PAYMENT_REFUND_IN_PROGRESS'))).body)).toEqual({ received: true, outcome: 'aplicado' });
    expect(finished).toEqual([
      { p_person: ANA, p_provider: 'web', p_purchase_hash: sha256Hex(SUB), p_refunded: true },
      { p_person: ANA, p_provider: 'pix', p_purchase_hash: sha256Hex(PIX), p_refunded: true },
    ]);
    // Sem pedido ('sem_pedido'), sem a migração 0050 (404), o banco com erro ou fora do ar: o aviso continua aplicado (200).
    for (const answer of [() => ({ status: 200, body: { result: 'sem_pedido' } }), () => ({ status: 404, body: {} }), () => ({ status: 500, body: {} })]) {
      finishAnswer = answer;
      expect(JSON.parse((await h(card('PAYMENT_REFUNDED', `evt_${finished.length}`))).body).outcome).toBe('aplicado');
    }
    const down: HttpFetch = async (url, init) => {
      if (url.includes('billing_withdrawal_finish')) throw new Error('rede');
      return net.fetcher(url, init);
    };
    const h2 = createAssinaturaWebHandler({ config: sandbox, fetch: down, now: () => NOW, log: (m) => logs.push(m) });
    expect(await h2(pixHook('PAYMENT_REFUNDED', 'evt_down')).then((r) => [r.status, JSON.parse(r.body).outcome])).toEqual([200, 'aplicado']);
    // Outro aviso, ou o aviso de estorno com a cobrança paga de novo no Asaas (estorno negado): nada é marcado.
    const before = finished.length;
    await h(card('PAYMENT_RECEIVED', 'evt_recebida'));
    current = 'RECEIVED';
    await h(card('PAYMENT_REFUNDED', 'evt_negado_c'));
    await h(pixHook('PAYMENT_REFUND_IN_PROGRESS', 'evt_negado_p'));
    expect(finished.length).toBe(before);
    expect(logs.join(' ')).not.toContain(ANA);
  });

  it('o pedido abandonado pela equipe não volta para a tela: a leitura não oferece, e "desistir" responde "sem_compra" sem pedir nada', async () => {
    const b = bank();
    const net = fakeNet({
      ...user(),
      ...options({ web: [webCandidate()], withdrawals: [pedida('web', SUB, { status: 'abandonada', requested_at: REQUESTED })] }),
      ...asaasCard({ payments: () => [asaasPayment('CONFIRMED')] }),
      ...b.answers,
    });
    const h = createAssinaturaWebHandler({ config: sandbox, fetch: net.fetcher, now: () => NOW });
    expect(JSON.parse((await h(appReq({ action: 'desistencia' }))).body)).toEqual({ result: 'sem_direito' });
    expect(JSON.parse((await h(appReq({ action: 'desistir' }))).body)).toEqual({ result: 'sem_compra' });
    expect(b.begun).toEqual([]);
    // Abandonado entre a leitura e o pedido: o banco responde "encerrada".
    const b2 = bank({ result: 'encerrada', requested_at: REQUESTED });
    const net2 = fakeNet({ ...user(), ...options({ web: [webCandidate()] }), ...asaasCard({ payments: () => [asaasPayment('CONFIRMED')] }), ...b2.answers });
    const h2 = createAssinaturaWebHandler({ config: sandbox, fetch: net2.fetcher, now: () => NOW });
    expect(JSON.parse((await h2(appReq({ action: 'desistir' }))).body)).toEqual({ result: 'sem_compra' });
    expect(net2.sent.some((x) => x.method === 'DELETE' || x.url.includes('/refund'))).toBe(false);
  });

  it('o texto de muitas tentativas diz a regra (20 tentativas por pedido, sem prazo de espera)', () => {
    expect(WEB_WITHDRAWAL_TEXT.errors.muitas_tentativas).toBe('Este pedido de desistência já teve muitas tentativas pela tela. Escreva para suporte@clarevo.app.br para concluir a devolução.');
  });
});

describe('Desistência em 7 dias: o que o app usa (textos pendentes do advogado, pergunta 64)', () => {
  const offer: WebWithdrawalOffer = { result: 'pode', meio: 'cartao', plan: 'individual', period: 'anual', amountCents: 26990, lastDay: '2026-12-04', after: { status: 'leitura', until: null, provider: null } };
  const access = (status: Access['status'], provider: Access['provider']): Access => ({ status, plan: 'individual', until: null, canWrite: status !== 'leitura', provider });

  it('só a compra pela web (cartão ou Pix) pode ter o botão; nas lojas, a nota do reembolso pela loja; nas outras situações, nada', () => {
    expect(withdrawalMayApply(access('assinatura', 'web'))).toBe(true);
    expect(withdrawalMayApply(access('assinatura', 'pix'))).toBe(true);
    for (const provider of ['apple', 'google', 'equipe'] as const) expect(withdrawalMayApply(access('assinatura', provider)), provider).toBe(false);
    for (const status of ['teste', 'leitura', 'familia', 'beneficio', 'cortesia', 'pre_lancamento'] as const) expect(withdrawalMayApply(access(status, null)), status).toBe(false);
    expect(storeRefundNoteApplies(access('assinatura', 'apple'))).toBe(true);
    expect(storeRefundNoteApplies(access('assinatura', 'google'))).toBe(true);
    expect(storeRefundNoteApplies(access('assinatura', 'web'))).toBe(false);
  });

  it('lê as respostas da função; qualquer outra coisa esconde o botão ou vira "tente de novo"', () => {
    expect(parseWebWithdrawalState({ result: 'pode', meio: 'cartao', plan: 'individual', period: 'anual', amountCents: 26990, lastDay: '2026-12-04', after: { status: 'leitura', until: null, provider: null } })).toEqual(offer);
    expect(parseWebWithdrawalState({ result: 'pode', meio: 'boleto', plan: 'individual', amountCents: 1, lastDay: '2026-12-04' })).toBeNull();
    expect(parseWebWithdrawalState({ result: 'pode', meio: 'pix', plan: 'individual', amountCents: 0, lastDay: '2026-12-04' })).toBeNull();
    expect(parseWebWithdrawalState({ result: 'sem_direito' })).toEqual({ result: 'sem_direito' });
    expect(parseWebWithdrawalState({ result: 'indisponivel' })).toBeNull();
    expect(parseWebWithdrawalState(null)).toBeNull();
    expect(parseWebWithdrawalState({ result: 'recebida', meio: 'pix', requestedAt: REQUESTED, amountCents: 2990, after: null })).toEqual({ result: 'recebida', meio: 'pix', requestedAt: REQUESTED, amountCents: 2990, after: null });
    expect(parseWebWithdrawalResult({ result: 'recebida', meio: 'cartao', requestedAt: REQUESTED, amountCents: 2990 })).toEqual({ result: 'recebida', meio: 'cartao', requestedAt: REQUESTED, amountCents: 2990, after: null });
    expect(parseWebWithdrawalResult({ result: 'tente_de_novo', requestedAt: REQUESTED })).toEqual({ result: 'tente_de_novo', requestedAt: REQUESTED });
    expect(parseWebWithdrawalResult({ result: 'nada_cobrado' })).toEqual({ result: 'nada_cobrado' });
    expect(parseWebWithdrawalResult({ result: 'recebida' })).toEqual({ result: 'tente_de_novo', requestedAt: null });
    expect(parseWebWithdrawalResult('lixo')).toEqual({ result: 'tente_de_novo', requestedAt: null });
  });

  it('o diálogo diz o que acontece: a devolução integral no mesmo meio, no cartão o prazo do estorno e o cancelamento, o acesso depois e quando muda', () => {
    expect(withdrawalConfirmLines(offer, 'America/Sao_Paulo')).toEqual([
      'A Clarevo devolve o valor integral, R$ 269,90, no mesmo cartão usado na compra.',
      'O estorno aparece na fatura do cartão no prazo do banco ou da administradora do cartão, que não depende da Clarevo.',
      'A assinatura é cancelada na hora, e nada mais é cobrado.',
      'Depois, a conta fica só para ver e exportar, com os seus dados guardados.',
      'A situação muda nesta tela em alguns minutos, quando o Asaas confirmar a devolução.',
    ]);
    expect(withdrawalConfirmLines({ ...offer, meio: 'pix', amountCents: 2990, after: { status: 'teste', until: '2026-12-09T15:00:00.000Z', provider: null } }, 'America/Sao_Paulo')).toEqual([
      'A Clarevo devolve o valor integral, R$ 29,90, por Pix, para a conta de onde saiu o pagamento.',
      'Depois, a conta volta ao teste grátis, que vai até 09/12/2026.',
      'A situação muda nesta tela em alguns minutos, quando o Asaas confirmar a devolução.',
    ]);
    expect(WEB_WITHDRAWAL_TEXT.confirmTitle(26990)).toBe('Desistir e receber R$ 269,90 de volta?');
    expect(WEB_WITHDRAWAL_TEXT.intro('cartao', '04/12/2026', 26990)).toBe(
      'Você pode desistir da assinatura até 04/12/2026 e receber de volta o valor pago, R$ 269,90, como prevê o Código de Defesa do Consumidor (art. 49).',
    );
  });

  it('o acesso depois, com a data no fuso da pessoa: o teste que volta, o período pago antes com Pix (sem a tolerância), só ver e exportar, ou o que a conta já tem', () => {
    const tz = 'America/Sao_Paulo';
    expect(withdrawalAfterText({ status: 'teste', until: '2026-12-09T15:00:00.000Z', provider: null }, tz)).toBe('Depois, a conta volta ao teste grátis, que vai até 09/12/2026.');
    expect(withdrawalAfterText({ status: 'leitura', until: '2026-11-10T15:00:00.000Z', provider: null }, tz)).toBe('Depois, a conta fica só para ver e exportar, com os seus dados guardados.');
    // Pix: o fim do acesso tem 3 dias de tolerância; a tela diz o último dia pago (como "Pago com Pix até").
    expect(withdrawalAfterText({ status: 'assinatura', until: '2026-12-31T02:59:59.999Z', provider: 'pix' }, tz)).toBe('O período pago antes continua valendo: o acesso completo vai até 27/12/2026.');
    expect(withdrawalAfterText({ status: 'pre_lancamento', until: null, provider: null }, tz)).toBe('Depois, o acesso continua completo e sem cobrança, como antes de assinar.');
    expect(withdrawalAfterText({ status: 'familia', until: null, provider: null }, tz)).toBe('Depois, o acesso completo continua pelo Plano Família da sua Família.');
    expect(withdrawalAfterText(null, tz)).toBe('Depois, a conta volta ao teste grátis, se ainda houver dias dele, ou fica só para ver e exportar, com os seus dados guardados.');
  });

  it('a confirmação na hora, com a data e a hora do pedido no fuso da pessoa, a devolução, o acesso depois, quando a situação muda e a quem escrever', () => {
    expect(withdrawalReceiptLines({ result: 'recebida', meio: 'cartao', requestedAt: '2026-11-27T17:05:00.000Z', amountCents: 26990, after: { status: 'leitura', until: null, provider: null } }, 'America/Sao_Paulo')).toEqual([
      'Pedido de desistência recebido em 27/11/2026 às 14:05.',
      'A devolução de R$ 269,90 foi pedida ao Asaas, no mesmo cartão da compra, e a assinatura foi cancelada. O estorno aparece na fatura no prazo do banco ou da administradora do cartão.',
      'Depois, a conta fica só para ver e exportar, com os seus dados guardados.',
      'A situação muda nesta tela em alguns minutos, quando o Asaas confirmar a devolução.',
      'Se tiver alguma dúvida sobre a devolução, escreva para suporte@clarevo.app.br.',
    ]);
    expect(withdrawalReceiptLines({ result: 'recebida', meio: 'pix', requestedAt: '2026-11-27T17:05:00.000Z', amountCents: null, after: null }, 'America/Manaus')[0]).toBe('Pedido de desistência recebido em 27/11/2026 às 13:05.');
    expect(WEB_WITHDRAWAL_TEXT.errors.tente_de_novo('27/11/2026 às 14:05')).toBe(
      'O pedido de desistência ficou registrado em 27/11/2026 às 14:05, mas a devolução não foi concluída agora. Tente de novo em instantes; se continuar assim, escreva para suporte@clarevo.app.br.',
    );
    expect([WEB_WITHDRAWAL_TEXT.heroEyebrow, WEB_WITHDRAWAL_TEXT.heroBody]).toEqual([
      'Desistência pedida',
      'A desistência foi pedida, e a devolução está com o Asaas. A situação muda aqui em alguns minutos.',
    ]);
    expect(WEB_WITHDRAWAL_TEXT.storeRefund).toBe('Nas compras pela App Store ou pelo Google Play, o reembolso é pedido à loja; se ela não atender, escreva para suporte@clarevo.app.br.');
  });

  it('os textos seguem as regras: sem travessão, sem "fazer sentido", sem pressa nem culpa, sem código de decisão', () => {
    const T = WEB_WITHDRAWAL_TEXT;
    const tz = 'America/Sao_Paulo';
    const strings = (v: unknown): string[] => (typeof v === 'string' ? [v] : v && typeof v === 'object' ? Object.values(v).flatMap(strings) : []);
    const texts: string[] = [
      ...strings(T),
      T.intro('pix', '04/12/2026', 2990),
      T.intro('cartao', '04/12/2026', 2990),
      T.confirmTitle(2990),
      T.errors.tente_de_novo(null),
      T.errors.tente_de_novo('27/11/2026 às 14:05'),
      ...withdrawalConfirmLines(offer, tz),
      ...withdrawalConfirmLines({ ...offer, meio: 'pix' }, tz),
      ...withdrawalReceiptLines({ result: 'recebida', meio: 'pix', requestedAt: REQUESTED, amountCents: 2990, after: null }, tz),
      ...withdrawalReceiptLines({ result: 'recebida', meio: 'cartao', requestedAt: REQUESTED, amountCents: null, after: null }, tz),
      ...(['teste', 'leitura', 'assinatura', 'pre_lancamento', 'familia', 'beneficio', 'cortesia'] as const).map((status) =>
        withdrawalAfterText({ status, until: '2026-12-09T15:00:00.000Z', provider: 'pix' }, tz),
      ),
    ];
    expect(texts.length).toBeGreaterThan(30);
    for (const t of texts) {
      expect(t).not.toMatch(/—|–/);
      expect(t).not.toMatch(/fa(z|ç)er? sentido|faz sentido/i);
      expect(t).not.toMatch(/D-\d{3}|certeza|perder|perda|última chance|não perca|aproveite|culpa|sentiremos|pena/i);
      // Linguagem neutra: nada de "obrigado(a)", "bem-vindo(a)" ou "você mesmo(a)".
      expect(t).not.toMatch(/obrigad[oa]|bem-vind[oa]|você mesm[oa]/i);
    }
  });
});
