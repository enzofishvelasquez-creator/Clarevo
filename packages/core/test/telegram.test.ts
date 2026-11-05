/// <reference types="node" />
import { execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';
import {
  TELEGRAM_BOT,
  TELEGRAM_DOWNLOAD,
  TELEGRAM_DOWNLOAD_TEXT,
  TELEGRAM_IN_ACCOUNT,
  TELEGRAM_REPLY,
  TELEGRAM_TEXT,
  WHATSAPP_REPLY,
  chatMessageKey,
  createTelegramHandler,
  handleTelegramMessage,
  isTelegramBotName,
  telegramCommandText,
  telegramConfigFrom,
  telegramDownloadLink,
  telegramInbound,
  telegramReplyBody,
  telegramSenderHash,
  telegramStartLink,
  whatsappOutcomeReply,
  whatsappParseReply,
  whatsappPhoneHash,
  type TelegramConfig,
  type TelegramInbound,
  type WhatsAppFetch,
  type WhatsAppOutcome,
} from '../src';

/** Dados FICTÍCIOS. Identificadores do Telegram inventados. */
const USER = 700100200;
const NOW = Date.UTC(2026, 10, 1, 15, 0) / 1000; // 01/11/2026, 12h em Brasília
const SECRET = 'segredo_do_endereco_de_teste_0123456789';
const KEY = 'chave-dos-resumos-de-teste-0123456789abcdef';

function update(message: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return { update_id: 10, message: { message_id: 5, date: NOW, chat: { id: USER, type: 'private' }, from: { id: USER, is_bot: false, first_name: 'Ana' }, ...message }, ...extra };
}
const text = (t: string, id = 5) => update({ message_id: id, text: t });
const inbound = (t: string | null, kind: 'texto' | 'midia' = 'texto'): TelegramInbound => ({
  chatId: USER, messageId: 5, fromId: USER, timestamp: NOW, kind, text: t,
});
/** O identificador que vai ao banco: 'telegram:' e o resumo da conversa e da mensagem (a conversa é a conta de quem escreve). */
const stored = (messageId = 5) => chatMessageKey('telegram', `${USER}:${messageId}`, KEY);

describe('Telegram: leitura da entrega', () => {
  it('só mensagem de conversa particular, de uma pessoa', () => {
    expect(telegramInbound(text('mercado 52,30'))).toEqual({
      chatId: USER, messageId: 5, fromId: USER, timestamp: NOW, kind: 'texto', text: 'mercado 52,30',
    });
    expect(telegramInbound(update({ photo: [{ file_id: 'x' }], caption: 'mercado 10' }))?.kind).toBe('midia');
    expect(telegramInbound(update({ voice: { file_id: 'x' } }))).toMatchObject({ kind: 'midia', text: null });
    // Grupo, canal, outro bot, conversa de outra pessoa, mensagem editada, botões e avisos do serviço: nada.
    expect(telegramInbound(update({ text: 'oi', chat: { id: -100, type: 'group' } }))).toBeNull();
    expect(telegramInbound(update({ text: 'oi', chat: { id: -100, type: 'channel' } }))).toBeNull();
    expect(telegramInbound(update({ text: 'oi', from: { id: USER, is_bot: true } }))).toBeNull();
    expect(telegramInbound(update({ text: 'oi', from: { id: 1, is_bot: false } }))).toBeNull();
    expect(telegramInbound({ update_id: 1, edited_message: text('mercado 5').message })).toBeNull();
    expect(telegramInbound({ update_id: 1, callback_query: { id: 'x' } })).toBeNull();
    expect(telegramInbound(update({ new_chat_title: 'x' }))).toBeNull();
    // Campos fora do formato.
    expect(telegramInbound(update({ text: 'oi', message_id: 0 }))).toBeNull();
    expect(telegramInbound(update({ text: 'oi', message_id: '5' }))).toBeNull();
    expect(telegramInbound(update({ text: 'oi', date: 1.5 }))).toBeNull();
    expect(telegramInbound(update({ text: 'oi', chat: { id: 1e20, type: 'private' }, from: { id: 1e20 } }))).toBeNull();
    expect(telegramInbound(null)).toBeNull();
    expect(telegramInbound('texto')).toBeNull();
  });

  it('comandos: Iniciar vira ajuda, o link do app liga, e as palavras de sempre', () => {
    expect(telegramCommandText('/start')).toBe('ajuda');
    expect(telegramCommandText('/start ABCD2345')).toBe('ativar ABCD2345');
    expect(telegramCommandText('/start@ClarevoBot ABCD2345')).toBe('ativar ABCD2345');
    expect(telegramCommandText('  /Start   ABCD2345  ')).toBe('ativar ABCD2345');
    expect(telegramCommandText('/desfazer')).toBe('desfazer');
    expect(telegramCommandText('/DESLIGAR')).toBe('desligar');
    expect(telegramCommandText('/stop')).toBe('desligar');
    expect(telegramCommandText('/parar')).toBe('desligar');
    expect(telegramCommandText('/ajuda')).toBe('ajuda');
    expect(telegramCommandText('/help')).toBe('ajuda');
    expect(telegramCommandText('/configuracoes')).toBe('ajuda');
    expect(telegramCommandText('mercado 52,30')).toBe('mercado 52,30');
    expect(telegramCommandText('1/2 pizza 30')).toBe('1/2 pizza 30');
  });

  it('o resumo de quem escreve é HMAC-SHA256 com a chave da função, diferente do resumo de um número do WhatsApp', () => {
    expect(telegramSenderHash(USER, KEY)).toBe(createHmac('sha256', KEY).update(`telegram:${USER}`).digest('hex'));
    expect(telegramSenderHash(USER, KEY)).not.toBe(telegramSenderHash(USER, `${KEY}x`));
    expect(telegramSenderHash(USER, KEY)).not.toBe(whatsappPhoneHash(String(USER), KEY));
  });
});

describe('Telegram: resposta a cada mensagem', () => {
  function fakeRpc(outcome: (fn: string) => WhatsAppOutcome = () => ({ result: 'nao_ligado' })) {
    const calls: { fn: string; args: Record<string, unknown> }[] = [];
    const rpc = async (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      return fn === 'telegram_note' ? ({ result: 'registrada' } as WhatsAppOutcome) : outcome(fn);
    };
    return { calls, rpc };
  }

  it('anotar, ligar, desfazer e desligar chamam as funções telegram_* com o resumo, nunca o identificador', async () => {
    const { calls, rpc } = fakeRpc();
    await handleTelegramMessage(inbound('mercado 52,30'), rpc, KEY);
    await handleTelegramMessage(inbound('/start ABCD2345'), rpc, KEY);
    await handleTelegramMessage(inbound('desfazer'), rpc, KEY);
    await handleTelegramMessage(inbound('/desligar'), rpc, KEY);
    expect(calls.map((c) => c.fn)).toEqual(['telegram_add_record', 'telegram_link', 'telegram_undo', 'telegram_unlink']);
    const hash = telegramSenderHash(USER, KEY);
    for (const c of calls) {
      expect(c.args.p_message_id).toBe(stored());
      expect(c.args.p_message_id).toMatch(/^telegram:[0-9a-f]{64}$/);
      expect(c.args.p_sender_hash).toBe(hash);
      // A conta de quem escreve não vai ao banco em lugar nenhum, nem dentro do identificador da mensagem.
      expect(JSON.stringify(c.args)).not.toContain(String(USER));
      expect(c.args).not.toHaveProperty('p_phone_hash');
    }
    expect(stored(5)).not.toBe(stored(6));
    expect(stored()).not.toBe(chatMessageKey('whatsapp', `${USER}:5`, KEY).replace('whatsapp:', 'telegram:'));
    expect(calls[0]!.args).toMatchObject({ p_kind: 'despesa', p_amount_cents: 5230, p_days_ago: 0, p_occurred_on: null, p_description: 'Mercado', p_category: 'Mercado' });
    expect(calls[1]!.args).toMatchObject({ p_code: 'ABCD2345' });
    expect(calls[2]!.args.p_sent_at).toBe(new Date(NOW * 1000).toISOString());
  });

  it('Iniciar, ajuda, mídia e mensagem que a Clarevo não entendeu passam pelo banco (telegram_note) e recebem as respostas do Telegram', async () => {
    const { calls, rpc } = fakeRpc();
    expect(await handleTelegramMessage(inbound('/start'), rpc, KEY)).toBe(TELEGRAM_REPLY.ajuda);
    expect(await handleTelegramMessage(inbound('oi'), rpc, KEY)).toBe(TELEGRAM_REPLY.ajuda);
    expect(await handleTelegramMessage(inbound(null, 'midia'), rpc, KEY)).toBe(TELEGRAM_REPLY.midia);
    expect(await handleTelegramMessage(inbound('mercado'), rpc, KEY)).toBe(whatsappParseReply('sem_valor', 'telegram'));
    expect(await handleTelegramMessage(inbound('/start XYZ'), rpc, KEY)).toBe(TELEGRAM_REPLY.codigo_invalido);
    expect(calls.map((c) => [c.fn, c.args.p_outcome])).toEqual([
      ['telegram_note', 'ajuda'], ['telegram_note', 'ajuda'], ['telegram_note', 'midia'], ['telegram_note', 'nao_entendi'], ['telegram_note', 'nao_entendi'],
    ]);
  });

  it('as respostas do banco viram as do Telegram; repetida não responde', async () => {
    const space = { kind: 'pessoal' as const, name: 'Pessoal' };
    const ask = (o: WhatsAppOutcome, t = 'café 5') => handleTelegramMessage(inbound(t), fakeRpc(() => o).rpc, KEY);
    expect(await ask({ result: 'nao_ligado' })).toBe(TELEGRAM_REPLY.nao_ligado);
    expect(await ask({ result: 'ligado', space }, '/start ABCD2345')).toContain('Pronto, este Telegram está ligado à Clarevo, no espaço Pessoal.');
    expect(await ask({ result: 'ligado', space, name: 'Ana Exemplo' }, '/start ABCD2345')).toContain(
      'Pronto, este Telegram está ligado à conta de Ana Exemplo na Clarevo, no espaço Pessoal.',
    );
    expect(await ask({ result: 'ja_ligado' }, '/start ABCD2345')).toBe(TELEGRAM_REPLY.ja_ligado);
    expect(await ask({ result: 'desligado' }, '/desligar')).toBe(TELEGRAM_REPLY.desligado);
    // Assinatura paga (D-083): depois do teste grátis, sem assinatura, a conta fica só para ver e exportar.
    expect(await ask({ result: 'sem_assinatura' })).toBe(
      'A sua conta da Clarevo está só para ver e exportar: o teste grátis acabou ou a assinatura não está ativa. Para voltar a anotar, abra Conta no app e toque em Assinatura.',
    );
    expect(await ask({ result: 'sem_permissao', space })).toBe('Você não anota mais no espaço Pessoal. No app, abra Conta, toque em Telegram e ligue de novo, escolhendo o espaço.');
    expect(await ask({ result: 'repetida' })).toBeNull();
    expect(await ask({ result: 'silencio' })).toBeNull();
    const noted = await ask({
      result: 'anotado', space, today: '2026-11-01',
      record: { kind: 'despesa', amount_cents: 500, occurred_on: '2026-11-01', description: 'Café', category: 'Alimentação', account_name: 'Conta principal' },
    });
    expect(noted).toBe(whatsappOutcomeReply({
      result: 'anotado', space, today: '2026-11-01',
      record: { kind: 'despesa', amount_cents: 500, occurred_on: '2026-11-01', description: 'Café', category: 'Alimentação', account_name: 'Conta principal' },
    }, '2026-11-01'));
  });

  it('as respostas do Telegram são as do WhatsApp com o nome do canal, e nenhuma fala em WhatsApp, número ou Meta', () => {
    expect(Object.keys(TELEGRAM_REPLY).sort()).toEqual(Object.keys(WHATSAPP_REPLY).sort());
    expect(TELEGRAM_REPLY.midia).toBe(WHATSAPP_REPLY.midia);
    expect(TELEGRAM_REPLY.erro).toBe(WHATSAPP_REPLY.erro);
    // Aberto a todas as pessoas (D-081): as respostas mandam abrir Conta. O WhatsApp, em piloto fechado, aponta o endereço da tela.
    expect(TELEGRAM_REPLY.nao_ligado).toBe('Este Telegram ainda não está ligado a uma conta da Clarevo. No app da Clarevo, abra Conta, toque em Telegram e siga os passos.');
    expect(TELEGRAM_REPLY.codigo_invalido).toBe('Este código não vale mais ou não existe. No app, abra Conta, toque em Telegram e gere outro. Cada código vale por 15 minutos.');
    expect(TELEGRAM_REPLY.ja_ligado).toBe('Este Telegram já está ligado a outra conta da Clarevo. Se for seu, mande DESLIGAR e depois mande o código de novo.');
    expect(WHATSAPP_REPLY.nao_ligado).toContain('app.clarevo.app.br/conta/whatsapp');
    const texts = [
      ...Object.values(TELEGRAM_REPLY),
      whatsappOutcomeReply({ result: 'ligado', space: { kind: 'pessoal', name: 'Pessoal' } }, '2026-11-01', 'telegram')!,
      whatsappOutcomeReply({ result: 'sem_permissao', space: { kind: 'pessoal', name: 'Pessoal' } }, '2026-11-01', 'telegram')!,
      ...Object.values(TELEGRAM_TEXT).flatMap((v) => (typeof v === 'function' ? [v('Pessoal')] : Array.isArray(v) ? v : [v])),
    ] as string[];
    for (const t of texts) {
      expect(t, t).not.toMatch(/whatsapp|\bmeta\b|número/i);
      expect(t, t).not.toMatch(/—|–/);
      expect(t, t).not.toMatch(/contexto|fazer sentido|inteligência artificial|\bIA\b|obrigad[oa]|bem-vind[oa]/i);
      expect(t, t).not.toMatch(/\bo Clarevo\b/);
    }
  });
});

describe('Telegram: a função do servidor', () => {
  const config: TelegramConfig = { webhookSecret: SECRET, idKey: KEY, supabaseUrl: 'https://projeto.supabase.co', serviceKey: 'sb_secret_x' };
  function request(method: string, body: string, secret: string | null = SECRET, length?: number) {
    let read = false;
    return {
      req: {
        method,
        header: (name: string) =>
          name.toLowerCase() === 'x-telegram-bot-api-secret-token' ? secret : name.toLowerCase() === 'content-length' ? (length === undefined ? null : String(length)) : null,
        body: async () => {
          read = true;
          return body;
        },
      },
      wasRead: () => read,
    };
  }
  function fakeNet(status = 200, outcome: WhatsAppOutcome = { result: 'nao_ligado' }) {
    const sent: { url: string; body: Record<string, unknown> }[] = [];
    const fetcher: WhatsAppFetch = async (url, init) => {
      sent.push({ url, body: JSON.parse(init.body) });
      return { status, text: async () => JSON.stringify(url.endsWith('/rpc/telegram_note') ? { result: 'registrada' } : outcome) };
    };
    return { sent, fetcher };
  }

  it('sem os segredos certos, não faz nada; com eles, só POST com o segredo no cabeçalho (conferido antes de ler o corpo)', async () => {
    const logs: string[] = [];
    const off = createTelegramHandler({ config: telegramConfigFrom(() => undefined), fetch: fakeNet().fetcher, log: (m) => logs.push(m) });
    expect((await off(request('POST', '{}').req)).status).toBe(503);
    expect(logs).toHaveLength(1);
    const net = fakeNet();
    const h = createTelegramHandler({ config, fetch: net.fetcher });
    expect((await h(request('GET', '').req)).status).toBe(405);
    for (const secret of [null, '', 'errado', `${SECRET}x`, SECRET.slice(0, -1)]) {
      const r = request('POST', JSON.stringify(text('café 5')), secret);
      expect((await h(r.req)).status, String(secret)).toBe(401);
      expect(r.wasRead()).toBe(false);
    }
    expect((await h(request('POST', '{}', SECRET, 70_000).req)).status).toBe(413);
    expect((await h(request('POST', 'x'.repeat(70_000)).req)).status).toBe(413);
    expect((await h(request('POST', 'não é json').req)).status).toBe(400);
    expect(net.sent).toEqual([]);
  });

  it('responde no corpo da resposta à entrega, em texto simples, à mensagem de quem escreveu', async () => {
    const net = fakeNet(200, { result: 'nao_ligado' });
    const h = createTelegramHandler({ config, fetch: net.fetcher });
    const res = await h(request('POST', JSON.stringify(text('café 5', 77))).req);
    expect(res.status).toBe(200);
    expect(res.contentType).toBe('application/json');
    expect(JSON.parse(res.body)).toEqual({
      method: 'sendMessage',
      chat_id: USER,
      text: TELEGRAM_REPLY.nao_ligado,
      reply_parameters: { message_id: 77, allow_sending_without_reply: true },
      link_preview_options: { is_disabled: true },
    });
    expect(res.body).not.toMatch(/parse_mode|reply_markup/);
    expect(net.sent).toHaveLength(1);
    expect(net.sent[0]!.url).toBe('https://projeto.supabase.co/rest/v1/rpc/telegram_add_record');
    expect(net.sent[0]!.body).toMatchObject({ p_message_id: stored(77), p_sender_hash: telegramSenderHash(USER, KEY) });
  });

  it('entrega sem mensagem para tratar e mensagem repetida: 200 sem resposta', async () => {
    const h = createTelegramHandler({ config, fetch: fakeNet(200, { result: 'repetida' }).fetcher });
    expect(await h(request('POST', JSON.stringify({ update_id: 1, edited_message: {} })).req)).toEqual({ status: 200, body: 'ok', contentType: 'text/plain; charset=utf-8' });
    expect(await h(request('POST', JSON.stringify(text('café 5'))).req)).toEqual({ status: 200, body: 'ok', contentType: 'text/plain; charset=utf-8' });
  });

  it('falha passageira do banco: 500 (o Telegram entrega de novo); recusa definitiva: a resposta de erro', async () => {
    const logs: string[] = [];
    const down = createTelegramHandler({ config, fetch: fakeNet(503).fetcher, log: (m) => logs.push(m) });
    expect((await down(request('POST', JSON.stringify(text('café 5'))).req)).status).toBe(500);
    const refused = createTelegramHandler({ config, fetch: fakeNet(400).fetcher, log: (m) => logs.push(m) });
    const res = await refused(request('POST', JSON.stringify(text('café 5'))).req);
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body).text).toBe(TELEGRAM_REPLY.erro);
    expect(logs.join('\n')).not.toContain(String(USER));
    expect(logs.join('\n')).not.toContain('café');
  });

  it('configuração: segredo só com letras, algarismos, _ e - (32 a 256), chave dos resumos com 32 ou mais e a chave de serviço', () => {
    const env: Record<string, string> = { TELEGRAM_WEBHOOK_SECRET: SECRET, TELEGRAM_ID_KEY: KEY, SUPABASE_URL: 'https://x.supabase.co/', SUPABASE_SERVICE_ROLE_KEY: 'e' };
    const from = (over: Record<string, string | undefined>) => telegramConfigFrom((n) => (n in over ? over[n] : env[n]));
    expect(from({})).toEqual({ webhookSecret: SECRET, idKey: KEY, supabaseUrl: 'https://x.supabase.co', serviceKey: 'e' });
    expect(from({ SUPABASE_SECRET_KEYS: '{"default":"sb_secret_novo"}' })?.serviceKey).toBe('sb_secret_novo');
    expect(from({ TELEGRAM_WEBHOOK_SECRET: 'curto' })).toBeNull();
    expect(from({ TELEGRAM_WEBHOOK_SECRET: `${SECRET}!` })).toBeNull();
    expect(from({ TELEGRAM_WEBHOOK_SECRET: 'a'.repeat(257) })).toBeNull();
    expect(from({ TELEGRAM_ID_KEY: 'curta' })).toBeNull();
    expect(from({ TELEGRAM_ID_KEY: undefined })).toBeNull();
    expect(from({ SUPABASE_URL: undefined })).toBeNull();
    expect(from({ SUPABASE_SERVICE_ROLE_KEY: undefined })).toBeNull();
  });

  it('a resposta tem só o necessário', () => {
    expect(JSON.parse(telegramReplyBody(inbound('x'), 'Oi'))).toEqual({
      method: 'sendMessage', chat_id: USER, text: 'Oi', reply_parameters: { message_id: 5, allow_sending_without_reply: true }, link_preview_options: { is_disabled: true },
    });
  });

  it('a função gerada (supabase/functions/telegram) está em dia com o núcleo e roda como no Deno', async () => {
    const root = join(__dirname, '../../..');
    execFileSync('node', [join(root, 'scripts/gerar-funcoes.js'), '--conferir']);
    const src = readFileSync(join(root, 'supabase/functions/telegram/index.ts'), 'utf8');
    const env: Record<string, string> = { TELEGRAM_WEBHOOK_SECRET: SECRET, TELEGRAM_ID_KEY: KEY, SUPABASE_URL: 'https://projeto.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_x' };
    let serve: ((req: Request) => Promise<Response>) | undefined;
    const deno = { env: { get: (n: string) => env[n] }, serve: (h: (req: Request) => Promise<Response>) => (serve = h) };
    const sent: string[] = [];
    const fakeFetch = async (url: string, init: { body: string }) => {
      sent.push(`${url} ${init.body}`);
      return new Response('{"result":"nao_ligado"}', { status: 200 });
    };
    new Function('Deno', 'fetch', 'console', src)(deno, fakeFetch, { error: () => {} });
    expect(serve).toBeDefined();
    const body = JSON.stringify(text('café 5 ☕'));
    const post = await serve!(new Request('https://f/telegram', { method: 'POST', body, headers: { 'X-Telegram-Bot-Api-Secret-Token': SECRET } }));
    expect(post.status).toBe(200);
    expect(post.headers.get('Content-Type')).toBe('application/json');
    expect((await post.json()).text).toBe(TELEGRAM_REPLY.nao_ligado);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain('https://projeto.supabase.co/rest/v1/rpc/telegram_add_record');
    expect(sent[0]).toContain('"p_description":"Café ☕"');
    const bad = await serve!(new Request('https://f/telegram', { method: 'POST', body, headers: { 'X-Telegram-Bot-Api-Secret-Token': 'errado' } }));
    expect(bad.status).toBe(401);
  });

  it('nenhum envio por iniciativa da Clarevo: o código do Telegram não chama a API do Telegram nem tem o token do bot', () => {
    const dir = join(__dirname, '../src/telegram');
    const files = [...readdirSync(dir).map((f) => join(dir, f)), join(__dirname, '../../../supabase/functions/telegram/index.ts')];
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/api\.telegram\.org|TELEGRAM_BOT_TOKEN|bot_token|setWebhook/i);
    }
  });
});

