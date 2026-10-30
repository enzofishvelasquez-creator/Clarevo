import { todayIn } from '../dates';
import { sha256Hex, sha256HexOfBytes, utf8Bytes } from '../sha256';
import { readWhatsAppMessage } from './mensagem';
import { WHATSAPP_REPLY, whatsappOutcomeReply, whatsappParseReply, type WhatsAppOutcome } from './respostas';

/**
 * Recebimento das mensagens do WhatsApp (D-076): a função do servidor (supabase/functions/whatsapp) só chama o que está aqui.
 * Sem custo por construção: a Clarevo só RESPONDE, com texto simples, à mensagem que a pessoa acabou de mandar (dentro da janela de
 * atendimento de 24 horas, que a Meta não cobra). Não há envio por iniciativa da Clarevo nem mensagem de modelo (as cobradas).
 */

/** Fuso do dia da mensagem ("hoje", "ontem"). O banco confere de novo a data futura no fuso da pessoa. */
export const WHATSAPP_TIME_ZONE = 'America/Sao_Paulo';
/** Versão da API da Meta. Dá para trocar sem publicar o app, pelo segredo WHATSAPP_GRAPH_VERSION da função. */
export const WHATSAPP_GRAPH_VERSION = 'v23.0';
/** Mensagens tratadas por entrega da Meta (o resto é ignorado). */
export const WHATSAPP_MAX_MESSAGES = 20;

function hexToBytes(hex: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < hex.length; i += 2) out.push(parseInt(hex.slice(i, i + 2), 16));
  return out;
}

/** HMAC-SHA256 (RFC 2104) em hexadecimais minúsculos, com o SHA-256 do núcleo (roda igual no Node e no servidor). */
export function hmacSha256Hex(key: readonly number[], message: readonly number[]): string {
  const block = key.length > 64 ? hexToBytes(sha256HexOfBytes(key)) : key.slice();
  while (block.length < 64) block.push(0);
  const inner = sha256HexOfBytes([...block.map((b) => b ^ 0x36), ...message]);
  return sha256HexOfBytes([...block.map((b) => b ^ 0x5c), ...hexToBytes(inner)]);
}

/** Comparação que leva o mesmo tempo para qualquer diferença (assinatura). */
function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Cabeçalho X-Hub-Signature-256 ("sha256=<hex>") da Meta: HMAC do corpo exato com a chave secreta do app. */
export function verifyMetaSignature(body: readonly number[], header: string | null, appSecret: string): boolean {
  if (appSecret === '' || header === null || !/^sha256=[0-9a-fA-F]{64}$/.test(header)) return false;
  return sameText(hmacSha256Hex(utf8Bytes(appSecret), body), header.slice(7).toLowerCase());
}

/** Resumo do número que a Meta manda (só algarismos): é o que o banco guarda, nunca o número. */
export function whatsappPhoneHash(waId: string): string {
  return sha256Hex(waId.replace(/\D/g, ''));
}

export interface WhatsAppInbound {
  /** Identificador da mensagem na Meta (wamid): a chave de repetição no banco. */
  id: string;
  /** Número de quem mandou (wa_id), só algarismos. Usado para responder e para o resumo; nunca guardado. */
  from: string;
  /** Segundos desde 1970 (UTC). */
  timestamp: number;
  type: string;
  text: string | null;
}

