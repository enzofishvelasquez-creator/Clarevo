/**
 * Assinatura pelas lojas (D-090, fase 2 da D-083): a função do servidor "assinatura-lojas" (Edge Function do Supabase), gerada num
 * arquivo só por `scripts/gerar-funcoes.js`. A compra é feita no app, pela App Store ou pelo Google Play, com o SDK do RevenueCat; o
 * RevenueCat confere os recibos com as lojas e avisa a Clarevo. A função faz duas coisas, pelo mesmo endereço:
 *
 * 1. **Para o RevenueCat (avisos, webhooks)**, com o token combinado no cabeçalho Authorization: o aviso só diz QUEM mudou. A função
 *    consulta no RevenueCat (API REST v1, com a chave secreta) o estado atual das assinaturas de cada pessoa citada no aviso, calcula
 *    até quando o acesso vale em cada loja e chama `billing_apply` no banco (idempotente pelo identificador do aviso e na ordem dos
 *    eventos). Como a validade vem sempre da consulta, e não do corpo do aviso, avisos repetidos, fora de ordem ou forjados não criam
 *    direito: no máximo, pedem uma consulta. Responde 200 a todo aviso autenticado que não precisa ser repetido; só falha passageira
 *    responde 500, e o RevenueCat entrega de novo mais tarde.
 * 2. **Para o app, com a sessão da pessoa** (Authorization: Bearer <token da sessão>): "sincronizar", logo depois de uma compra ou de
 *    "Restaurar compras" no iPhone ou no Android, faz a mesma consulta para a própria pessoa, para a assinatura aparecer sem esperar o
 *    aviso; "esquecer", logo antes de excluir a conta (em qualquer plataforma), apaga a pessoa no RevenueCat se ela já teve assinatura
 *    por alguma loja (o banco diz), para o código da conta e o histórico das compras não ficarem lá. Quem nunca assinou pela loja não
 *    é citado ao RevenueCat.
 *
 * Quem é a pessoa: o app entra no RevenueCat com o identificador da conta da Clarevo (o mesmo `persons.id`, um código aleatório; nunca
 * nome nem e-mail), então o `app_user_id` do aviso é a pessoa. Identificador que não tem esse formato (os anônimos do RevenueCat, o
 * aviso de teste do painel) é ignorado. Transferência (a mesma conta da loja restaurada em outra conta da Clarevo): o aviso cita as
 * duas contas, e a consulta de cada uma tira o acesso de uma e dá à outra.
 *
 * Até quando vale, em cada loja: o fim do período pago da assinatura da Clarevo (a de fim mais distante, se houver duas, como na troca
 * de plano), ou o fim do período de tolerância da loja, se for depois; reembolso termina na data do reembolso. Sem assinatura daquela
 * loja, nada muda, a não ser que a pessoa já tivesse direito por ela (transferida para outra conta): aí o direito termina agora. Compras
 * de teste (sandbox, as da revisão da Apple e dos testadores) valem como as outras: só quem a Clarevo cadastra faz compra de teste, e a
 * assinatura de teste renova a cada poucos minutos e acaba sozinha.
 *
 * O identificador guardado no banco (`external_ref`) é o resumo SHA-256 de "revenuecat:<pessoa>", um por loja: a troca de plano e a
 * renovação atualizam a mesma linha. O identificador de cada aviso no banco (`billing_events`) leva só um resumo da pessoa.
 *
 * Segredos (painel do Supabase, Edge Functions, Secrets, só o Enzo): REVENUECAT_API_KEY (a chave secreta da API v1 do projeto no
 * RevenueCat, começa com sk_) e REVENUECAT_WEBHOOK_TOKEN (32 a 255 caracteres, inventado, o mesmo que vai no campo "Authorization
 * header value" do webhook no painel do RevenueCat). SUPABASE_URL, a chave de serviço e a chave pública o Supabase fornece. Nenhum
 * segredo entra no app nem no repositório, e nenhum identificador da pessoa vai para o registro (logs).
 */
