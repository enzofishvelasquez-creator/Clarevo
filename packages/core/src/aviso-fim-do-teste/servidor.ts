/**
 * Aviso de fim do teste por e-mail (D-131, item E; `docs/53_AVISOS_POR_EMAIL.md`): a função do servidor "aviso-fim-do-teste" (Edge Function do
 * Supabase), gerada num arquivo só por `scripts/gerar-funcoes.js`. O banco prepara a fila (migração 0051, pelo pg_cron); esta função só
 * envia. Ela é acordada de hora em hora, das 9h às 17h de Brasília, pelo agendamento do banco, com o token combinado no cabeçalho
 * `x-clarevo-avisos-token` (como os avisos do Asaas e do Telegram: publicada com a verificação de JWT do painel DESLIGADA, e a própria função
 * confere o token; sem ele, 401 e nada acontece). Ninguém de fora dispara envio: sem o token, a função nem chama o banco.
 *
 * Cada rodada pede ao banco um aviso por vez (`trial_notice_claim`, com a chave de serviço), envia pela API do Resend e grava o resultado
 * (`trial_notice_finish`), até a fila do dia acabar, MAX_PER_RUN avisos ou RUN_BUDGET_MS. O banco decide o modo, o dia e o horário; a função
 * diz se pode enviar de verdade (`p_can_send`): só com a chave RESEND_API_KEY e com a compra aberta (`SUBSCRIBE_OPEN`, porque o e-mail manda
 * assinar na tela Assinatura). Sem isso, no modo ligado, o banco não entrega nada e a fila fica como estava. No ensaio, a função monta a
 * mensagem e só grava 'ensaio', sem chamar o Resend e sem receber o e-mail da pessoa.
 *
 * Envio: um e-mail por pedido, com a chave `Idempotency-Key` igual ao identificador do aviso (o Resend não repete o envio da mesma chave por
 * 24 horas: uma nova tentativa depois de uma queda no meio não manda duas vezes), no máximo 2 por segundo (SEND_GAP_MS). Falha passageira
 * (rede, prazo, 401, 403, 408, 409, 429, 5xx) grava 'falhou' e para a rodada (a próxima tenta de novo, até 3 vezes); recusa do Resend (400,
 * 404, 422 e as outras) grava 'recusado'. O registro (logs) leva só contagens, o identificador do aviso e códigos curtos: nunca o e-mail.
 *
 * Segredos (painel do Supabase, Edge Functions, Secrets, só o Enzo): AVISOS_EMAIL_TOKEN (32 a 255 letras, algarismos, _ ou -, o mesmo que o
 * agendamento manda, guardado no Vault do banco) e RESEND_API_KEY (a chave do Resend, re_...; sem ela, nada é enviado). SUPABASE_URL e a
 * chave de serviço o Supabase fornece. Opcional: CLAREVO_APP_URL (padrão https://app.clarevo.app.br), para o endereço da tela Assinatura.
 */
import { NOTICE_EMAIL_FROM, NOTICE_EMAIL_REPLY_TO, trialEndingEmail } from '../avisos-email';
import { SUBSCRIBE_OPEN } from '../plano-precos';
import { obj, sameText, serviceHeaders, serviceKeyFrom } from '../servidor-comum';

export const RESEND_EMAILS_URL = 'https://api.resend.com/emails';
export const AVISOS_TOKEN_HEADER = 'x-clarevo-avisos-token';
export const AVISOS_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,255}$/;
/** As chaves de API do Resend começam com re_. Outra coisa no segredo conta como sem chave (nada é enviado). */
export const RESEND_KEY_PATTERN = /^re_[A-Za-z0-9_-]{8,200}$/;
export const AVISO_APP_URL_DEFAULT = 'https://app.clarevo.app.br';
/** Quantos avisos uma rodada envia no máximo (de hora em hora, 9 rodadas por dia: até 450 por dia). */
export const MAX_PER_RUN = 50;
/** Intervalo entre dois envios: no máximo 2 pedidos por segundo, o limite padrão da API do Resend. */
export const SEND_GAP_MS = 600;
/** Tempo de uma rodada (as funções do Supabase têm alguns minutos; sobra folga) e o prazo de cada pedido. */
export const RUN_BUDGET_MS = 60_000;
export const CALL_TIMEOUT_MS = 10_000;

export interface AvisoFimDoTesteConfig {
  supabaseUrl: string;
  serviceKey: string;
  /** O token que o agendamento manda no cabeçalho `x-clarevo-avisos-token`. */
  token: string;
  /** A chave do Resend; null quando falta (o segundo interruptor: nada é enviado de verdade). */
  resendKey: string | null;
  /** Origem do app na web (sem barra no fim), para o endereço da tela Assinatura. */
  appUrl: string;
}

/**
 * Configuração lida dos segredos. null quando falta o token, o endereço do projeto ou a chave de serviço (a função responde 503 e não faz
 * nada). A chave do Resend pode faltar: a função continua no ar para o ensaio, sem enviar.
 */
