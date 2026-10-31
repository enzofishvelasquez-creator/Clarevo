import { todayIn } from '../dates';
import { sha256HexOfBytes, utf8Bytes } from '../sha256';
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
/** Mensagens tratadas por entrega da Meta (a Meta manda poucas por entrega; o excesso fica registrado no log e é ignorado). */
export const WHATSAPP_MAX_MESSAGES = 100;
/** Corpo máximo aceito (bytes), conferido antes da assinatura: as entregas da Meta com texto têm poucos KB. */
export const WHATSAPP_MAX_BODY_BYTES = 256 * 1024;

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

/**
 * Resumo do número que a Meta manda (só algarismos), com a chave secreta da função (WHATSAPP_PHONE_KEY): é o que o banco guarda, nunca o
 * número. Com HMAC, quem lê o banco sem a chave não volta ao número testando todos os celulares possíveis (com SHA-256 puro, voltaria).
 */
export function whatsappPhoneHash(waId: string, phoneKey: string): string {
  return hmacSha256Hex(utf8Bytes(phoneKey), utf8Bytes(waId.replace(/\D/g, '')));
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
  /** Só em aviso do sistema (type 'system'): o tipo do aviso, como 'user_changed_number'. */
  systemType?: string | null;
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
        const system = obj(msg?.system)?.type;
        out.push({
          id,
          from,
          timestamp: ts,
          type,
          text: type === 'text' && typeof body === 'string' ? body : null,
          ...(type === 'system' ? { systemType: typeof system === 'string' ? system : null } : {}),
        });
      }
    }
  }
  return out;
}

export type WhatsAppFunction = 'whatsapp_note' | 'whatsapp_link' | 'whatsapp_add_record' | 'whatsapp_undo' | 'whatsapp_unlink';
export type WhatsAppRpc = (fn: WhatsAppFunction, args: Record<string, unknown>) => Promise<WhatsAppOutcome>;

/** Tipos que não pedem resposta: reação a uma resposta da Clarevo, aviso do sistema e tipo desconhecido. */
const SILENT_TYPES = new Set(['reaction', 'system', 'unsupported', 'errors']);

/**
 * Uma mensagem: o que ela pede, a função do banco e o texto da resposta. null: não responder. Ajuda, mídia e mensagem que a Clarevo não
 * entendeu também passam pelo banco (whatsapp_note), só para a repetição da Meta não responder duas vezes e para o limite de mensagens.
 * Aviso do sistema de troca de número desliga o número antigo, sem resposta.
 */