import type { PlanKind } from '../plano-precos';
import { obj, sameText, serviceHeaders, serviceKeyFrom } from '../servidor-comum';
import { sha256Hex, utf8Bytes } from '../sha256';
import { planOfStoreProduct } from './produtos';

export const REVENUECAT_API_URL = 'https://api.revenuecat.com/v1';
/** As chaves secretas do RevenueCat começam com sk_ (as públicas do SDK, com appl_ e goog_, não servem aqui). */
export const REVENUECAT_SECRET_PREFIX = 'sk_';
/** O token dos avisos: 32 a 255 caracteres (letras, algarismos, _ e -, como os outros segredos da Clarevo). */
export const REVENUECAT_WEBHOOK_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,255}$/;
export const STORE_WEBHOOK_MAX_BODY_BYTES = 128 * 1024;
export const STORE_APP_MAX_BODY_BYTES = 4 * 1024;
/** Quantas pessoas um aviso pode citar (a pessoa, a original e as da transferência); acima disso, as primeiras. */
export const STORE_MAX_CUSTOMERS_PER_EVENT = 4;
/** Orçamento de tempo de um pedido e o prazo de cada chamada (o RevenueCat espera bem mais que isso pela resposta). */
export const STORE_REQUEST_BUDGET_MS = 20000;
export const STORE_CALL_TIMEOUT_MS = 4000;

export type StoreProvider = 'apple' | 'google';
export const STORE_PROVIDERS: readonly StoreProvider[] = ['apple', 'google'];

export interface AssinaturaLojasConfig {
  revenueCatKey: string;
  webhookToken: string;
  supabaseUrl: string;
  serviceKey: string;
  /** A chave pública do projeto, para conferir o token da sessão da pessoa; sem ela, a de serviço. */
  userApiKey: string;
}

/** Configuração lida dos segredos. null quando falta algum (a função responde 503 e não faz nada). */
export function assinaturaLojasConfigFrom(env: (name: string) => string | undefined): AssinaturaLojasConfig | null {
  const v = (name: string) => (env(name) ?? '').trim();
  const revenueCatKey = v('REVENUECAT_API_KEY');
  if (!revenueCatKey.startsWith(REVENUECAT_SECRET_PREFIX) || !/^[A-Za-z0-9_]{12,255}$/.test(revenueCatKey)) return null;
  const webhookToken = v('REVENUECAT_WEBHOOK_TOKEN');
  if (!REVENUECAT_WEBHOOK_TOKEN_PATTERN.test(webhookToken) || webhookToken === revenueCatKey) return null;
  const supabaseUrl = v('SUPABASE_URL').replace(/\/+$/, '');
  const serviceKey = serviceKeyFrom(v);
  if (supabaseUrl === '' || serviceKey === '') return null;
  const userApiKey = v('SUPABASE_PUBLISHABLE_KEY') || v('SUPABASE_ANON_KEY') || serviceKey;
  return { revenueCatKey, webhookToken, supabaseUrl, serviceKey, userApiKey };
}

// ---------------------------------------------------------------------------
// O aviso e as assinaturas do RevenueCat
// ---------------------------------------------------------------------------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);

export interface RevenueCatEvent {
  id: string;
  type: string;
  /** Quando o evento aconteceu (event_timestamp_ms; sem ele, a hora do recebimento). */
  at: Date;
  /** As pessoas da Clarevo citadas no aviso (identificadores no formato da conta, sem repetir, até STORE_MAX_CUSTOMERS_PER_EVENT). */
  customers: string[];
}

