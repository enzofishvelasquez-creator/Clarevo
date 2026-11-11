/**
 * Assinatura na web pelo Asaas (D-084, fase 2 da D-083): a função do servidor "assinatura-web" (Edge Function do Supabase), gerada
 * num arquivo só por `scripts/gerar-funcoes.js`. Faz duas coisas, pelo mesmo endereço:
 *
 * 1. **Para o app (web), com a sessão da pessoa** (Authorization: Bearer <token da sessão>): "assinar" cria um Checkout recorrente no
 *    Asaas (cartão de crédito, cobrança mensal, primeira cobrança hoje) com a referência da pessoa e devolve o link da página de
 *    pagamento do Asaas; "cancelar" remove no Asaas a assinatura ativa da pessoa (o mês pago continua valendo). A pessoa informa os
 *    dados do cartão e o CPF na página do Asaas: a Clarevo não coleta nem guarda nada disso.
 * 2. **Para o Asaas (avisos, webhooks)**, com o token combinado no cabeçalho `asaas-access-token`: a cada aviso de assinatura ou de
 *    cobrança de assinatura, consulta o estado atual no Asaas (a assinatura e as cobranças dela), calcula até quando o acesso vale e
 *    chama `billing_apply` no banco (idempotente pelo identificador do aviso e na ordem dos eventos). Responde 200 a todo aviso
 *    autenticado que não precisa ser repetido, porque 15 falhas seguidas param a fila do Asaas; só falha passageira responde 500, e
 *    antes de o Asaas desistir (10 segundos): cada pedido tem um prazo e o aviso inteiro tem um orçamento de tempo.
 *
 * Quem é a pessoa: a referência `clarevo:<id da pessoa>:<plano>` vai no Checkout (`externalReference`) e, por garantia, o Checkout fica
 * ligado à pessoa no banco (`billing_checkout_record`, só o resumo SHA-256 do identificador). O aviso traz a assinatura com a
 * referência ou com o identificador do Checkout (`checkoutSession`); sem referência, a função a grava na assinatura do Asaas para as
 * próximas vezes. Assinatura já aplicada antes é achada também pelo resumo dela no banco (`billing_person_by_external_ref`), o que
 * cobre estorno depois de cancelar. Ninguém de fora cria assinatura na conta da Clarevo no Asaas, então a referência é confiável.
 *
 * Até quando vale: o fim do período coberto pela última cobrança paga (vencimento mais um ciclo) e, com a assinatura ativa, mais
 * WEB_GRACE_DAYS de tolerância para a renovação; cancelada, vale até o fim do período pago; estorno ou contestação tira o período da
 * cobrança na hora. Sem cobrança paga, nada vale.
 *
 * Pix mês a mês (D-093, caminho B, docs/39 seção 6): "pix" cria um Checkout do Asaas com Pix avulso (`chargeTypes: DETACHED`) de um mês,
 * com a referência `clarevo-pix:<id da pessoa>:<plano>`; a pessoa informa os dados na página do Asaas. Os avisos de cobrança sem assinatura
 * (`PAYMENT_*`) e o `CHECKOUT_PAID` levam à cobrança atual no Asaas, que acha a pessoa pela referência, pelo Checkout no banco ou pelo
 * pagamento já gravado, e chamam `billing_pix_apply` (só o resumo SHA-256 do identificador da cobrança e o dia do pagamento), que
 * recalcula até quando o acesso vale (origem 'pix'). Pagar o próximo mês só nos últimos PIX_PAY_AHEAD_DAYS dias do mês pago.
 *
 * Segredos (painel do Supabase, Edge Functions, Secrets, só o Enzo): ASAAS_API_KEY (começa com $aact_prod_ em produção e $aact_hmlg_ no
 * sandbox, que define o ambiente) e ASAAS_WEBHOOK_TOKEN (32 a 255 caracteres, inventado, diferente da chave). SUPABASE_URL, a chave de
 * serviço e a chave pública (SUPABASE_PUBLISHABLE_KEY ou SUPABASE_ANON_KEY, usada nas chamadas feitas como a pessoa) o Supabase fornece.
 * Opcional: CLAREVO_APP_URL (padrão https://app.clarevo.app.br), de onde o app chama e para onde o Asaas devolve a pessoa. Nenhum
 * segredo entra no app nem no repositório, e nenhum identificador da pessoa vai para o registro (logs).
 */
import { addDays, addMonthsToDate, todayIn, type IsoDate } from '../dates';
import { PLAN_NAME, PLAN_PRICE_CENTS, type PlanKind } from '../plano-precos';
import { obj, sameText, serviceHeaders, serviceKeyFrom } from '../servidor-comum';
import { sha256Hex, utf8Bytes } from '../sha256';
import { parsePixReference, pixCanPayNext, pixReference } from './pix';

