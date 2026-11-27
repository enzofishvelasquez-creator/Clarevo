/// <reference types="node" />
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AVISOS_TOKEN_HEADER,
  MAX_PER_RUN,
  RESEND_EMAILS_URL,
  SEND_GAP_MS,
  avisoFimDoTesteConfigFrom,
  createAvisoFimDoTesteHandler,
  errorCode,
  parseClaim,
  retryableStatus,
  type AvisoFimDoTesteConfig,
  type HttpInit,
} from '../src/aviso-fim-do-teste/servidor';
import { SUBSCRIBE_OPEN } from '../src/plano-precos';
import { trialEndingEmail } from '../src/avisos-email';

/**
 * Função do servidor "aviso-fim-do-teste" (D-131 E, docs/53): só o agendamento (com o token) a acorda; o banco decide o modo, o dia e o
 * horário; a função envia pela API do Resend (aqui, um fetch de mentira: nenhum e-mail sai) e grava o resultado; sem a chave do Resend ou com
 * a compra fechada, nada sai; o ensaio grava sem enviar; nenhum e-mail vai para o registro.
 */
const TOKEN = 'token-de-teste-do-agendamento-0123456789abcdef';
const RESEND_KEY = 're_chave_de_teste_000000000';
const SUPABASE = 'https://projeto.supabase.co';
const CONFIG: AvisoFimDoTesteConfig = { supabaseUrl: SUPABASE, serviceKey: 'sb_secret_teste', token: TOKEN, resendKey: RESEND_KEY, appUrl: 'https://app.clarevo.app.br' };
const ID1 = '11111111-1111-4111-8111-111111111111';
const ID2 = '22222222-2222-4222-8222-222222222222';
const ID3 = '33333333-3333-4333-8333-333333333333';
const DAY = '2026-12-12';

type Sent = { url: string; init: HttpInit; body: Record<string, unknown> };
type Item = { id: string; email: string | null; trial_ends_on: string; dry_run: boolean };

/**
 * O banco e o Resend de mentira. O banco entrega os itens da fila um por vez (p_limit 1), no modo pedido; com o modo ligado e p_can_send
 * falso, não entrega nada (como trial_notice_claim). O Resend responde o que `resend` disser para cada pedido.
 */
function fake(opts: { mode?: string; window?: boolean; items?: Item[]; resend?: (n: number, body: Record<string, unknown>) => { status: number; body?: unknown } | 'rede'; claimStatus?: number; endless?: boolean }) {
  const queue = [...(opts.items ?? [])];
  const sent: Sent[] = [];
  const finished: Record<string, unknown>[] = [];
  const claims: Record<string, unknown>[] = [];
  let resendCalls = 0;
  const fetch = async (url: string, init: HttpInit) => {
    const body = JSON.parse(init.body) as Record<string, unknown>;
    sent.push({ url, init, body });
    if (url === `${SUPABASE}/rest/v1/rpc/trial_notice_claim`) {
      claims.push(body);
      if (opts.claimStatus) return { status: opts.claimStatus, text: async () => '{"message":"erro"}' };
      const mode = opts.mode ?? 'ligado';
      const blocked = mode === 'desligado' || opts.window === false || (mode === 'ligado' && body.p_can_send !== true);
      let items: Item[] = [];
      if (!blocked) {
        if (opts.endless) items = [{ id: ID1, email: 'pessoa@exemplo.test', trial_ends_on: DAY, dry_run: false }];
        else items = queue.splice(0, body.p_limit as number);
      }
      return { status: 200, text: async () => JSON.stringify({ mode, window: opts.window ?? true, seen: items.length, items }) };
    }
    if (url === `${SUPABASE}/rest/v1/rpc/trial_notice_finish`) {
      finished.push(body);
      return { status: 200, text: async () => JSON.stringify({ result: 'gravado' }) };
    }
    if (url === RESEND_EMAILS_URL) {
      resendCalls++;
      const r = opts.resend ? opts.resend(resendCalls, body) : { status: 200, body: { id: `msg-${resendCalls}` } };
      if (r === 'rede') throw new Error('falha de rede');
      return { status: r.status, text: async () => JSON.stringify(r.body ?? {}) };
    }
    return { status: 404, text: async () => '{}' };
  };
  return { fetch, sent, finished, claims, resendCount: () => resendCalls };
}