/** Lê o aviso do RevenueCat ({ api_version, event }). null quando não é um aviso com identificador. */
export function revenueCatEventFrom(payload: unknown, now: Date): RevenueCatEvent | null {
  const e = obj(obj(payload)?.event);
  const id = text(e?.id);
  const type = text(e?.type);
  if (!e || !id || id.length > 120 || !type) return null;
  const ids: unknown[] = [e.app_user_id, e.original_app_user_id];
  for (const key of ['transferred_from', 'transferred_to', 'aliases']) {
    const list = e[key];
    if (Array.isArray(list)) ids.push(...list);
  }
  const customers: string[] = [];
  for (const raw of ids) {
    const v = text(raw);
    if (!v || !UUID.test(v)) continue;
    const lower = v.toLowerCase();
    if (!customers.includes(lower)) customers.push(lower);
    if (customers.length >= STORE_MAX_CUSTOMERS_PER_EVENT) break;
  }
  const ms = e.event_timestamp_ms;
  const at = typeof ms === 'number' && Number.isFinite(ms) && ms > 0 ? new Date(ms) : now;
  return { id, type, at: at.getTime() > now.getTime() ? now : at, customers };
}

export interface StoreSubscription {
  /** O identificador do produto na loja (no Google, com o plano básico). */
  product: string;
  plan: PlanKind | null;
  provider: StoreProvider | null;
  expiresAt: Date | null;
  graceUntil: Date | null;
  refundedAt: Date | null;
  sandbox: boolean;
}