export function avisoFimDoTesteConfigFrom(env: (name: string) => string | undefined): AvisoFimDoTesteConfig | null {
  const v = (name: string) => (env(name) ?? '').trim();
  const token = v('AVISOS_EMAIL_TOKEN');
  if (!AVISOS_TOKEN_PATTERN.test(token)) return null;
  const supabaseUrl = v('SUPABASE_URL').replace(/\/+$/, '');
  const serviceKey = serviceKeyFrom(v);
  if (supabaseUrl === '' || serviceKey === '' || serviceKey === token) return null;
  const appUrl = (v('CLAREVO_APP_URL') || AVISO_APP_URL_DEFAULT).replace(/\/+$/, '');
  if (!/^https:\/\/[a-z0-9.-]+$/.test(appUrl) && !/^http:\/\/localhost(:\d+)?$/.test(appUrl)) return null;
  const key = v('RESEND_API_KEY');
  const resendKey = RESEND_KEY_PATTERN.test(key) && key !== token ? key : null;
  return { supabaseUrl, serviceKey, token, resendKey, appUrl };
}

export interface HttpInit {
  method: 'POST';
  headers: Record<string, string>;
  body: string;
  /** Prazo da chamada; quem liga a função ao `fetch` o transforma em `AbortSignal.timeout`. */
  timeoutMs: number;
}
export interface HttpResponse {
  status: number;
  text(): Promise<string>;
}
export type HttpFetch = (url: string, init: HttpInit) => Promise<HttpResponse>;

export interface AvisoFimDoTesteRequest {
  method: string;
  header: (name: string) => string | null;
}
export interface AvisoFimDoTesteResponse {
  status: number;
  body: string;
  headers: Record<string, string>;
}

export interface AvisoFimDoTesteDeps {
  config: AvisoFimDoTesteConfig | null;
  fetch: HttpFetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  log?: (message: string) => void;
  /** Só nos testes: a compra aberta (o padrão é `SUBSCRIBE_OPEN`, do núcleo). */
  subscribeOpen?: boolean;
}

/** Um aviso entregue pelo banco. */
export interface ClaimedNotice {
  id: string;
  email: string | null;
  trialEndsOn: string;
  dryRun: boolean;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$/;
const JSON_TYPE = 'application/json; charset=utf-8';

/** Lê a resposta de trial_notice_claim. Item fora do formato fica de fora (o banco só manda o que ele mesmo gravou). */
export function parseClaim(raw: unknown): { mode: string; window: boolean; seen: number; items: ClaimedNotice[] } | null {
  const r = obj(raw);
  if (!r || typeof r.mode !== 'string' || !Array.isArray(r.items)) return null;
  const items: ClaimedNotice[] = [];
  for (const x of r.items) {
    const it = obj(x);
    const id = typeof it?.id === 'string' ? it.id : '';
    const day = typeof it?.trial_ends_on === 'string' ? it.trial_ends_on : '';
    if (!it || !UUID.test(id) || !/^\d{4}-\d{2}-\d{2}$/.test(day) || typeof it.dry_run !== 'boolean') continue;
    items.push({ id, email: typeof it.email === 'string' ? it.email.trim() : null, trialEndsOn: day, dryRun: it.dry_run });
  }
  return { mode: r.mode, window: r.window === true, seen: typeof r.seen === 'number' ? r.seen : items.length, items };
}

/** O resultado de um envio ao Resend, como o banco grava. */
export type SendResult = { outcome: 'enviado'; messageId: string } | { outcome: 'falhou' | 'recusado'; error: string };

/** Código curto do erro: o estado HTTP e o nome do erro do Resend (nunca a mensagem, que pode trazer o e-mail). */
export function errorCode(status: number, name: unknown): string {
  const n = typeof name === 'string' ? name.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') : '';
  return `http_${status}${n === '' ? '' : `_${n}`}`.slice(0, 60);
}

/** Falha que passa sozinha (ou que a chave certa resolve): a próxima rodada tenta de novo. */
export function retryableStatus(status: number): boolean {
  return status === 401 || status === 403 || status === 408 || status === 409 || status === 429 || status >= 500;
}

/** O corpo do pedido ao Resend: remetente da Clarevo, resposta para o suporte, assunto, texto puro e HTML, sem rastreio. */
export function resendRequest(notice: ClaimedNotice, appUrl: string): Record<string, unknown> {
  if (!notice.email || !EMAIL.test(notice.email)) throw new Error('sem e-mail');
  const msg = trialEndingEmail(notice.trialEndsOn, appUrl);
  return { from: NOTICE_EMAIL_FROM, to: [notice.email], reply_to: NOTICE_EMAIL_REPLY_TO, subject: msg.subject, text: msg.text, html: msg.html };
}

function json(status: number, body: unknown): AvisoFimDoTesteResponse {
  return { status, body: JSON.stringify(body), headers: { 'Content-Type': JSON_TYPE } };
}

async function readJson(res: HttpResponse): Promise<unknown> {
  try {
    const text = await res.text();
    return text === '' ? null : (JSON.parse(text) as unknown);
  } catch {
    return null;
  }
}

export function createAvisoFimDoTesteHandler(deps: AvisoFimDoTesteDeps): (req: AvisoFimDoTesteRequest) => Promise<AvisoFimDoTesteResponse> {
  const log = deps.log ?? (() => {});
  const now = deps.now ?? (() => Date.now());
  const sleep = deps.sleep ?? (() => Promise.resolve());
  const subscribeOpen = deps.subscribeOpen ?? SUBSCRIBE_OPEN;
  const config = deps.config;

  async function rpc(cfg: AvisoFimDoTesteConfig, fn: string, args: Record<string, unknown>): Promise<{ status: number; json: unknown }> {
    try {
      const res = await deps.fetch(`${cfg.supabaseUrl}/rest/v1/rpc/${fn}`, {
        method: 'POST',
        headers: serviceHeaders(cfg.serviceKey),
        body: JSON.stringify(args),
        timeoutMs: CALL_TIMEOUT_MS,
      });
      return { status: res.status, json: await readJson(res) };
    } catch {
      return { status: 0, json: null };
    }
  }

  async function send(cfg: AvisoFimDoTesteConfig, key: string, notice: ClaimedNotice): Promise<SendResult> {
    let body: Record<string, unknown>;
    try {
      body = resendRequest(notice, cfg.appUrl);
    } catch {
      return { outcome: 'recusado', error: 'sem_email' };
    }
    let res: HttpResponse;
    try {
      res = await deps.fetch(RESEND_EMAILS_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': `aviso-fim-do-teste/${notice.id}`,
          'User-Agent': 'Clarevo',
        },
        body: JSON.stringify(body),
        timeoutMs: CALL_TIMEOUT_MS,
      });
    } catch {
      return { outcome: 'falhou', error: 'rede' };
    }
    const out = obj(await readJson(res));
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
    if (req.method !== 'POST') return json(405, { result: 'metodo_nao_aceito' });
    if (!sameText(req.header(AVISOS_TOKEN_HEADER) ?? '', config.token)) return json(401, { result: 'nao_autorizado' });

