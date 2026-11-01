import { utf8Bytes } from '../sha256';
import { TELEGRAM_REPLY, type WhatsAppOutcome } from '../whatsapp/respostas';
import {
  WhatsAppFinalError,
  answerChatMessage,
  chatMessageKey,
  hmacSha256Hex,
  obj,
  sameText,
  serviceKeyFrom,
  supabaseChatRpc,
  type WhatsAppFetch,
} from '../whatsapp/servidor';

/**
 * Recebimento das mensagens do Telegram (D-080): a função do servidor (supabase/functions/telegram) só chama o que está aqui. As regras
 * de leitura e as respostas são as do WhatsApp (packages/core/src/whatsapp), com o canal 'telegram'. Sem custo: a API de bots do
 * Telegram é gratuita, e a Clarevo só RESPONDE, em texto simples, à mensagem que a pessoa acabou de mandar, na própria resposta à entrega
 * do Telegram (o pedido de envio volta no corpo da resposta). A função nem tem o token do bot: não há como mandar mensagem por iniciativa
 * da Clarevo, e quem lesse os segredos da função não conseguiria falar em nome do bot.
 */

/** Corpo máximo aceito (bytes): uma mensagem do Telegram com texto tem poucos KB. */
export const TELEGRAM_MAX_BODY_BYTES = 64 * 1024;

/**
 * Segredo do endereço (TELEGRAM_WEBHOOK_SECRET), que o Telegram manda no cabeçalho X-Telegram-Bot-Api-Secret-Token de cada entrega: só
 * letras, algarismos, _ e - (o que o Telegram aceita), com pelo menos 32, para não ser adivinhado.
 */
export const TELEGRAM_SECRET_PATTERN = /^[A-Za-z0-9_-]{32,256}$/;

/** Tamanho mínimo da chave dos resumos (TELEGRAM_ID_KEY). */
export const TELEGRAM_ID_KEY_MIN = 32;

/**
 * Resumo do identificador da pessoa no Telegram, com a chave secreta da função (TELEGRAM_ID_KEY): é o que o banco guarda, nunca o
 * identificador, o nome ou o @. Com HMAC, quem lê o banco sem a chave não volta ao identificador.
 */
export function telegramSenderHash(userId: number, idKey: string): string {
  return hmacSha256Hex(utf8Bytes(idKey), utf8Bytes(`telegram:${userId}`));
}

export interface TelegramInbound {
  /** A conversa (para a resposta). Numa conversa particular, é a própria conta de quem escreveu: nunca vai ao banco. */
  chatId: number;
  messageId: number;
  /** Quem mandou: usado só para o resumo, nunca guardado. Numa conversa particular, é o mesmo da conversa. */
  fromId: number;
  /** Segundos desde 1970 (UTC). */
  timestamp: number;
  kind: 'texto' | 'midia';
  text: string | null;
}

/** Mensagens que não são texto (recebem a resposta "só mensagens escritas"). Outras entregas, como avisos do serviço, ficam sem resposta. */
const MEDIA_KEYS = [
  'photo', 'voice', 'audio', 'video', 'video_note', 'sticker', 'document', 'animation', 'contact', 'location', 'venue', 'poll', 'dice', 'story',
];

const isId = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v);

/**
 * A mensagem de uma entrega do Telegram, só de conversa particular com uma pessoa (nunca de grupo, canal ou outro bot). Mensagem
 * editada, botões e qualquer outro tipo de entrega são ignorados (null).
 */
export function telegramInbound(payload: unknown): TelegramInbound | null {
  const msg = obj(obj(payload)?.message);
  if (!msg) return null;
  const chat = obj(msg.chat);
  const from = obj(msg.from);
  if (!chat || !from || chat.type !== 'private' || from.is_bot === true) return null;
  const chatId = chat.id;
  const fromId = from.id;
  const messageId = msg.message_id;
  const date = msg.date;
  if (!isId(chatId) || !isId(fromId) || chatId !== fromId || !isId(messageId) || messageId <= 0 || !isId(date) || date <= 0) return null;
  const base = { chatId, messageId, fromId, timestamp: date };
  if (typeof msg.text === 'string') return { ...base, kind: 'texto', text: msg.text };
  if (MEDIA_KEYS.some((k) => k in msg)) return { ...base, kind: 'midia', text: null };
  return null;
}

/**
 * Os comandos do Telegram no formato que a leitura das mensagens entende: o botão Iniciar manda "/start" (vira ajuda), o link do app manda
 * "/start <código>" (vira "Ativar <código>"); "/desfazer", "/desligar" e "/ajuda" são as palavras de sempre. Outro comando: ajuda.
 * Texto que não começa com "/" passa como está.
 */
export function telegramCommandText(text: string): string {
  const m = /^\/([A-Za-z_]+)(?:@[A-Za-z0-9_]+)?(?:\s+([\s\S]*))?$/.exec(text.trim());
  if (!m) return text;
  const arg = (m[2] ?? '').trim();
  switch (m[1]!.toLowerCase()) {
    case 'start':
      return arg === '' ? 'ajuda' : `ativar ${arg}`;
    case 'desfazer':
      return 'desfazer';
    case 'desligar':
    case 'parar':
    case 'stop':
      return 'desligar';
    default:
      return 'ajuda';
  }
}