const date = (v: unknown): Date | null => {
  if (typeof v !== 'string') return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** A loja de uma assinatura, como o RevenueCat a escreve. Outras (promocional, web do RevenueCat, Amazon) não contam. */
export function storeProviderOf(store: unknown): StoreProvider | null {
  if (store === 'app_store') return 'apple';
  if (store === 'play_store') return 'google';
  return null;
}

/** As assinaturas da resposta de GET /v1/subscribers/{id} (subscriber.subscriptions, uma por produto). */
export function storeSubscriptionsFrom(raw: unknown): StoreSubscription[] {
  const subs = obj(obj(obj(raw)?.subscriber)?.subscriptions);
  if (!subs) return [];
  const out: StoreSubscription[] = [];
  for (const [product, value] of Object.entries(subs)) {
    const s = obj(value);
    if (!s) continue;
    out.push({
      product,
      plan: planOfStoreProduct(product),
      provider: storeProviderOf(s.store),
      expiresAt: date(s.expires_date),
      graceUntil: date(s.grace_period_expires_date),
      refundedAt: date(s.refunded_at),
      sandbox: s.is_sandbox === true,
    });
  }
  return out;
}

export interface StoreValidity {
  plan: PlanKind;
  validUntil: Date;
}

/** O fim do acesso de uma assinatura: o período pago ou a tolerância, o que for depois; com reembolso, a data do reembolso. */
export function subscriptionEnd(s: StoreSubscription): Date | null {
  const paid = [s.expiresAt, s.graceUntil].filter((d): d is Date => d !== null);
  const end = paid.length > 0 ? new Date(Math.max(...paid.map((d) => d.getTime()))) : null;
  if (s.refundedAt) return end && end.getTime() < s.refundedAt.getTime() ? end : s.refundedAt;
  return end;
}

/**
 * Até quando o acesso vale numa loja, pelas assinaturas da Clarevo dessa loja. A que ainda vale e termina mais tarde; empate, o
 * Família. Nenhuma valendo: a que terminou por último (o direito acaba nessa data). Sem assinatura da Clarevo nessa loja: null.
 */
export function storeValidity(subs: readonly StoreSubscription[], provider: StoreProvider): StoreValidity | null {
  let best: { plan: PlanKind; end: Date } | null = null;
  for (const s of subs) {
    if (s.provider !== provider || !s.plan) continue;
    const end = subscriptionEnd(s);
    if (!end) continue;
    const better =
      !best ||
      end.getTime() > best.end.getTime() ||
      (end.getTime() === best.end.getTime() && s.plan === 'familiar' && best.plan !== 'familiar');
    if (better) best = { plan: s.plan, end };
  }
  if (!best) return null;
  return { plan: best.plan, validUntil: best.end };
}

/** O identificador guardado no banco para o direito da pessoa numa loja (o mesmo em todas as renovações e trocas de plano). */
export function storeExternalRef(personId: string): string {
  return sha256Hex(`revenuecat:${personId.toLowerCase()}`);
}

// ---------------------------------------------------------------------------
// Pedidos ao RevenueCat e ao banco
// ---------------------------------------------------------------------------

export interface StoreHttpResponse {
  status: number;
  text(): Promise<string>;
}
export interface StoreHttpInit {
  method: 'GET' | 'POST' | 'DELETE';
  headers: Record<string, string>;
  body?: string;
  /** Prazo da chamada; quem liga a função ao `fetch` o transforma em `AbortSignal.timeout`. */
  timeoutMs: number;
}
export type StoreHttpFetch = (url: string, init: StoreHttpInit) => Promise<StoreHttpResponse>;

interface JsonResponse {
  status: number;
  json: unknown;
}

/** Falha passageira (rede, prazo, 5xx, chave recusada): o RevenueCat entrega o aviso de novo; o app pede para tentar de novo. */
export class StoreTransientError extends Error {}

function timeBudget(startedAt: number, clock: () => number) {
  return (): number => {
    const left = STORE_REQUEST_BUDGET_MS - (clock() - startedAt);
    if (left < 300) throw new StoreTransientError('sem tempo para concluir o pedido');
    return Math.min(STORE_CALL_TIMEOUT_MS, left);
  };
}

async function readJson(res: StoreHttpResponse): Promise<JsonResponse> {
  const body = await res.text();
  let json: unknown = null;
  try {
    json = body === '' ? null : (JSON.parse(body) as unknown);
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

function clients(config: AssinaturaLojasConfig, fetcher: StoreHttpFetch, timeLeft: () => number) {
  const call = async (what: string, url: string, init: Omit<StoreHttpInit, 'timeoutMs'>): Promise<JsonResponse> => {
    const timeoutMs = timeLeft();
    let res: StoreHttpResponse;
    try {
      res = await fetcher(url, { ...init, timeoutMs });
    } catch {
      throw new StoreTransientError(`${what} indisponível`);
    }
    const out = await readJson(res);
    if (out.status >= 500) throw new StoreTransientError(`${what} respondeu ${out.status}`);
    return out;
  };
  return {
    /** As assinaturas atuais da pessoa no RevenueCat. Chave recusada ou limite de pedidos: passageira (o aviso volta mais tarde). */
    subscriber: async (personId: string): Promise<StoreSubscription[]> => {
      const r = await call('RevenueCat', `${REVENUECAT_API_URL}/subscribers/${encodeURIComponent(personId)}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${config.revenueCatKey}`, Accept: 'application/json' },
      });
      if (r.status === 404) return [];
      if (r.status !== 200) throw new StoreTransientError(`RevenueCat respondeu ${r.status}`);
      return storeSubscriptionsFrom(r.json);
    },
    /** Apaga a pessoa no RevenueCat (o cliente e o histórico das compras). Já apagada ou nunca vista: tudo bem. */
    forget: async (personId: string): Promise<void> => {
      const r = await call('RevenueCat', `${REVENUECAT_API_URL}/subscribers/${encodeURIComponent(personId)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${config.revenueCatKey}`, Accept: 'application/json' },
      });
      if (r.status !== 200 && r.status !== 404) throw new StoreTransientError(`RevenueCat respondeu ${r.status}`);
    },
    rpcService: (fn: string, args: Record<string, unknown>) =>
      call(fn, `${config.supabaseUrl}/rest/v1/rpc/${fn}`, { method: 'POST', headers: serviceHeaders(config.serviceKey), body: JSON.stringify(args) }),
    /** Quem é a pessoa do token (o Supabase confere a assinatura e a validade). null quando o token não vale. */
    userId: async (jwt: string): Promise<string | null> => {
      const r = await call('auth', `${config.supabaseUrl}/auth/v1/user`, { method: 'GET', headers: { apikey: config.userApiKey, Authorization: `Bearer ${jwt}` } });
      const id = text(obj(r.json)?.id);
      return r.status === 200 && id && UUID.test(id) ? id.toLowerCase() : null;
    },
  };
}
type Clients = ReturnType<typeof clients>;