function obj(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function list(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

/**
 * Mensagens recebidas numa entrega da Meta, só as do número da Clarevo (`phoneNumberId`). Avisos de entrega e leitura (statuses), o
 * nome do perfil (contacts) e qualquer outro campo são ignorados.
 */
export function whatsappInbound(payload: unknown, phoneNumberId: string): WhatsAppInbound[] {
  const root = obj(payload);
  if (!root || root.object !== 'whatsapp_business_account') return [];
  const out: WhatsAppInbound[] = [];
  for (const entry of list(root.entry)) {
    for (const change of list(obj(entry)?.changes)) {
      const c = obj(change);
      const value = obj(c?.value);
      if (c?.field !== 'messages' || !value || obj(value.metadata)?.phone_number_id !== phoneNumberId) continue;
      for (const m of list(value.messages)) {
        const msg = obj(m);
        const id = msg?.id;
        const from = msg?.from;
        const ts = Number(msg?.timestamp);
        if (typeof id !== 'string' || id === '' || id.length > 200) continue;
        if (typeof from !== 'string' || !/^\d{8,15}$/.test(from) || !Number.isFinite(ts)) continue;
        const type = typeof msg?.type === 'string' ? msg.type : 'unsupported';
        const body = obj(msg?.text)?.body;
        out.push({ id, from, timestamp: ts, type, text: type === 'text' && typeof body === 'string' ? body : null });
      }
    }
  }
  return out;
}

export type WhatsAppFunction = 'whatsapp_link' | 'whatsapp_add_record' | 'whatsapp_undo' | 'whatsapp_unlink';
export type WhatsAppRpc = (fn: WhatsAppFunction, args: Record<string, unknown>) => Promise<WhatsAppOutcome>;

/** Tipos que não pedem resposta: reação a uma resposta da Clarevo, aviso do sistema e tipo desconhecido. */
const SILENT_TYPES = new Set(['reaction', 'system', 'unsupported', 'errors']);

/**
 * Uma mensagem: o que ela pede, a função do banco (quando precisa) e o texto da resposta. null: não responder.
 * Ajuda, mídia e mensagem que a Clarevo não entendeu são respondidas sem ir ao banco.
 */
export async function handleWhatsAppMessage(msg: WhatsAppInbound, rpc: WhatsAppRpc): Promise<string | null> {
  if (SILENT_TYPES.has(msg.type)) return null;
  if (msg.type === 'request_welcome') return WHATSAPP_REPLY.ajuda;
  if (msg.type !== 'text' || msg.text === null) return WHATSAPP_REPLY.midia;
  const today = todayIn(WHATSAPP_TIME_ZONE, new Date(msg.timestamp * 1000));
  const cmd = readWhatsAppMessage(msg.text, today);
  const base = { p_message_id: msg.id, p_phone_hash: whatsappPhoneHash(msg.from) };
  let outcome: WhatsAppOutcome;
  switch (cmd.type) {
    case 'ajuda':
      return WHATSAPP_REPLY.ajuda;
    case 'erro':
      return whatsappParseReply(cmd.reason);
    case 'ligar':
      outcome = await rpc('whatsapp_link', { ...base, p_code: cmd.code });
      break;
    case 'desfazer':
      outcome = await rpc('whatsapp_undo', base);
      break;
    case 'desligar':
      outcome = await rpc('whatsapp_unlink', base);
      break;
    case 'anotar':
      outcome = await rpc('whatsapp_add_record', {
        ...base,
        p_kind: cmd.kind,
        p_amount_cents: cmd.amountCents,
        p_occurred_on: cmd.occurredOn,
        p_description: cmd.description,
        p_category: cmd.category,
      });
      break;
  }
  return whatsappOutcomeReply(outcome, today);
}

/** Segredos e endereços da função do servidor (painel do Supabase, Edge Functions, Secrets). */
export interface WhatsAppConfig {
  verifyToken: string;
  appSecret: string;
  accessToken: string;
  phoneNumberId: string;
  supabaseUrl: string;
  serviceKey: string;
  graphVersion: string;
}

const REQUIRED_ENV = [
  'WHATSAPP_VERIFY_TOKEN',
  'WHATSAPP_APP_SECRET',
  'WHATSAPP_ACCESS_TOKEN',
  'WHATSAPP_PHONE_NUMBER_ID',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
] as const;

/** Configuração lida dos segredos. null quando falta algum (a função responde 503 e não faz nada). */
export function whatsappConfigFrom(env: (name: string) => string | undefined): WhatsAppConfig | null {
  const v = (name: string) => (env(name) ?? '').trim();
  if (REQUIRED_ENV.some((name) => v(name) === '')) return null;
  return {
    verifyToken: v('WHATSAPP_VERIFY_TOKEN'),
    appSecret: v('WHATSAPP_APP_SECRET'),
    accessToken: v('WHATSAPP_ACCESS_TOKEN'),
    phoneNumberId: v('WHATSAPP_PHONE_NUMBER_ID'),
    supabaseUrl: v('SUPABASE_URL').replace(/\/+$/, ''),
    serviceKey: v('SUPABASE_SERVICE_ROLE_KEY'),
    graphVersion: v('WHATSAPP_GRAPH_VERSION') || WHATSAPP_GRAPH_VERSION,
  };
}

export interface WhatsAppHttpResponse {
  status: number;
  text(): Promise<string>;
}
export type WhatsAppFetch = (
  url: string,
  init: { method: 'POST'; headers: Record<string, string>; body: string },
) => Promise<WhatsAppHttpResponse>;

export interface WhatsAppRequest {
  method: string;
  url: string;
  header(name: string): string | null;
  /** O corpo exato, em bytes (a assinatura é sobre eles) e em texto. */
  body(): Promise<{ bytes: readonly number[]; text: string }>;
}

export interface WhatsAppResponse {
  status: number;
  body: string;
}

const RESULTS = new Set([
  'ligado', 'anotado', 'desfeito', 'sem_permissao', 'sem_conta', 'nada_para_desfazer', 'desligado', 'nao_ligado', 'codigo_invalido',
  'muitas_tentativas', 'muitas_mensagens', 'data_futura', 'valor_invalido', 'valor_acima_do_limite', 'descricao_invalida', 'repetida',
  'erro',
]);

/** Chamada a uma função whatsapp_* do banco pela API do Supabase, com a chave de serviço (que só existe no servidor). */
export function supabaseWhatsAppRpc(config: WhatsAppConfig, fetcher: WhatsAppFetch): WhatsAppRpc {
  return async (fn, args) => {
    const headers: Record<string, string> = { apikey: config.serviceKey, 'Content-Type': 'application/json' };
    // Chave antiga (JWT) também vai em Authorization; a chave secreta nova (sb_secret_...) vai só em apikey.
    if (config.serviceKey.startsWith('eyJ')) headers.Authorization = `Bearer ${config.serviceKey}`;
    const res = await fetcher(`${config.supabaseUrl}/rest/v1/rpc/${fn}`, { method: 'POST', headers, body: JSON.stringify(args) });
    const text = await res.text();
    if (res.status !== 200) throw new Error(`banco respondeu ${res.status} em ${fn}`);
    const outcome = obj(JSON.parse(text) as unknown);
    if (!outcome || typeof outcome.result !== 'string' || !RESULTS.has(outcome.result)) throw new Error(`resposta inesperada de ${fn}`);
    return outcome as unknown as WhatsAppOutcome;
  };
}

/**
 * Resposta à mensagem `replyTo`, só em texto simples, para quem a mandou. É o único envio que existe: sem mensagem de modelo e sem
 * envio por iniciativa da Clarevo (a Meta não cobra resposta dentro da janela de atendimento).
 */
export async function sendWhatsAppReply(config: WhatsAppConfig, fetcher: WhatsAppFetch, to: string, replyTo: string, body: string): Promise<void> {
  const res = await fetcher(`https://graph.facebook.com/${config.graphVersion}/${config.phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      context: { message_id: replyTo },
      type: 'text',
      text: { preview_url: false, body },
    }),
  });
  if (res.status !== 200) throw new Error(`a Meta respondeu ${res.status} ao envio`);
}

function queryParam(url: string, name: string): string | null {
  const q = url.indexOf('?');
  if (q < 0) return null;
  for (const pair of url.slice(q + 1).split('#')[0]!.split('&')) {
    const eq = pair.indexOf('=');
    const key = eq < 0 ? pair : pair.slice(0, eq);
    try {
      if (decodeURIComponent(key.replace(/\+/g, ' ')) === name) return decodeURIComponent((eq < 0 ? '' : pair.slice(eq + 1)).replace(/\+/g, ' '));
    } catch {
      return null;
    }
  }
  return null;
}

export interface WhatsAppHandlerDeps {
  config: WhatsAppConfig | null;
  fetch: WhatsAppFetch;
  /** Registro de falhas no log da função (sem texto de mensagem nem número). */
  log?: (message: string) => void;
}

/**
 * A função do servidor inteira, sem nada do Deno: GET confirma o endereço para a Meta (hub.verify_token); POST confere a assinatura,
 * lê as mensagens e responde a cada uma. Falha do banco devolve 500, e a Meta entrega de novo (a mensagem repetida não anota duas
 * vezes nem responde duas vezes).
 */
export function createWhatsAppHandler(deps: WhatsAppHandlerDeps): (req: WhatsAppRequest) => Promise<WhatsAppResponse> {
  const log = deps.log ?? (() => {});
  return async (req) => {
    const config = deps.config;
    if (!config) {
      log('configuração incompleta: faltam segredos da função');
      return { status: 503, body: 'indisponível' };
    }
    if (req.method === 'GET') {
      const ok = queryParam(req.url, 'hub.mode') === 'subscribe' && sameText(queryParam(req.url, 'hub.verify_token') ?? '', config.verifyToken);
      const challenge = queryParam(req.url, 'hub.challenge');
      return ok && challenge !== null ? { status: 200, body: challenge } : { status: 403, body: 'recusado' };
    }
    if (req.method !== 'POST') return { status: 405, body: 'método não aceito' };

    const { bytes, text } = await req.body();
    if (!verifyMetaSignature(bytes, req.header('x-hub-signature-256'), config.appSecret)) return { status: 401, body: 'assinatura inválida' };
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      return { status: 400, body: 'corpo inválido' };
    }
    const rpc = supabaseWhatsAppRpc(config, deps.fetch);
    for (const msg of whatsappInbound(payload, config.phoneNumberId).slice(0, WHATSAPP_MAX_MESSAGES)) {
      let reply: string | null;
      try {
        reply = await handleWhatsAppMessage(msg, rpc);
      } catch (e) {
        log(`falha ao tratar uma mensagem: ${e instanceof Error ? e.message : 'erro'}`);
        return { status: 500, body: 'tente de novo' };
      }
      if (reply === null) continue;
      try {
        await sendWhatsAppReply(config, deps.fetch, msg.from, msg.id, reply);
      } catch (e) {
        log(`falha ao responder: ${e instanceof Error ? e.message : 'erro'}`);
      }
    }
    return { status: 200, body: 'ok' };
  };
}