export type TelegramRpc = (fn: string, args: Record<string, unknown>) => Promise<WhatsAppOutcome>;

/** Uma mensagem do Telegram: a resposta (null: não responder), pelas mesmas regras do WhatsApp, com as funções telegram_* do banco. */
export async function handleTelegramMessage(msg: TelegramInbound, rpc: TelegramRpc, idKey: string): Promise<string | null> {
  // Ao banco vão só resumos: o da conta e o da mensagem (a conversa e o número da mensagem juntos), nunca o identificador da conta.
  const base = { p_message_id: chatMessageKey('telegram', `${msg.chatId}:${msg.messageId}`, idKey), p_sender_hash: telegramSenderHash(msg.fromId, idKey) };
  return answerChatMessage(
    { channel: 'telegram', kind: msg.kind, text: msg.text === null ? null : telegramCommandText(msg.text), timestamp: msg.timestamp },
    (op, args) => rpc(`telegram_${op}`, { ...base, ...args }),
  );
}

/** Segredos e endereços da função do servidor (painel do Supabase, Edge Functions, Secrets). */
export interface TelegramConfig {
  webhookSecret: string;
  /** Chave dos resumos (HMAC). Trocar a chave desliga todas as contas ligadas pelo Telegram. */
  idKey: string;
  supabaseUrl: string;
  serviceKey: string;
}

/** Configuração lida dos segredos. null quando falta algum ou o segredo não serve (a função responde 503 e não faz nada). */
export function telegramConfigFrom(env: (name: string) => string | undefined): TelegramConfig | null {
  const v = (name: string) => (env(name) ?? '').trim();
  const webhookSecret = v('TELEGRAM_WEBHOOK_SECRET');
  const idKey = v('TELEGRAM_ID_KEY');
  const supabaseUrl = v('SUPABASE_URL').replace(/\/+$/, '');
  const serviceKey = serviceKeyFrom(v);
  if (!TELEGRAM_SECRET_PATTERN.test(webhookSecret) || idKey.length < TELEGRAM_ID_KEY_MIN || supabaseUrl === '' || serviceKey === '') return null;
  return { webhookSecret, idKey, supabaseUrl, serviceKey };
}

export interface TelegramRequest {
  method: string;
  header(name: string): string | null;
  /** O corpo, em texto. */
  body(): Promise<string>;
}

export interface TelegramResponse {
  status: number;
  body: string;
  contentType: 'text/plain; charset=utf-8' | 'application/json';
}

export interface TelegramHandlerDeps {
  config: TelegramConfig | null;
  fetch: WhatsAppFetch;
  /** Registro de falhas no log da função (sem texto de mensagem nem identificador). */
  log?: (message: string) => void;
}

const plain = (status: number, body: string): TelegramResponse => ({ status, body, contentType: 'text/plain; charset=utf-8' });

/**
 * A resposta à mensagem, no corpo da resposta à entrega: o Telegram envia o texto a quem escreveu, como resposta à mensagem dele. É o
 * único envio que existe, em texto simples (sem formatação e sem prévia de links).
 */
export function telegramReplyBody(msg: TelegramInbound, text: string): string {
  return JSON.stringify({
    method: 'sendMessage',
    chat_id: msg.chatId,
    text,
    reply_parameters: { message_id: msg.messageId, allow_sending_without_reply: true },
    link_preview_options: { is_disabled: true },
  });
}

/**
 * A função do servidor inteira, sem nada do Deno: confere o segredo do endereço (antes de ler o corpo), lê a mensagem, chama o banco e
 * devolve a resposta. Falha passageira do banco devolve 500, e o Telegram entrega de novo (a mensagem repetida não anota duas vezes nem
 * responde duas vezes).
 */
export function createTelegramHandler(deps: TelegramHandlerDeps): (req: TelegramRequest) => Promise<TelegramResponse> {
  const log = deps.log ?? (() => {});
  return async (req) => {
    const config = deps.config;
    if (!config) {
      log('configuração incompleta: faltam segredos da função');
      return plain(503, 'indisponível');
    }
    if (req.method !== 'POST') return plain(405, 'método não aceito');
    if (!sameText(req.header('x-telegram-bot-api-secret-token') ?? '', config.webhookSecret)) return plain(401, 'recusado');
    if (Number(req.header('content-length') ?? 0) > TELEGRAM_MAX_BODY_BYTES) return plain(413, 'grande demais');
    const text = await req.body();
    if (utf8Bytes(text).length > TELEGRAM_MAX_BODY_BYTES) return plain(413, 'grande demais');
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      return plain(400, 'corpo inválido');
    }
    const msg = telegramInbound(payload);
    if (!msg) return plain(200, 'ok');
    let reply: string | null;
    try {
      reply = await handleTelegramMessage(msg, supabaseChatRpc(config, deps.fetch), config.idKey);
    } catch (e) {
      log(`falha ao tratar uma mensagem: ${e instanceof Error ? e.message : 'erro'}`);
      // Recusa definitiva (4xx): responde que não deu; falha passageira: 500, e o Telegram entrega de novo.
      if (!(e instanceof WhatsAppFinalError)) return plain(500, 'tente de novo');
      reply = TELEGRAM_REPLY.erro;
    }
    if (reply === null) return plain(200, 'ok');
    return { status: 200, body: telegramReplyBody(msg, reply), contentType: 'application/json' };
  };
}