function handlerWith(f: ReturnType<typeof fake>, extra: { config?: AvisoFimDoTesteConfig | null; subscribeOpen?: boolean; now?: () => number } = {}) {
  const logs: string[] = [];
  const sleeps: number[] = [];
  const handler = createAvisoFimDoTesteHandler({
    config: extra.config === undefined ? CONFIG : extra.config,
    fetch: f.fetch,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    log: (m) => logs.push(m),
    subscribeOpen: extra.subscribeOpen ?? true,
    ...(extra.now ? { now: extra.now } : {}),
  });
  return { handler, logs, sleeps };
}

const req = (token: string | null = TOKEN, method = 'POST') => ({ method, header: (name: string) => (name === AVISOS_TOKEN_HEADER ? token : null) });
const item = (id: string, email: string | null, dry = false): Item => ({ id, email, trial_ends_on: DAY, dry_run: dry });

describe('função "aviso-fim-do-teste" (D-131 E): configuração e quem pode chamar', () => {
  it('a configuração: sem o token, o projeto ou a chave de serviço, nada; sem a chave do Resend, continua no ar sem enviar', () => {
    const env: Record<string, string> = { AVISOS_EMAIL_TOKEN: TOKEN, SUPABASE_URL: 'https://projeto.supabase.co/', SUPABASE_SECRET_KEYS: '{"default":"sb_secret_x"}', RESEND_API_KEY: RESEND_KEY };
    const from = (over: Record<string, string>) => avisoFimDoTesteConfigFrom((n) => ({ ...env, ...over })[n]);
    expect(from({})).toEqual({ supabaseUrl: SUPABASE, serviceKey: 'sb_secret_x', token: TOKEN, resendKey: RESEND_KEY, appUrl: 'https://app.clarevo.app.br' });
    expect(from({ AVISOS_EMAIL_TOKEN: '' })).toBeNull();
    expect(from({ AVISOS_EMAIL_TOKEN: 'curto' })).toBeNull();
    expect(from({ AVISOS_EMAIL_TOKEN: `${'x'.repeat(40)} com espaço` })).toBeNull();
    expect(from({ SUPABASE_URL: '' })).toBeNull();
    expect(from({ SUPABASE_SECRET_KEYS: '', SUPABASE_SERVICE_ROLE_KEY: '' })).toBeNull();
    expect(from({ RESEND_API_KEY: '' })?.resendKey).toBeNull();
    expect(from({ RESEND_API_KEY: 'chave-sem-prefixo-0123456789' })?.resendKey).toBeNull();
    expect(from({ RESEND_API_KEY: 're_curta' })?.resendKey).toBeNull();
    expect(from({ CLAREVO_APP_URL: 'https://outro.exemplo.test/' })?.appUrl).toBe('https://outro.exemplo.test');
    expect(from({ CLAREVO_APP_URL: 'javascript:alert(1)' })).toBeNull();
    expect(avisoFimDoTesteConfigFrom(() => undefined)).toBeNull();
  });

  it('sem configuração: 503 e nenhuma chamada; só POST; sem o token certo, 401 e nada acontece (nem o banco é chamado)', async () => {
    const f = fake({ items: [item(ID1, 'pessoa@exemplo.test')] });
    expect((await handlerWith(f, { config: null }).handler(req())).status).toBe(503);
    const { handler } = handlerWith(f);
    expect((await handler(req(TOKEN, 'GET'))).status).toBe(405);
    expect((await handler(req(null))).status).toBe(401);
    expect((await handler(req(''))).status).toBe(401);
    expect((await handler(req(`${TOKEN}x`))).status).toBe(401);
    expect((await handler(req(TOKEN.replace('t', 'T')))).status).toBe(401);
    expect(f.sent).toEqual([]);
  });
});