export const ASAAS_PRODUCTION_URL = 'https://api.asaas.com/v3';
export const ASAAS_SANDBOX_URL = 'https://api-sandbox.asaas.com/v3';
/** Prefixos das chaves de API do Asaas por ambiente (documentação "Autentique suas requisições", lida em 06/11/2026). */
export const ASAAS_KEY_PRODUCTION = '$aact_prod_';
export const ASAAS_KEY_SANDBOX = '$aact_hmlg_';
/** O token dos avisos: 32 a 255 caracteres (o Asaas aceita isso; letras, algarismos, _ e -, como os outros segredos da Clarevo). */
export const ASAAS_WEBHOOK_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,255}$/;
export const APP_URL_DEFAULT = 'https://app.clarevo.app.br';
/** Dias de tolerância depois do fim do período pago, com a assinatura ativa (a renovação no cartão pode atrasar). */
export const WEB_GRACE_DAYS = 3;
/** O Checkout do Asaas vale por 60 minutos (o Asaas aceita de 10 a 1440). */
export const CHECKOUT_MINUTES = 60;
export const ASAAS_MAX_BODY_BYTES = 256 * 1024;
export const APP_MAX_BODY_BYTES = 4 * 1024;
/** Orçamento de tempo de um pedido (o Asaas conta como falha a resposta depois de 10 segundos) e o prazo de cada chamada. */
export const REQUEST_BUDGET_MS = 8500;
export const CALL_TIMEOUT_MS = 3000;
/** Só as cobranças com vencimento nos últimos meses interessam (a última paga e as seguintes); evita a página de 100 do Asaas. */
export const PAYMENTS_LOOKBACK_MONTHS = 4;
/** Fuso do Asaas (datas dos avisos e vencimentos): Brasília, sem horário de verão desde 2019. */
export const ASAAS_TIME_ZONE = 'America/Sao_Paulo';
const ASAAS_OFFSET = '-03:00';
/** Situações de cobrança que contam como pagas (a disputa de contestação vencida pela Clarevo continua paga). */
export const PAID_STATUSES: ReadonlySet<string> = new Set(['CONFIRMED', 'RECEIVED', 'RECEIVED_IN_CASH', 'DUNNING_RECEIVED', 'AWAITING_CHARGEBACK_REVERSAL']);
export const PLANS: readonly PlanKind[] = ['individual', 'familiar'];

export interface AssinaturaWebConfig {
  apiKey: string;
  apiBase: string;
  sandbox: boolean;
  webhookToken: string;
  supabaseUrl: string;
  serviceKey: string;
  /** A chave pública do projeto, para as chamadas feitas como a pessoa (com o token da sessão dela); sem ela, a de serviço. */
  userApiKey: string;
  /** Origem do app na web (sem barra no fim): de onde a tela chama e para onde o Asaas devolve a pessoa. */
  appUrl: string;
}

/** Configuração lida dos segredos. null quando falta algum ou a chave não é do Asaas (a função responde 503 e não faz nada). */
export function assinaturaWebConfigFrom(env: (name: string) => string | undefined): AssinaturaWebConfig | null {
  const v = (name: string) => (env(name) ?? '').trim();
  const apiKey = v('ASAAS_API_KEY');
  const sandbox = apiKey.startsWith(ASAAS_KEY_SANDBOX);
  if (!sandbox && !apiKey.startsWith(ASAAS_KEY_PRODUCTION)) return null;
  const webhookToken = v('ASAAS_WEBHOOK_TOKEN');
  if (!ASAAS_WEBHOOK_TOKEN_PATTERN.test(webhookToken) || webhookToken === apiKey) return null;
  const supabaseUrl = v('SUPABASE_URL').replace(/\/+$/, '');
  const serviceKey = serviceKeyFrom(v);
  if (supabaseUrl === '' || serviceKey === '') return null;
  const userApiKey = v('SUPABASE_PUBLISHABLE_KEY') || v('SUPABASE_ANON_KEY') || serviceKey;
  const appUrl = (v('CLAREVO_APP_URL') || APP_URL_DEFAULT).replace(/\/+$/, '');
  if (!/^https:\/\/[a-z0-9.-]+$/.test(appUrl) && !/^http:\/\/localhost(:\d+)?$/.test(appUrl)) return null;
  return { apiKey, apiBase: sandbox ? ASAAS_SANDBOX_URL : ASAAS_PRODUCTION_URL, sandbox, webhookToken, supabaseUrl, serviceKey, userApiKey, appUrl };
}

// ---------------------------------------------------------------------------
// Referência da pessoa e leitura dos objetos do Asaas
// ---------------------------------------------------------------------------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface WebReference {
  personId: string;
  plan: PlanKind;
}

/** `externalReference` do Checkout e da assinatura no Asaas: a pessoa e o plano. Nunca nome nem e-mail. */
export function webReference(personId: string, plan: PlanKind): string {
  return `clarevo:${personId.toLowerCase()}:${plan}`;
}

export function parseWebReference(ref: unknown): WebReference | null {
  if (typeof ref !== 'string') return null;
  const m = /^clarevo:([0-9a-f-]{36}):(individual|familiar)$/i.exec(ref.trim());
  if (!m || !UUID.test(m[1] ?? '')) return null;
  return { personId: (m[1] ?? '').toLowerCase(), plan: m[2] as PlanKind };
}

export interface AsaasSubscription {
  id: string;
  status: string;
  deleted: boolean;
  cycle: string;
  value: number | null;
  nextDueDate: IsoDate | null;
  externalReference: string | null;
  checkoutSession: string | null;
}