// ---------------------------------------------------------------------------
// A função
// ---------------------------------------------------------------------------

export interface AssinaturaLojasRequest {
  method: string;
  header(name: string): string | null;
  body(): Promise<string>;
}

export interface AssinaturaLojasResponse {
  status: number;
  body: string;
  headers: Record<string, string>;
}

export interface AssinaturaLojasDeps {
  config: AssinaturaLojasConfig | null;
  fetch: StoreHttpFetch;
  log?: (message: string) => void;
  now?: () => Date;
}

/** O que a sincronização de uma pessoa fez numa loja. */
export type StoreSyncOutcome = 'aplicado' | 'sem_mudanca' | 'encerrado' | 'sem_pessoa' | 'recusado';

/** As respostas da função ao app. */
export type AssinaturaLojasResult =
  | 'sincronizado'
  | 'esquecido'
  | 'sem_compra'
  | 'nao_autenticado'
  | 'pedido_invalido'
  | 'indisponivel'
  | 'tente_de_novo';

const JSON_TYPE = 'application/json; charset=utf-8';

function json(status: number, body: unknown): AssinaturaLojasResponse {
  return { status, body: JSON.stringify(body), headers: { 'Content-Type': JSON_TYPE } };
}

export function createAssinaturaLojasHandler(deps: AssinaturaLojasDeps): (req: AssinaturaLojasRequest) => Promise<AssinaturaLojasResponse> {
  const log = deps.log ?? (() => {});
  const now = deps.now ?? (() => new Date());
  const config = deps.config;

  /**
   * Consulta a pessoa no RevenueCat e aplica no banco a validade de cada loja. `eventId`: o aviso que pediu (nulo quando foi o app).
   * Devolve o que aconteceu em cada loja em que havia algo a fazer (vazio: nenhuma assinatura da Clarevo nem direito anterior).
   */
  async function syncPerson(c: Clients, personId: string, eventId: string | null, at: Date): Promise<StoreSyncOutcome[]> {
    const subs = await c.subscriber(personId);
    const ref = storeExternalRef(personId);
    const outcomes: StoreSyncOutcome[] = [];
    for (const provider of STORE_PROVIDERS) {
      let validity = storeValidity(subs, provider);
      let ended = false;
      if (!validity) {
        // Sem assinatura nesta loja: só importa se a pessoa já tinha direito por ela (a compra foi transferida para outra conta).
        const found = await c.rpcService('billing_person_by_external_ref', { p_provider: provider, p_external_ref: ref });
        const row = obj(found.json);
        const plan = row?.plan;
        if (found.status !== 200 || text(row?.person_id)?.toLowerCase() !== personId || (plan !== 'individual' && plan !== 'familiar')) continue;
        validity = { plan, validUntil: now() };
        ended = true;
      }
      const tag = sha256Hex(`${personId}:${provider}`).slice(0, 16);
      const id = eventId
        ? `rc:${eventId}:${tag}`
        : `rc-app:${sha256Hex(`${personId}:${provider}:${validity.plan}:${ended ? 'fim' : validity.validUntil.toISOString()}`).slice(0, 40)}`;
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
      const result = obj(applied.json)?.result;
      outcomes.push(result === 'sem_pessoa' ? 'sem_pessoa' : result === 'aplicado' ? (ended ? 'encerrado' : 'aplicado') : 'sem_mudanca');
    }
    return outcomes;
  }

  async function webhook(c: Clients, req: AssinaturaLojasRequest): Promise<AssinaturaLojasResponse> {
    if (Number(req.header('content-length') ?? 0) > STORE_WEBHOOK_MAX_BODY_BYTES) return json(413, { result: 'grande_demais' });
    const body = await req.body();
    if (utf8Bytes(body).length > STORE_WEBHOOK_MAX_BODY_BYTES) return json(413, { result: 'grande_demais' });
    let payload: unknown;
    try {
      payload = JSON.parse(body);
    } catch {
      return json(400, { result: 'corpo_invalido' });
    }
    const ev = revenueCatEventFrom(payload, now());
    if (!ev || ev.customers.length === 0) return json(200, { received: true, outcome: 'ignorado' });
    try {
      const outcomes: StoreSyncOutcome[] = [];
      for (const person of ev.customers) outcomes.push(...(await syncPerson(c, person, ev.id, ev.at)));
      return json(200, { received: true, outcome: outcomes.length > 0 ? outcomes : 'ignorado' });
    } catch (e) {
      log(`falha ao tratar o aviso ${ev.type}: ${e instanceof Error ? e.message : 'erro'}`);
      if (e instanceof StoreTransientError) return json(500, { result: 'tente_de_novo' });
      return json(200, { received: true, outcome: 'recusado' });
    }
  }

  async function app(c: Clients, req: AssinaturaLojasRequest, jwt: string): Promise<AssinaturaLojasResponse> {
    const reply = (status: number, result: AssinaturaLojasResult) => json(status, { result });
    if (Number(req.header('content-length') ?? 0) > STORE_APP_MAX_BODY_BYTES) return reply(413, 'pedido_invalido');
    const body = await req.body();
    if (utf8Bytes(body).length > STORE_APP_MAX_BODY_BYTES) return reply(413, 'pedido_invalido');
    let payload: Record<string, unknown> | null;
    try {
      payload = obj(JSON.parse(body));
    } catch {
      payload = null;
    }
    try {
      // A sessão primeiro: quem não está na Clarevo só recebe 401, qualquer que seja o pedido.
      const personId = await c.userId(jwt);
      if (!personId) return reply(401, 'nao_autenticado');
      if (payload?.action === 'esquecer') {
        // Só quem já teve direito por alguma loja foi visto pelo RevenueCat (o direito no banco sai com a conta, logo depois).
        const ref = storeExternalRef(personId);
        let seen = false;
        for (const provider of STORE_PROVIDERS) {
          const found = await c.rpcService('billing_person_by_external_ref', { p_provider: provider, p_external_ref: ref });
          if (found.status !== 200) throw new StoreTransientError(`banco respondeu ${found.status}`);
          if (text(obj(found.json)?.person_id)?.toLowerCase() === personId) seen = true;
        }
        if (!seen) return reply(200, 'sem_compra');
        await c.forget(personId);
        return reply(200, 'esquecido');
      }
      if (payload?.action !== 'sincronizar') return reply(400, 'pedido_invalido');
      const outcomes = await syncPerson(c, personId, null, now());
      if (outcomes.includes('recusado')) return reply(500, 'tente_de_novo');
      return reply(200, outcomes.length > 0 ? 'sincronizado' : 'sem_compra');
    } catch (e) {
      log(`falha ao sincronizar a assinatura da loja: ${e instanceof Error ? e.message : 'erro'}`);
      return reply(e instanceof StoreTransientError ? 503 : 500, 'tente_de_novo');
    }
  }

  return async (req) => {
    if (req.method === 'OPTIONS') return { status: 204, body: '', headers: {} };
    if (!config) {
      log('configuração incompleta: faltam segredos da função');
      return json(503, { result: 'indisponivel' });
    }
    if (req.method !== 'POST') return json(405, { result: 'metodo_nao_aceito' });
    const timeLeft = timeBudget(now().getTime(), () => now().getTime());
    const c = clients(config, deps.fetch, timeLeft);
    // O RevenueCat manda o valor combinado inteiro no Authorization ("Bearer <token>" ou só o token); o app manda o token da sessão.
    const auth = (req.header('authorization') ?? '').trim();
    const bearer = auth.replace(/^Bearer\s+/i, '').trim();
    if (bearer !== '' && sameText(bearer, config.webhookToken)) return webhook(c, req);
    if (!/^Bearer\s+\S+$/i.test(auth)) return json(401, { result: 'nao_autenticado' });
    return app(c, req, bearer);
  };
}