describe('função "aviso-fim-do-teste": os interruptores e o ensaio', () => {
  it('desligado no banco: um pedido à fila, nada entregue, nada enviado', async () => {
    const f = fake({ mode: 'desligado', items: [item(ID1, 'pessoa@exemplo.test')] });
    const { handler, logs } = handlerWith(f);
    const r = await handler(req());
    expect(r.status).toBe(200);
    expect(JSON.parse(r.body)).toMatchObject({ result: 'ok', modo: 'desligado', enviados: 0, ensaios: 0 });
    expect(f.claims).toEqual([{ p_limit: 1, p_can_send: true }]);
    expect(f.resendCount()).toBe(0);
    expect(f.finished).toEqual([]);
    expect(logs.join('\n')).toContain('modo=desligado');
  });

  it('ligado sem a chave do Resend (o segundo interruptor): a função diz que não pode enviar, o banco não entrega e nada sai', async () => {
    const f = fake({ mode: 'ligado', items: [item(ID1, 'pessoa@exemplo.test')] });
    const { handler, logs } = handlerWith(f, { config: { ...CONFIG, resendKey: null } });
    const r = JSON.parse((await handler(req())).body) as Record<string, unknown>;
    expect(r).toMatchObject({ modo: 'ligado', envio_possivel: false, motivo: 'sem_chave', enviados: 0 });
    expect(f.claims).toEqual([{ p_limit: 1, p_can_send: false }]);
    expect(f.resendCount()).toBe(0);
    expect(logs.join('\n')).toContain('falta RESEND_API_KEY');
  });

  it('ligado com a chave, mas com a compra fechada (SUBSCRIBE_OPEN): o e-mail manda assinar, então nada sai', async () => {
    const f = fake({ mode: 'ligado', items: [item(ID1, 'pessoa@exemplo.test')] });
    const { handler } = handlerWith(f, { subscribeOpen: false });
    const r = JSON.parse((await handler(req())).body) as Record<string, unknown>;
    expect(r).toMatchObject({ envio_possivel: false, motivo: 'compra_fechada', enviados: 0 });
    expect(f.resendCount()).toBe(0);
    // Hoje a compra está fechada no núcleo: a função gerada não envia nada de verdade, mesmo com a chave.
    expect(SUBSCRIBE_OPEN).toBe(false);
  });

  it('ensaio: grava o que enviaria, sem chamar o Resend, sem receber o e-mail e sem precisar da chave', async () => {
    const f = fake({ mode: 'ensaio', items: [item(ID1, null, true), item(ID2, null, true)] });
    const { handler } = handlerWith(f, { config: { ...CONFIG, resendKey: null }, subscribeOpen: false });
    const r = JSON.parse((await handler(req())).body) as Record<string, unknown>;
    expect(r).toMatchObject({ modo: 'ensaio', ensaios: 2, enviados: 0 });
    expect(f.resendCount()).toBe(0);
    expect(f.finished).toEqual([
      { p_id: ID1, p_outcome: 'ensaio' },
      { p_id: ID2, p_outcome: 'ensaio' },
    ]);
  });

  it('fora do horário (o banco decide): nada entregue', async () => {
    const f = fake({ mode: 'ligado', window: false, items: [item(ID1, 'pessoa@exemplo.test')] });
    const r = JSON.parse((await handlerWith(f).handler(req())).body) as Record<string, unknown>;
    expect(r).toMatchObject({ janela: false, enviados: 0 });
    expect(f.resendCount()).toBe(0);
  });
});