export async function handleWhatsAppMessage(msg: WhatsAppInbound, rpc: WhatsAppRpc, phoneKey: string): Promise<string | null> {
  const base = { p_message_id: msg.id, p_phone_hash: whatsappPhoneHash(msg.from, phoneKey) };
  if (msg.type === 'system' && msg.systemType === 'user_changed_number') {
    await rpc('whatsapp_unlink', base);
    return null;
  }
  if (SILENT_TYPES.has(msg.type)) return null;
  const today = todayIn(WHATSAPP_TIME_ZONE, new Date(msg.timestamp * 1000));
  const sentAt = new Date(msg.timestamp * 1000).toISOString();
  const noted = async (outcome: 'ajuda' | 'midia' | 'nao_entendi', reply: string) => {
    const r = await rpc('whatsapp_note', { ...base, p_outcome: outcome });
    return r.result === 'registrada' ? reply : whatsappOutcomeReply(r, today);
  };
  if (msg.type === 'request_welcome') return noted('ajuda', WHATSAPP_REPLY.ajuda);
  if (msg.type !== 'text' || msg.text === null) return noted('midia', WHATSAPP_REPLY.midia);
  const cmd = readWhatsAppMessage(msg.text, today);
  let outcome: WhatsAppOutcome;
  switch (cmd.type) {
    case 'ajuda':
      return noted('ajuda', WHATSAPP_REPLY.ajuda);
    case 'erro':
      return noted('nao_entendi', whatsappParseReply(cmd.reason));
    case 'ligar':
      outcome = await rpc('whatsapp_link', { ...base, p_code: cmd.code });
      break;
    case 'desfazer':
      outcome = await rpc('whatsapp_undo', { ...base, p_sent_at: sentAt });
      break;
    case 'desligar':
      outcome = await rpc('whatsapp_unlink', base);
      break;
    case 'anotar':
      outcome = await rpc('whatsapp_add_record', {
        ...base,
        p_sent_at: sentAt,
        p_kind: cmd.kind,
        p_amount_cents: cmd.amountCents,
        // "hoje" e "ontem" pelo dia da pessoa no fuso dela (o banco calcula); a data escrita vai como está.
        p_days_ago: cmd.daysAgo,
        p_occurred_on: cmd.daysAgo === null ? cmd.occurredOn : null,
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
  /** Chave do resumo dos números (HMAC). Trocar a chave desliga todos os números ligados. */
  phoneKey: string;
  accessToken: string;
  phoneNumberId: string;
  supabaseUrl: string;
  serviceKey: string;
  graphVersion: string;
}

const REQUIRED_ENV = [
  'WHATSAPP_VERIFY_TOKEN',
  'WHATSAPP_APP_SECRET',
  'WHATSAPP_PHONE_KEY',
  'WHATSAPP_ACCESS_TOKEN',
  'WHATSAPP_PHONE_NUMBER_ID',
  'SUPABASE_URL',
] as const;

/**
 * Chave de serviço do banco: a chave secreta nova do Supabase (SUPABASE_SECRET_KEYS, um JSON por nome; vale a "default" ou, sem ela,
 * a primeira) e, sem ela, a chave antiga (SUPABASE_SERVICE_ROLE_KEY, que o painel já marca como antiga). Vazio: nenhuma.
 */
function serviceKeyFrom(v: (name: string) => string): string {
  const keys = v('SUPABASE_SECRET_KEYS');
  if (keys !== '') {
    try {
      const parsed = JSON.parse(keys) as unknown;
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        const values = parsed as Record<string, unknown>;
        const chosen = typeof values.default === 'string' ? values.default : Object.values(values).find((x) => typeof x === 'string');
        if (typeof chosen === 'string' && chosen.trim() !== '') return chosen.trim();
      }
    } catch {
      // JSON inválido: segue para a chave antiga.
    }
  }
  return v('SUPABASE_SERVICE_ROLE_KEY');
}

/** Configuração lida dos segredos. null quando falta algum (a função responde 503 e não faz nada). */
export function whatsappConfigFrom(env: (name: string) => string | undefined): WhatsAppConfig | null {
  const v = (name: string) => (env(name) ?? '').trim();
  const serviceKey = serviceKeyFrom(v);
  if (REQUIRED_ENV.some((name) => v(name) === '') || serviceKey === '') return null;
  return {
    verifyToken: v('WHATSAPP_VERIFY_TOKEN'),
    appSecret: v('WHATSAPP_APP_SECRET'),
    phoneKey: v('WHATSAPP_PHONE_KEY'),
    accessToken: v('WHATSAPP_ACCESS_TOKEN'),
    phoneNumberId: v('WHATSAPP_PHONE_NUMBER_ID'),
    supabaseUrl: v('SUPABASE_URL').replace(/\/+$/, ''),
    serviceKey,
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
  'silencio', 'registrada',
]);

/** Recusa do banco que se repetiria a cada nova entrega (pedido inválido, 4xx): não adianta a Meta mandar de novo. */
export class WhatsAppFinalError extends Error {}

/** Chamada a uma função whatsapp_* do banco pela API do Supabase, com a chave de serviço (que só existe no servidor). */
export function supabaseWhatsAppRpc(config: WhatsAppConfig, fetcher: WhatsAppFetch): WhatsAppRpc {
  return async (fn, args) => {
    const headers: Record<string, string> = { apikey: config.serviceKey, 'Content-Type': 'application/json' };
    // Chave antiga (JWT) também vai em Authorization; a chave secreta nova (sb_secret_...) vai só em apikey.
    if (config.serviceKey.startsWith('eyJ')) headers.Authorization = `Bearer ${config.serviceKey}`;
    const res = await fetcher(`${config.supabaseUrl}/rest/v1/rpc/${fn}`, { method: 'POST', headers, body: JSON.stringify(args) });
    const text = await res.text();
    if (res.status >= 400 && res.status < 500) throw new WhatsAppFinalError(`banco recusou (${res.status}) em ${fn}`);
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

    if (Number(req.header('content-length') ?? 0) > WHATSAPP_MAX_BODY_BYTES) return { status: 413, body: 'grande demais' };
    const { bytes, text } = await req.body();
    if (bytes.length > WHATSAPP_MAX_BODY_BYTES) return { status: 413, body: 'grande demais' };
    if (!verifyMetaSignature(bytes, req.header('x-hub-signature-256'), config.appSecret)) return { status: 401, body: 'assinatura inválida' };
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      return { status: 400, body: 'corpo inválido' };
    }
    const rpc = supabaseWhatsAppRpc(config, deps.fetch);
    const messages = whatsappInbound(payload, config.phoneNumberId);
    if (messages.length > WHATSAPP_MAX_MESSAGES) log(`entrega com ${messages.length} mensagens: só as primeiras ${WHATSAPP_MAX_MESSAGES} tratadas`);
    for (const msg of messages.slice(0, WHATSAPP_MAX_MESSAGES)) {
      let reply: string | null;
      try {
        reply = await handleWhatsAppMessage(msg, rpc, config.phoneKey);
      } catch (e) {
        log(`falha ao tratar uma mensagem: ${e instanceof Error ? e.message : 'erro'}`);
        // Recusa definitiva (4xx): responde que não deu e segue com as outras; falha passageira: 500, e a Meta entrega de novo.
        if (!(e instanceof WhatsAppFinalError)) return { status: 500, body: 'tente de novo' };
        reply = WHATSAPP_REPLY.erro;
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