export interface AsaasPayment {
  id: string;
  status: string;
  deleted: boolean;
  dueDate: IsoDate | null;
  subscription: string | null;
  /** A referência da Clarevo, quando o Asaas a leva do Checkout para a cobrança (a documentação não garante). */
  externalReference: string | null;
  /** O Checkout que criou a cobrança (cobrança avulsa do Pix). */
  checkoutSession: string | null;
  /** O dia do pagamento: a liquidação no Asaas e, sem ela, o dia informado pelo pagador ou a confirmação. */
  paidOn: IsoDate | null;
  /** PIX, CREDIT_CARD, BOLETO ou UNDEFINED (nulo quando o Asaas não diz). */
  billingType: string | null;
}

const isoDate = (v: unknown): IsoDate | null => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);
const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);

export function asaasSubscriptionFrom(raw: unknown): AsaasSubscription | null {
  const s = obj(raw);
  const id = text(s?.id);
  if (!s || !id) return null;
  return {
    id,
    status: text(s.status) ?? 'ACTIVE',
    deleted: s.deleted === true,
    cycle: text(s.cycle) ?? 'MONTHLY',
    value: typeof s.value === 'number' && Number.isFinite(s.value) ? s.value : null,
    nextDueDate: isoDate(s.nextDueDate),
    externalReference: text(s.externalReference),
    checkoutSession: text(s.checkoutSession),
  };
}

/** Uma assinatura que o Asaas já não devolve (removida): só o identificador; nada vale além do período pago. */
export function goneSubscription(id: string): AsaasSubscription {
  return { id, status: 'INACTIVE', deleted: true, cycle: 'MONTHLY', value: null, nextDueDate: null, externalReference: null, checkoutSession: null };
}

export function asaasPaymentFrom(raw: unknown): AsaasPayment | null {
  const p = obj(raw);
  const id = text(p?.id);
  if (!p || !id) return null;
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
  };
}

/** O dia que conta de uma cobrança de Pix: o do pagamento, se está paga (sem a data, hoje em Brasília); null se não está paga. */
export function pixPaidOn(p: AsaasPayment, today: IsoDate): IsoDate | null {
  if (p.deleted || !PAID_STATUSES.has(p.status)) return null;
  return p.paidOn && p.paidOn <= today ? p.paidOn : today;
}

/** O fim do período que uma cobrança com vencimento `dueDate` cobre, pelo ciclo da assinatura (mensal na Clarevo). */
export function periodEnd(dueDate: IsoDate, cycle: string): IsoDate {
  switch (cycle) {
    case 'WEEKLY':
      return addDays(dueDate, 7);
    case 'BIWEEKLY':
      return addDays(dueDate, 14);
    case 'BIMONTHLY':
      return addMonthsToDate(dueDate, 2);
    case 'QUARTERLY':
      return addMonthsToDate(dueDate, 3);
    case 'SEMIANNUALLY':
      return addMonthsToDate(dueDate, 6);
    case 'YEARLY':
      return addMonthsToDate(dueDate, 12);
    default:
      return addMonthsToDate(dueDate, 1);
  }
}

/** O fim de um dia civil em Brasília, em UTC. */
export function endOfDayBrasilia(day: IsoDate): Date {
  return new Date(`${day}T23:59:59.999${ASAAS_OFFSET}`);
}

export interface WebValidity {
  /** O último dia do período já pago (nulo sem cobrança paga). */
  paidThrough: IsoDate | null;
  /** Até quando o acesso vale: o fim do período pago, mais a tolerância com a assinatura ativa; sem cobrança paga, agora. */
  validUntil: Date;
}

/** Até quando o acesso vale, pelo estado atual da assinatura e das cobranças dela no Asaas. */
export function webValidity(sub: AsaasSubscription, payments: readonly AsaasPayment[], now: Date): WebValidity {
  let paidThrough: IsoDate | null = null;
  for (const p of payments) {
    if (p.deleted || !p.dueDate || !PAID_STATUSES.has(p.status)) continue;
    const end = periodEnd(p.dueDate, sub.cycle);
    if (!paidThrough || end > paidThrough) paidThrough = end;
  }
  if (!paidThrough) return { paidThrough: null, validUntil: now };
  const grace = sub.status === 'ACTIVE' && !sub.deleted ? WEB_GRACE_DAYS : 0;
  return { paidThrough, validUntil: endOfDayBrasilia(addDays(paidThrough, grace)) };
}