describe('função "aviso-fim-do-teste": o envio pelo Resend', () => {
  it('envia um por vez, com a chave, a chave de idempotência do aviso, o remetente da Clarevo e o texto do núcleo; grava o identificador', async () => {
    const f = fake({ items: [item(ID1, 'ana@exemplo.test'), item(ID2, 'bia@exemplo.test')] });
    const { handler, logs, sleeps } = handlerWith(f);
    const r = JSON.parse((await handler(req())).body) as Record<string, unknown>;
    expect(r).toMatchObject({ result: 'ok', modo: 'ligado', envio_possivel: true, enviados: 2, falhas: 0, recusados: 0 });
    const resend = f.sent.filter((s) => s.url === RESEND_EMAILS_URL);
    expect(resend).toHaveLength(2);
    const msg = trialEndingEmail(DAY, 'https://app.clarevo.app.br');
    expect(resend[0]!.init.headers).toEqual({
      Authorization: `Bearer ${RESEND_KEY}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': `aviso-fim-do-teste/${ID1}`,
      'User-Agent': 'Clarevo',
    });
    expect(resend[0]!.body).toEqual({
      from: 'Clarevo <nao-responda@clarevo.app.br>',
      to: ['ana@exemplo.test'],
      reply_to: 'suporte@clarevo.app.br',
      subject: msg.subject,
      text: msg.text,
      html: msg.html,
    });
    expect(resend[1]!.body.to).toEqual(['bia@exemplo.test']);
    expect(resend[1]!.init.headers['Idempotency-Key']).toBe(`aviso-fim-do-teste/${ID2}`);
    // No máximo 2 por segundo: uma espera entre os dois envios, nenhuma antes do primeiro.
    expect(sleeps).toEqual([SEND_GAP_MS]);
    expect(f.finished).toEqual([
      { p_id: ID1, p_outcome: 'enviado', p_message_id: 'msg-1' },
      { p_id: ID2, p_outcome: 'enviado', p_message_id: 'msg-2' },
    ]);
    // As chamadas ao banco vão com a chave de serviço; o registro nunca leva e-mail.
    for (const s of f.sent.filter((x) => x.url.startsWith(SUPABASE))) expect(s.init.headers.apikey).toBe('sb_secret_teste');
    expect(logs.join('\n')).not.toContain('@');
  });

  it('recusa do Resend (422) grava recusado e segue; limite (429) grava falhou e para a rodada; o registro tem só o aviso e o código', async () => {
    const f = fake({
      items: [item(ID1, 'ana@exemplo.test'), item(ID2, 'bia@exemplo.test'), item(ID3, 'caio@exemplo.test')],
      resend: (n) =>
        n === 1
          ? { status: 422, body: { statusCode: 422, name: 'validation_error', message: 'Invalid `to` field: ana@exemplo.test' } }
          : { status: 429, body: { statusCode: 429, name: 'rate_limit_exceeded', message: 'Too many requests' } },
    });
    const { handler, logs } = handlerWith(f);
    const r = JSON.parse((await handler(req())).body) as Record<string, unknown>;
    expect(r).toMatchObject({ enviados: 0, recusados: 1, falhas: 1 });
    expect(f.finished).toEqual([
      { p_id: ID1, p_outcome: 'recusado', p_error: 'http_422_validation_error' },
      { p_id: ID2, p_outcome: 'falhou', p_error: 'http_429_rate_limit_exceeded' },
    ]);
    expect(f.resendCount()).toBe(2);
    expect(logs.join('\n')).not.toContain('@');
    expect(logs).toContain(`aviso-fim-do-teste: aviso ${ID2} falhou: http_429_rate_limit_exceeded`);
  });

  it('falha de rede, resposta sem identificador e e-mail que não parece e-mail', async () => {
    const net = fake({ items: [item(ID1, 'ana@exemplo.test')], resend: () => 'rede' });
    await handlerWith(net).handler(req());
    expect(net.finished).toEqual([{ p_id: ID1, p_outcome: 'falhou', p_error: 'rede' }]);

    const noId = fake({ items: [item(ID1, 'ana@exemplo.test')], resend: () => ({ status: 200, body: {} }) });
    await handlerWith(noId).handler(req());
    expect(noId.finished).toEqual([{ p_id: ID1, p_outcome: 'falhou', p_error: 'resposta_sem_id' }]);

    const bad = fake({ items: [item(ID1, 'sem arroba'), item(ID2, null)] });
    await handlerWith(bad).handler(req());
    expect(bad.resendCount()).toBe(0);
    expect(bad.finished).toEqual([
      { p_id: ID1, p_outcome: 'recusado', p_error: 'sem_email' },
      { p_id: ID2, p_outcome: 'recusado', p_error: 'sem_email' },
    ]);
  });

  it('o banco fora do ar: 502, nada enviado', async () => {
    const f = fake({ claimStatus: 500 });
    const r = await handlerWith(f).handler(req());
    expect(r.status).toBe(502);
    expect(f.resendCount()).toBe(0);
  });

  it('limites da rodada: no máximo MAX_PER_RUN envios e o tempo da rodada', async () => {
    const many = fake({ endless: true });
    const r = JSON.parse((await handlerWith(many).handler(req())).body) as Record<string, unknown>;
    expect(r.enviados).toBe(MAX_PER_RUN);
    expect(many.resendCount()).toBe(MAX_PER_RUN);

    let clock = 0;
    const slow = fake({ endless: true, resend: () => ((clock += 25_000), { status: 200, body: { id: 'x-1' } }) });
    const r2 = JSON.parse((await handlerWith(slow, { now: () => clock }).handler(req())).body) as Record<string, unknown>;
    expect(r2.enviados).toBe(3);
  });

  it('códigos de erro curtos e o que é passageiro', () => {
    expect(errorCode(422, 'validation_error')).toBe('http_422_validation_error');
    expect(errorCode(403, 'Invalid API Key!')).toBe('http_403_invalid_api_key');
    expect(errorCode(500, undefined)).toBe('http_500');
    expect(errorCode(429, 'x'.repeat(100))).toHaveLength(60);
    expect(errorCode(400, 'pessoa@exemplo.test')).toMatch(/^[a-z0-9_]{1,60}$/);
    for (const s of [401, 403, 408, 409, 429, 500, 503]) expect(retryableStatus(s), String(s)).toBe(true);
    for (const s of [400, 404, 405, 413, 422]) expect(retryableStatus(s), String(s)).toBe(false);
  });

  it('a resposta do banco: item fora do formato fica de fora', () => {
    expect(parseClaim(null)).toBeNull();
    expect(parseClaim({ mode: 'ligado' })).toBeNull();
    const p = parseClaim({ mode: 'ligado', window: true, seen: 3, items: [item(ID1, 'a@b.test'), { id: 'x', trial_ends_on: DAY, dry_run: false }, { id: ID2, trial_ends_on: '12/12/2026', dry_run: false }] });
    expect(p).toEqual({ mode: 'ligado', window: true, seen: 3, items: [{ id: ID1, email: 'a@b.test', trialEndsOn: DAY, dryRun: false }] });
  });
});

describe('função "aviso-fim-do-teste" gerada (supabase/functions/aviso-fim-do-teste)', () => {
  it('está em dia com o núcleo e roda como no Deno: sem token, 401; com token, pede a fila; com a compra fechada, não envia', async () => {
    const root = join(__dirname, '../../..');
    execFileSync('node', [join(root, 'scripts/gerar-funcoes.js'), '--conferir']);
    const src = readFileSync(join(root, 'supabase/functions/aviso-fim-do-teste/index.ts'), 'utf8');
    const env: Record<string, string> = { AVISOS_EMAIL_TOKEN: TOKEN, RESEND_API_KEY: RESEND_KEY, SUPABASE_URL: SUPABASE, SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_x' };
    let serve: ((req: Request) => Promise<Response>) | undefined;
    const deno = { env: { get: (n: string) => env[n] }, serve: (h: (req: Request) => Promise<Response>) => (serve = h) };
    const sent: { url: string; body: string }[] = [];
    const fakeFetch = async (url: string, init: { method: string; body?: string; signal?: AbortSignal }) => {
      sent.push({ url, body: init.body ?? '' });
      expect(init.signal).toBeInstanceOf(AbortSignal);
      if (url.endsWith('/rpc/trial_notice_claim')) return new Response(JSON.stringify({ mode: 'ligado', window: true, seen: 0, items: [] }), { status: 200 });
      return new Response('{}', { status: 404 });
    };
    const logs: string[] = [];
    new Function('Deno', 'fetch', 'console', src)(deno, fakeFetch, { error: (m: string) => logs.push(m) });
    expect(serve).toBeDefined();
    const denied = await serve!(new Request('https://f/aviso-fim-do-teste', { method: 'POST' }));
    expect(denied.status).toBe(401);
    expect(sent).toEqual([]);
    const ok = await serve!(new Request('https://f/aviso-fim-do-teste', { method: 'POST', headers: { [AVISOS_TOKEN_HEADER]: TOKEN } }));
    expect(ok.status).toBe(200);
    expect(ok.headers.get('Content-Type')).toContain('application/json');
    expect(await ok.json()).toMatchObject({ modo: 'ligado', envio_possivel: false, motivo: 'compra_fechada' });
    expect(sent.map((s) => s.url)).toEqual([`${SUPABASE}/rest/v1/rpc/trial_notice_claim`]);
    expect(JSON.parse(sent[0]!.body)).toEqual({ p_limit: 1, p_can_send: false });
    // A função leva o texto do aviso e o servidor, e nada das telas.
    expect(src).toContain('packages/core/src/avisos-email.ts');
    expect(src).not.toContain('packages/core/src/plano.ts');
  });

  it('nenhuma chave no código: o módulo, os textos e a função gerada não trazem chave do Resend, token nem segredo', () => {
    const files = [
      ...readdirSync(join(__dirname, '../src/aviso-fim-do-teste')).map((f) => join(__dirname, '../src/aviso-fim-do-teste', f)),
      join(__dirname, '../src/avisos-email.ts'),
      join(__dirname, '../../../supabase/functions/aviso-fim-do-teste/index.ts'),
      join(__dirname, '../../../supabase/migrations/20261128000002_aviso_fim_do_teste.sql'),
    ];
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/\bre_[A-Za-z0-9_]{8,}|sb_secret_[A-Za-z0-9]{8,}|eyJ[A-Za-z0-9_-]{20,}\./);
    }
  });
});