describe('Telegram: baixar o app', () => {
  it('a loja certa para cada aparelho: pelo sistema do app ou, na web, pelo navegador', () => {
    expect(telegramDownloadLink('ios')).toBe(TELEGRAM_DOWNLOAD.ios);
    expect(telegramDownloadLink('android')).toBe(TELEGRAM_DOWNLOAD.android);
    expect(telegramDownloadLink('web', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15')).toBe(TELEGRAM_DOWNLOAD.ios);
    expect(telegramDownloadLink('web', 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/130 Mobile')).toBe(TELEGRAM_DOWNLOAD.android);
    expect(telegramDownloadLink('web', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130')).toBe(TELEGRAM_DOWNLOAD.other);
    expect(telegramDownloadLink('web')).toBe(TELEGRAM_DOWNLOAD.other);
    // Só endereços oficiais, com https e sem parâmetro de rastreio.
    for (const url of Object.values(TELEGRAM_DOWNLOAD)) expect(url).toMatch(/^https:\/\/(apps\.apple\.com|play\.google\.com|telegram\.org)\/[^?]*(\?id=org\.telegram\.messenger)?$/);
  });

  it('os textos de quem não tem o Telegram seguem as regras de escrita', () => {
    for (const t of Object.values(TELEGRAM_DOWNLOAD_TEXT)) {
      expect(t, t).not.toMatch(/—|–|fazer sentido|whatsapp|\bmeta\b|número/i);
    }
    expect(TELEGRAM_DOWNLOAD_TEXT.body).toContain('gratuito');
  });
});

describe('Telegram: app', () => {
  it('o bot, o link de Iniciar com o código e o piloto fechado', () => {
    expect(TELEGRAM_BOT === null || isTelegramBotName(TELEGRAM_BOT)).toBe(true);
    expect(TELEGRAM_BOT).toBe('ClarevoBot');
    expect(telegramStartLink(TELEGRAM_BOT!, 'ABCD2345')).toBe('https://t.me/ClarevoBot?start=ABCD2345');
    // Aberto a todas as pessoas (D-081): o card aparece em Conta.
    expect(TELEGRAM_IN_ACCOUNT).toBe(true);
    expect(telegramStartLink('ClarevoBot', 'ABCD2345')).toBe('https://t.me/ClarevoBot?start=ABCD2345');
    expect(isTelegramBotName('ClarevoBot')).toBe(true);
    expect(isTelegramBotName('clarevo_app_bot')).toBe(true);
    expect(isTelegramBotName('Clarevo')).toBe(false);
    expect(isTelegramBotName('@ClarevoBot')).toBe(false);
    expect(isTelegramBotName('1clarevobot')).toBe(false);
    expect(TELEGRAM_TEXT.targetLabel('ClarevoBot')).toBe('Se o Telegram não abrir, procure @ClarevoBot e mande "Ativar" e o código.');
  });
});