/** "2024-06-12 16:45:03" (Brasília) ou ISO 8601. null quando não é data. */
export function parseAsaasDate(v: unknown): Date | null {
  if (typeof v !== 'string') return null;
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/.exec(v.trim());
  if (!m) return null;
  const zone = m[3] ? m[3].replace(/^([+-]\d{2})(\d{2})$/, '$1:$2') : ASAAS_OFFSET;
  const d = new Date(`${m[1]}T${m[2]}${zone}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export interface AsaasEvent {
  id: string;
  event: string;
  /** Quando o evento aconteceu no Asaas (sem data válida, a hora do recebimento). */
  at: Date;
  /** A assinatura do aviso (eventos SUBSCRIPTION_*) ou a da cobrança (PAYMENT_* de assinatura); nula nos outros avisos. */
  subscriptionId: string | null;
  subscription: AsaasSubscription | null;
  /** A cobrança do aviso (PAYMENT_*), com ou sem assinatura. */
  payment: AsaasPayment | null;
  /** O Checkout do aviso (CHECKOUT_*). */
  checkoutId: string | null;
}

export function asaasEventFrom(payload: unknown, now: Date): AsaasEvent | null {
  const e = obj(payload);
  const id = text(e?.id);
  const event = text(e?.event);
  if (!e || !id || id.length > 200 || !event) return null;
  const subscription = asaasSubscriptionFrom(e.subscription);
  const payment = asaasPaymentFrom(e.payment);
  const checkoutId = event.startsWith('CHECKOUT_') ? text(obj(e.checkout)?.id) : null;
  return { id, event, at: parseAsaasDate(e.dateCreated) ?? now, subscriptionId: subscription?.id ?? payment?.subscription ?? null, subscription, payment, checkoutId };
}

// ---------------------------------------------------------------------------
// Pedidos ao Asaas e ao banco
// ---------------------------------------------------------------------------

export interface HttpResponse {
  status: number;
  text(): Promise<string>;
}
export interface HttpInit {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers: Record<string, string>;
  body?: string;
  /** Prazo da chamada; quem liga a função ao `fetch` o transforma em `AbortSignal.timeout`. */
  timeoutMs: number;
}
export type HttpFetch = (url: string, init: HttpInit) => Promise<HttpResponse>;

interface JsonResponse {
  status: number;
  json: unknown;
}

/** Falha passageira (rede, prazo, 5xx): quem chamou pode tentar de novo (o Asaas entrega o aviso de novo). */
export class TransientError extends Error {}

/** O orçamento de tempo de um pedido: cada chamada recebe o que falta, até CALL_TIMEOUT_MS; esgotado, nem começa. */
export function budget(startedAt: number, clock: () => number = Date.now) {
  return (): number => {
    const left = REQUEST_BUDGET_MS - (clock() - startedAt);
    if (left < 200) throw new TransientError('sem tempo para concluir o pedido');
    return Math.min(CALL_TIMEOUT_MS, left);
  };
}

async function readJson(res: HttpResponse): Promise<JsonResponse> {
  const body = await res.text();
  let json: unknown = null;
  try {
    json = body === '' ? null : (JSON.parse(body) as unknown);
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

/** O caminho sem a consulta (a consulta pode levar a referência da pessoa; o registro não a recebe). */
const bare = (path: string) => path.replace(/\?.*$/, '');

function asaasClient(config: AssinaturaWebConfig, fetcher: HttpFetch, timeLeft: () => number) {
  return async (method: HttpInit['method'], path: string, body?: unknown): Promise<JsonResponse> => {
    const init: HttpInit = {
      method,
      headers: { access_token: config.apiKey, 'User-Agent': 'Clarevo', 'Content-Type': 'application/json' },
      timeoutMs: timeLeft(),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    };
    let res: HttpResponse;
    try {
      res = await fetcher(`${config.apiBase}${path}`, init);
    } catch {
      throw new TransientError(`Asaas indisponível em ${method} ${bare(path)}`);
    }
    const out = await readJson(res);
    if (out.status >= 500) throw new TransientError(`Asaas respondeu ${out.status} em ${method} ${bare(path)}`);
    return out;
  };
}
type AsaasCall = ReturnType<typeof asaasClient>;

function supabaseClient(config: AssinaturaWebConfig, fetcher: HttpFetch, timeLeft: () => number) {
  const call = async (what: string, url: string, init: Omit<HttpInit, 'timeoutMs'>): Promise<JsonResponse> => {
    const timeoutMs = timeLeft();
    let res: HttpResponse;
    try {
      res = await fetcher(url, { ...init, timeoutMs });
    } catch {
      throw new TransientError(`banco indisponível em ${what}`);
    }
    const out = await readJson(res);
    if (out.status >= 500) throw new TransientError(`banco respondeu ${out.status} em ${what}`);
    return out;
  };
  return {
    /** Função do banco com a chave de serviço (billing_apply, billing_checkout_*, billing_person_by_external_ref). */
    rpcService: (fn: string, args: Record<string, unknown>) =>
      call(fn, `${config.supabaseUrl}/rest/v1/rpc/${fn}`, { method: 'POST', headers: serviceHeaders(config.serviceKey), body: JSON.stringify(args) }),
    /** Função do banco como a pessoa (my_access), com o token da sessão dela e a chave pública do projeto. */
    rpcAsUser: (fn: string, jwt: string) =>
      call(fn, `${config.supabaseUrl}/rest/v1/rpc/${fn}`, {
        method: 'POST',
        headers: { apikey: config.userApiKey, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
        body: '{}',
      }),
    /** Quem é a pessoa do token (o Supabase confere a assinatura e a validade). null quando o token não vale. */
    userId: async (jwt: string): Promise<string | null> => {
      const r = await call('auth', `${config.supabaseUrl}/auth/v1/user`, { method: 'GET', headers: { apikey: config.userApiKey, Authorization: `Bearer ${jwt}` } });
      const id = text(obj(r.json)?.id);
      return r.status === 200 && id && UUID.test(id) ? id.toLowerCase() : null;
    },
  };
}

/** O corpo do Checkout recorrente: cartão, mensal, primeira cobrança hoje, a referência da pessoa e a volta para a tela Assinatura. */
export function checkoutRequest(personId: string, plan: PlanKind, appUrl: string, today: IsoDate): Record<string, unknown> {
  const back = (result: string) => `${appUrl}/conta/assinatura?pagamento=${result}`;
  return {
    billingTypes: ['CREDIT_CARD'],
    chargeTypes: ['RECURRENT'],
    minutesToExpire: CHECKOUT_MINUTES,
    externalReference: webReference(personId, plan),
    callback: { successUrl: back('sucesso'), cancelUrl: back('cancelado'), expiredUrl: back('expirado') },
    items: [{ name: `Clarevo, plano ${PLAN_NAME[plan]}`, description: 'Assinatura mensal', quantity: 1, value: PLAN_PRICE_CENTS[plan] / 100 }],
    subscription: { cycle: 'MONTHLY', nextDueDate: today },
  };
}

/**
 * O corpo do Checkout de um mês com Pix (D-093, caminho B): Pix avulso, a referência de Pix da pessoa e a mesma volta para a tela
 * Assinatura. O nome do item tem até 30 caracteres (documentação do Asaas).
 */
export function checkoutPixRequest(personId: string, plan: PlanKind, appUrl: string): Record<string, unknown> {
  const back = (result: string) => `${appUrl}/conta/assinatura?pagamento=${result}`;
  return {
    billingTypes: ['PIX'],
    chargeTypes: ['DETACHED'],
    minutesToExpire: CHECKOUT_MINUTES,
    externalReference: pixReference(personId, plan),
    callback: { successUrl: back('sucesso'), cancelUrl: back('cancelado'), expiredUrl: back('expirado') },
    items: [{ name: `Clarevo, plano ${PLAN_NAME[plan]}`, description: 'Um mês de acesso, pago com Pix', quantity: 1, value: PLAN_PRICE_CENTS[plan] / 100 }],
  };
}

/** O link da página de pagamento: o que o Asaas devolve ou, sem ele, o endereço padrão com o identificador. */
export function checkoutLink(response: unknown, sandbox: boolean): string | null {
  const r = obj(response);
  const link = text(r?.link);
  if (link && /^https:\/\/[a-z0-9.-]*asaas\.com\//.test(link)) return link;
  const id = text(r?.id);
  return id ? `https://${sandbox ? 'sandbox.' : ''}asaas.com/checkoutSession/show?id=${encodeURIComponent(id)}` : null;
}

// ---------------------------------------------------------------------------
// A função
// ---------------------------------------------------------------------------

export interface AssinaturaWebRequest {
  method: string;
  header(name: string): string | null;
  /** O corpo, em texto. */
  body(): Promise<string>;
}

export interface AssinaturaWebResponse {
  status: number;
  body: string;
  headers: Record<string, string>;
}

export interface AssinaturaWebDeps {
  config: AssinaturaWebConfig | null;
  fetch: HttpFetch;
  log?: (message: string) => void;
  now?: () => Date;
}

/** As respostas da função ao app. */
export type AssinaturaWebResult =
  | { result: 'checkout'; url: string }
  | {
      result:
        | 'ja_assinante'
        | 'cartao_ativo'
        | 'ja_pago'
        | 'sem_necessidade'
        | 'muitas_tentativas'
        | 'cancelada'
        | 'sem_assinatura'
        | 'nao_autenticado'
        | 'pedido_invalido'
        | 'indisponivel'
        | 'tente_de_novo';
    };

const JSON_TYPE = 'application/json; charset=utf-8';

/** Cabeçalhos de CORS para a origem do app (e o app em desenvolvimento no próprio computador). Outra origem não recebe nada. */
export function corsHeaders(origin: string | null, appUrl: string): Record<string, string> {
  if (origin === null) return {};
  const allowed = origin === appUrl || /^http:\/\/localhost(:\d+)?$/.test(origin);
  if (!allowed) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(status: number, body: unknown, extra: Record<string, string> = {}): AssinaturaWebResponse {
  return { status, body: JSON.stringify(body), headers: { 'Content-Type': JSON_TYPE, ...extra } };
}

/** O que a função fez com um aviso (para o registro e os testes; a resposta ao Asaas é 200 em todos). */
export type WebhookOutcome = 'aplicado' | 'ignorado' | 'sem_referencia' | 'recusado' | 'cancelada_sem_pessoa' | 'sem_pessoa';

/** A pessoa e o plano devolvidos por billing_checkout_person, billing_person_by_external_ref ou billing_pix_person. */
function referenceFromRpc(r: JsonResponse): WebReference | null {
  const found = obj(r.json);
  const personId = text(found?.person_id);
  const plan = found?.plan;
  return r.status === 200 && personId && UUID.test(personId) && (plan === 'individual' || plan === 'familiar') ? { personId: personId.toLowerCase(), plan } : null;
}

export function createAssinaturaWebHandler(deps: AssinaturaWebDeps): (req: AssinaturaWebRequest) => Promise<AssinaturaWebResponse> {
  const log = deps.log ?? (() => {});
  const now = deps.now ?? (() => new Date());
  const config = deps.config;

  interface Clients {
    asaas: AsaasCall;
    db: ReturnType<typeof supabaseClient>;
  }

  /** As assinaturas ativas da pessoa no Asaas (uma por plano, no máximo; a busca é pela referência exata). */
  async function activeSubscriptions(asaas: AsaasCall, personId: string): Promise<AsaasSubscription[]> {
    const found: AsaasSubscription[] = [];
    for (const plan of PLANS) {
      const r = await asaas('GET', `/subscriptions?externalReference=${encodeURIComponent(webReference(personId, plan))}&status=ACTIVE&limit=10`);
      if (r.status !== 200) throw new TransientError('Asaas não listou as assinaturas');
      const data = obj(r.json)?.data;
      for (const raw of Array.isArray(data) ? data : []) {
        const s = asaasSubscriptionFrom(raw);
        if (s && !s.deleted && s.status === 'ACTIVE' && !found.some((f) => f.id === s.id)) found.push(s);
      }
    }
    return found;
  }

  /** A pessoa e o plano de uma assinatura: a referência; sem ela, o Checkout no banco; por fim, a própria assinatura já aplicada. */
  async function resolveReference({ asaas, db }: Clients, sub: AsaasSubscription): Promise<WebReference | null> {
    const direct = parseWebReference(sub.externalReference);
    if (direct) return direct;
    const fromRpc = referenceFromRpc;
    let ref: WebReference | null = null;
    if (sub.checkoutSession) ref = fromRpc(await db.rpcService('billing_checkout_person', { p_checkout_hash: sha256Hex(sub.checkoutSession) }));
    if (!ref) ref = fromRpc(await db.rpcService('billing_person_by_external_ref', { p_provider: 'web', p_external_ref: sha256Hex(sub.id) }));
    if (ref && !sub.deleted) {
      // Grava a referência na assinatura do Asaas, para os próximos avisos e para o cancelamento acharem a pessoa.
      const put = await asaas('PUT', `/subscriptions/${encodeURIComponent(sub.id)}`, { externalReference: webReference(ref.personId, ref.plan) });
      if (put.status !== 200) log(`não gravou a referência na assinatura (${put.status})`);
    }
    return ref;
  }

  /**
   * Uma cobrança de Pix mês a mês (D-093): lê a cobrança atual no Asaas, acha a pessoa (a referência de Pix; sem ela, o Checkout no banco;
   * por fim, o pagamento já gravado) e grava a situação com billing_pix_apply. Cobrança de assinatura fica com o fluxo da assinatura.
   */
  async function applyPixPayment(clients: Clients, ev: AsaasEvent, paymentId: string, eventId: string): Promise<WebhookOutcome> {
    const { asaas, db } = clients;
    const got = await asaas('GET', `/payments/${encodeURIComponent(paymentId)}`);
    let p = got.status === 200 ? asaasPaymentFrom(got.json) : null;
    // Removida no Asaas (404): conta como não paga.
    if (!p && got.status === 404 && ev.payment?.id === paymentId) p = { ...ev.payment, deleted: true };
    if (!p) {
      if (got.status === 200 || got.status === 404) return 'ignorado';
      throw new TransientError(`Asaas respondeu ${got.status} ao ler a cobrança`);
    }
    // Só cobrança de Pix sem assinatura (revisão independente de 11/11/2026): cartão, boleto ou cobrança de assinatura não viram mês de Pix.
    if (p.subscription || (p.billingType !== null && p.billingType !== 'PIX')) return 'ignorado';
    let ref = parsePixReference(p.externalReference);
    if (!ref && p.checkoutSession) ref = referenceFromRpc(await db.rpcService('billing_checkout_person', { p_checkout_hash: sha256Hex(p.checkoutSession) }));
    if (!ref) ref = referenceFromRpc(await db.rpcService('billing_pix_person', { p_payment_hash: sha256Hex(p.id) }));
    if (!ref) {
      // Paga e sem pessoa achada: conferir à mão no Asaas (o registro não leva identificador de ninguém).
      log(PAID_STATUSES.has(p.status) ? `cobrança de Pix PAGA sem referência da Clarevo (${ev.event}): conferir no Asaas` : `aviso ${ev.event} de cobrança avulsa sem referência da Clarevo`);
      return 'sem_referencia';
    }
    const applied = await db.rpcService('billing_pix_apply', {
      p_event_id: eventId,
      p_person: ref.personId,
      p_plan: ref.plan,
      p_payment_hash: sha256Hex(p.id),
      p_paid_on: pixPaidOn(p, todayIn(ASAAS_TIME_ZONE, now())),
      p_event_at: ev.at.toISOString(),
    });
    if (applied.status !== 200) {
      log(`banco recusou o aviso ${ev.event} de Pix (${applied.status})`);
      return 'recusado';
    }
    // Conta excluída: o Pix não renova sozinho, então não há o que cancelar.
    return obj(applied.json)?.result === 'sem_pessoa' ? 'sem_pessoa' : 'aplicado';
  }

  /** Avisos sem assinatura: a cobrança avulsa (PAYMENT_*) ou o Checkout pago (CHECKOUT_PAID, com as cobranças dele). */
  async function applyPixEvent(clients: Clients, ev: AsaasEvent): Promise<WebhookOutcome> {
    if (ev.payment && ev.event.startsWith('PAYMENT_')) return applyPixPayment(clients, ev, ev.payment.id, ev.id);
    if (!ev.checkoutId || ev.event !== 'CHECKOUT_PAID') return 'ignorado';
    const list = await clients.asaas('GET', `/payments?checkoutSession=${encodeURIComponent(ev.checkoutId)}&limit=10`);
    if (list.status !== 200) throw new TransientError(`Asaas respondeu ${list.status} ao listar as cobranças do Checkout`);
    const data = obj(list.json)?.data;
    let outcome: WebhookOutcome = 'ignorado';
    for (const raw of Array.isArray(data) ? data : []) {
      const p = asaasPaymentFrom(raw);
      // Só as cobranças deste Checkout, mesmo que o Asaas ignore o filtro (revisão independente de 11/11/2026).
      if (!p || p.checkoutSession !== ev.checkoutId) continue;
      const o = await applyPixPayment(clients, ev, p.id, `${ev.id}:${p.id}`.slice(0, 200));
      if (outcome === 'ignorado' || o === 'aplicado') outcome = o;
    }
    return outcome;
  }

  async function applyEvent(clients: Clients, ev: AsaasEvent): Promise<WebhookOutcome> {
    const { asaas, db } = clients;
    if (!ev.subscriptionId) return applyPixEvent(clients, ev);
    // O estado atual, não o do aviso (os avisos chegam repetidos e fora de ordem). Assinatura removida pode não ser devolvida: vale o
    // aviso ou, sem ele, só o que já está pago.
    const got = await asaas('GET', `/subscriptions/${encodeURIComponent(ev.subscriptionId)}`);
    let sub = got.status === 200 ? asaasSubscriptionFrom(got.json) : null;
    if (!sub && got.status === 404) sub = ev.subscription ?? goneSubscription(ev.subscriptionId);
    if (!sub) {
      if (got.status === 200) return 'ignorado';
      throw new TransientError(`Asaas respondeu ${got.status} ao ler a assinatura`);
    }
    const ref = await resolveReference(clients, sub);
    if (!ref) {
      log(`aviso ${ev.event} de assinatura sem referência da Clarevo`);
      return 'sem_referencia';
    }
    const since = addMonthsToDate(todayIn(ASAAS_TIME_ZONE, now()), -PAYMENTS_LOOKBACK_MONTHS);
    const list = await asaas('GET', `/payments?subscription=${encodeURIComponent(sub.id)}&dueDate%5Bge%5D=${since}&limit=100`);
    if (list.status !== 200) throw new TransientError(`Asaas respondeu ${list.status} ao listar cobranças`);
    const data = obj(list.json)?.data;
    const payments = (Array.isArray(data) ? data : []).map(asaasPaymentFrom).filter((p): p is AsaasPayment => p !== null);
    const { validUntil } = webValidity(sub, payments, now());
    const applied = await db.rpcService('billing_apply', {
      p_event_id: ev.id,
      p_provider: 'web',
      p_person: ref.personId,
      p_external_ref: sha256Hex(sub.id),
      p_plan: ref.plan,
      p_valid_until: validUntil.toISOString(),
      p_event_at: ev.at.toISOString(),
    });
    if (applied.status !== 200) {
      // Recusa do banco (aviso inválido, assinatura de outra pessoa): repetir não resolve; fica no registro.
      log(`banco recusou o aviso ${ev.event} (${applied.status})`);
      return 'recusado';
    }
    if (obj(applied.json)?.result === 'sem_pessoa') {
      // Conta excluída: a assinatura não pode continuar cobrando (rede de segurança da exclusão da conta, docs/39).
      if (sub.status === 'ACTIVE' && !sub.deleted) {
        const del = await asaas('DELETE', `/subscriptions/${encodeURIComponent(sub.id)}`);
        if (del.status !== 200 && del.status !== 404) throw new TransientError(`Asaas respondeu ${del.status} ao remover a assinatura`);
      }
      return 'cancelada_sem_pessoa';
    }
    return 'aplicado';
  }

  async function webhook(clients: Clients, req: AssinaturaWebRequest, token: string): Promise<AssinaturaWebResponse> {
    if (!config || !sameText(token, config.webhookToken)) return json(401, { result: 'recusado' });
    if (Number(req.header('content-length') ?? 0) > ASAAS_MAX_BODY_BYTES) return json(413, { result: 'grande_demais' });
    const body = await req.body();
    if (utf8Bytes(body).length > ASAAS_MAX_BODY_BYTES) return json(413, { result: 'grande_demais' });
    let payload: unknown;
    try {
      payload = JSON.parse(body);
    } catch {
      return json(400, { result: 'corpo_invalido' });
    }
    const ev = asaasEventFrom(payload, now());
    if (!ev) return json(200, { received: true, outcome: 'ignorado' });
    try {
      const outcome = await applyEvent(clients, ev);
      return json(200, { received: true, outcome });
    } catch (e) {
      log(`falha ao tratar o aviso ${ev.event}: ${e instanceof Error ? e.message : 'erro'}`);
      // Passageira: 500, e o Asaas entrega de novo. Qualquer outra não se repete com proveito: 200, para a fila não parar.
      if (e instanceof TransientError) return json(500, { result: 'tente_de_novo' });
      return json(200, { received: true, outcome: 'recusado' });
    }
  }

  async function app({ asaas, db }: Clients, req: AssinaturaWebRequest, cors: Record<string, string>): Promise<AssinaturaWebResponse> {
    const reply = (status: number, body: AssinaturaWebResult) => json(status, body, cors);
    if (!config) return reply(503, { result: 'indisponivel' });
    const auth = /^Bearer\s+(\S+)$/i.exec(req.header('authorization') ?? '');
    if (!auth) return reply(401, { result: 'nao_autenticado' });
    if (Number(req.header('content-length') ?? 0) > APP_MAX_BODY_BYTES) return reply(413, { result: 'pedido_invalido' });
    const body = await req.body();
    if (utf8Bytes(body).length > APP_MAX_BODY_BYTES) return reply(413, { result: 'pedido_invalido' });
    let payload: Record<string, unknown> | null;
    try {
      payload = obj(JSON.parse(body));
    } catch {
      payload = null;
    }
    const action = payload?.action;
    const plan = payload?.plan;
    if ((action !== 'assinar' && action !== 'cancelar' && action !== 'pix') || (action !== 'cancelar' && plan !== 'individual' && plan !== 'familiar')) {
      return reply(400, { result: 'pedido_invalido' });
    }
    try {
      const personId = await db.userId(auth[1] ?? '');
      if (!personId) return reply(401, { result: 'nao_autenticado' });
      if (action === 'cancelar') {
        let removed = 0;
        for (const s of await activeSubscriptions(asaas, personId)) {
          const del = await asaas('DELETE', `/subscriptions/${encodeURIComponent(s.id)}`);
          if (del.status !== 200 && del.status !== 404) throw new TransientError(`Asaas respondeu ${del.status} ao remover a assinatura`);
          removed++;
        }
        return reply(200, { result: removed > 0 ? 'cancelada' : 'sem_assinatura' });
      }
      const access = await db.rpcAsUser('my_access', auth[1] ?? '');
      if (access.status === 401 || access.status === 403) return reply(401, { result: 'nao_autenticado' });
      if (access.status !== 200) throw new TransientError(`banco respondeu ${access.status} em my_access`);
      const current = obj(access.json);
      const status = current?.status;
      // Quem paga com Pix pode pagar o próximo mês (só com Pix, e só nos últimos dias do mês pago); qualquer outra assinatura bloqueia.
      const paysWithPix = action === 'pix' && current?.provider === 'pix';
      if (status === 'assinatura' && !paysWithPix) return reply(200, { result: 'ja_assinante' });
      if (status === 'beneficio' || status === 'cortesia') return reply(200, { result: 'sem_necessidade' });
      if (status === 'assinatura' && !pixCanPayNext(typeof current?.until === 'string' ? current.until : null, now())) return reply(200, { result: 'ja_pago' });
      // Assinatura no cartão ainda ativa no Asaas: com o acesso valendo, já assinante; sem ele (cobrança recusada ou em aberto), a tela
      // oferece cancelar a do cartão antes de pagar de outro jeito (revisão independente de 11/11/2026).
      if ((await activeSubscriptions(asaas, personId)).length > 0) return reply(200, { result: status === 'assinatura' ? 'ja_assinante' : 'cartao_ativo' });
      const request =
        action === 'pix'
          ? checkoutPixRequest(personId, plan as PlanKind, config.appUrl)
          : checkoutRequest(personId, plan as PlanKind, config.appUrl, todayIn(ASAAS_TIME_ZONE, now()));
      const created = await asaas('POST', '/checkouts', request);
      const checkoutId = text(obj(created.json)?.id);
      const url = created.status === 200 ? checkoutLink(created.json, config.sandbox) : null;
      if (!checkoutId || !url) {
        log(`Asaas não criou o Checkout (${created.status})`);
        return reply(502, { result: 'indisponivel' });
      }
      // Sem a ligação no banco, o aviso poderia não achar a pessoa: qualquer falha cancela o Checkout e pede para tentar de novo.
      const cancelCheckout = () => asaas('POST', `/checkouts/${encodeURIComponent(checkoutId)}/cancel`).catch(() => undefined);
      let recorded: JsonResponse;
      try {
        recorded = await db.rpcService('billing_checkout_record', { p_checkout_hash: sha256Hex(checkoutId), p_person: personId, p_plan: plan });
      } catch (e) {
        await cancelCheckout();
        throw e;
      }
      if (recorded.status !== 200) {
        await cancelCheckout();
        log(`banco não gravou o Checkout (${recorded.status})`);
        return reply(500, { result: 'tente_de_novo' });
      }
      if (obj(recorded.json)?.result === 'muitas_tentativas') {
        // Mais de alguns Checkouts na última hora: o banco recusa (protege a cota da API do Asaas); o Checkout criado sai.
        await cancelCheckout();
        return reply(429, { result: 'muitas_tentativas' });
      }
      return reply(200, { result: 'checkout', url });
    } catch (e) {
      log(`falha no pedido ${String(action)}: ${e instanceof Error ? e.message : 'erro'}`);
      return reply(e instanceof TransientError ? 503 : 500, { result: 'tente_de_novo' });
    }
  }

  return async (req) => {
    const cors = corsHeaders(req.header('origin'), config?.appUrl ?? APP_URL_DEFAULT);
    if (req.method === 'OPTIONS') return { status: 204, body: '', headers: cors };
    if (!config) {
      log('configuração incompleta: faltam segredos da função');
      return json(503, { result: 'indisponivel' }, cors);
    }
    if (req.method !== 'POST') return json(405, { result: 'metodo_nao_aceito' }, cors);
    const timeLeft = budget(now().getTime(), () => now().getTime());
    const clients: Clients = { asaas: asaasClient(config, deps.fetch, timeLeft), db: supabaseClient(config, deps.fetch, timeLeft) };
    const token = req.header('asaas-access-token');
    if (token !== null) return webhook(clients, req, token);
    return app(clients, req, cors);
  };
}