    const key = config.resendKey;
    const canSend = key !== null && subscribeOpen;
    const startedAt = now();
    const totals = { enviados: 0, ensaios: 0, falhas: 0, recusados: 0 };
    let mode = 'desligado';
    let windowOpen = false;
    let processed = 0;
    let sentBefore = false;
    let stop = false;

    while (!stop && processed < MAX_PER_RUN && now() - startedAt < RUN_BUDGET_MS) {
      const r = await rpc(config, 'trial_notice_claim', { p_limit: 1, p_can_send: canSend });
      const claim = r.status === 200 ? parseClaim(r.json) : null;
      if (!claim) {
        log(`aviso-fim-do-teste: o banco não entregou a fila (${r.status})`);
        return json(502, { result: 'banco_indisponivel', ...totals });
      }
      mode = claim.mode;
      windowOpen = claim.window;
      if (claim.seen === 0) break;
      for (const notice of claim.items) {
        processed++;
        let result: SendResult | { outcome: 'ensaio' };
        if (notice.dryRun) {
          // Ensaio: monta a mensagem (confere a data e o endereço) e só grava, sem chamar o Resend.
          trialEndingEmail(notice.trialEndsOn, config.appUrl);
          result = { outcome: 'ensaio' };
        } else if (key === null || !canSend) {
          // O banco não entrega aviso de verdade sem p_can_send; por garantia, nada sai.
          result = { outcome: 'falhou', error: 'sem_chave' };
          stop = true;
        } else {
          if (sentBefore) await sleep(SEND_GAP_MS);
          sentBefore = true;
          result = await send(config, key, notice);
          if (result.outcome === 'falhou') stop = true;
        }
        const args: Record<string, unknown> = { p_id: notice.id, p_outcome: result.outcome };
        if (result.outcome === 'enviado') args.p_message_id = result.messageId;
        if (result.outcome === 'falhou' || result.outcome === 'recusado') args.p_error = result.error;
        const saved = await rpc(config, 'trial_notice_finish', args);
        if (saved.status !== 200) log(`aviso-fim-do-teste: aviso ${notice.id} sem resultado gravado (${saved.status})`);
        if (result.outcome === 'enviado') totals.enviados++;
        else if (result.outcome === 'ensaio') totals.ensaios++;
        else {
          if (result.outcome === 'falhou') totals.falhas++;
          else totals.recusados++;
          log(`aviso-fim-do-teste: aviso ${notice.id} ${result.outcome}: ${result.error}`);
        }
      }
    }

    let motivo: string | null = null;
    if (mode === 'ligado' && !canSend) {
      motivo = key === null ? 'sem_chave' : 'compra_fechada';
      log(`aviso-fim-do-teste: ligado, mas nada foi enviado (${key === null ? 'falta RESEND_API_KEY' : 'compra fechada, SUBSCRIBE_OPEN'})`);
    }
    log(`aviso-fim-do-teste: modo=${mode} janela=${windowOpen ? 'aberta' : 'fechada'} enviados=${totals.enviados} ensaios=${totals.ensaios} falhas=${totals.falhas} recusados=${totals.recusados}`);
    return json(200, { result: 'ok', modo: mode, janela: windowOpen, envio_possivel: canSend, ...(motivo ? { motivo } : {}), ...totals });
  };
}
