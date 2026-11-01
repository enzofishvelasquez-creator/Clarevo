/// <reference types="node" />
/**
 * Teste de integração do Telegram (D-080): o app (SupabaseRepository) gera o código, a função do servidor (createTelegramHandler, a mesma
 * de supabase/functions/telegram) recebe entregas como as do Telegram, com o segredo no cabeçalho, e fala com o banco real pela API
 * (PostgREST), com a chave de serviço. A resposta volta no corpo da resposta à entrega, como o Telegram espera. Executado por
 * `npm run test:api` (supabase/tests/run_api.sh), com uma pessoa só deste teste. Pessoas e identificadores FICTÍCIOS.
 */
import { createHmac } from 'node:crypto';

import {
  RepoError,
  TELEGRAM_REPLY,
  createTelegramHandler,
  newOperationKey,
  type TelegramConfig,
  type WhatsAppFetch,
} from '@clarevo/core';
import { createClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';

import { SupabaseRepository } from '../src/lib/supabase-repository';

const API = process.env.CLAREVO_API_URL!;
const SECRET = process.env.CLAREVO_JWT_SECRET!;
const IVO = process.env.CLAREVO_IVO!;

function jwt(payload: Record<string, unknown>) {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const body = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ exp: Math.floor(Date.now() / 1000) + 3600, ...payload })}`;
  return `${body}.${createHmac('sha256', SECRET).update(body).digest('base64url')}`;
}
const ANON_KEY = jwt({ role: 'anon' });
const SERVICE_KEY = jwt({ role: 'service_role' });

function clientFor(personId: string | null, key = personId ? jwt({ role: 'authenticated', sub: personId }) : ANON_KEY) {
  return createClient(API, ANON_KEY, { accessToken: async () => key });
}
const repo = new SupabaseRepository(clientFor(IVO), { id: IVO });

const config: TelegramConfig = {
  webhookSecret: 'segredo_local_do_endereco_0123456789abcdef',
  idKey: 'chave-local-dos-resumos-do-telegram-0123456789',
  supabaseUrl: API,
  serviceKey: SERVICE_KEY,
};
const net: WhatsAppFetch = async (url, init) => {
  const res = await fetch(url, init);
  return { status: res.status, text: () => res.text() };
};
const handler = createTelegramHandler({ config, fetch: net });

// 07/10/2026 às 15h (UTC): o "hoje" do banco de teste é 07/10/2026.
const TS = Date.UTC(2026, 9, 7, 15) / 1000;
const USER = 700900100;
let seq = 0;
/** Uma entrega do Telegram com uma mensagem. Devolve o status, o texto respondido (ou null) e a mensagem a que ele responde. */
async function send(text: string | null, opts: { id?: number; secret?: string } = {}) {
  const id = opts.id ?? ++seq;
  const message = { message_id: id, date: TS, chat: { id: USER, type: 'private' }, from: { id: USER, is_bot: false, first_name: 'Ivo' } };
  const body = JSON.stringify({ update_id: 1000 + id, message: text === null ? { ...message, voice: { file_id: 'x' } } : { ...message, text } });
  const res = await handler({
    method: 'POST',
    header: (n) => (n.toLowerCase() === 'x-telegram-bot-api-secret-token' ? (opts.secret ?? config.webhookSecret) : null),
    body: async () => body,
  });
  const reply = res.contentType === 'application/json' ? (JSON.parse(res.body) as { chat_id: number; text: string; reply_parameters: { message_id: number } }) : null;
  return { status: res.status, reply, id };
}

let pessoal = '';

beforeAll(async () => {
  pessoal = (await repo.ensurePersonalSpace('Conta principal')).personalContextId;
});

describe('Telegram pela API, com a função do servidor', () => {
  it('conta nova: nada ligado; quem escreve sem vínculo recebe o caminho para ligar', async () => {
    expect(await repo.getChatLink('telegram')).toEqual({ linked: false, contextId: null, linkedAt: null, codeContextId: null, codeExpiresAt: null });
    const r = await send('mercado 52,30');
    expect(r.status).toBe(200);
    expect(r.reply).toEqual({
      method: 'sendMessage', chat_id: USER, text: TELEGRAM_REPLY.nao_ligado,
      reply_parameters: { message_id: r.id, allow_sending_without_reply: true }, link_preview_options: { is_disabled: true },
    });
    expect(await repo.listRecords(pessoal, '2026-10')).toEqual([]);
  });

  it('o segredo errado é recusado antes de tudo', async () => {
    const r = await send('mercado 52,30', { secret: 'segredo_errado_do_endereco_0123456789abcdef' });
    expect([r.status, r.reply]).toEqual([401, null]);
  });

  it('o app gera o código e o botão Iniciar (/start com o código) liga a conta', async () => {
    const whatsapp = await repo.createChatCode('whatsapp', newOperationKey(), pessoal);
    const code = await repo.createChatCode('telegram', newOperationKey(), pessoal);
    expect(code.code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    expect((await repo.getChatLink('telegram')).codeContextId).toBe(pessoal);

    expect((await send(`/start ${whatsapp.code}`)).reply!.text).toBe(TELEGRAM_REPLY.codigo_invalido);
    const ok = await send(`/start ${code.code}`);
    expect(ok.reply!.text).toContain('Pronto, este Telegram está ligado à Clarevo, no espaço Pessoal.');
    const linked = await repo.getChatLink('telegram');
    expect([linked.linked, linked.contextId, linked.codeContextId]).toEqual([true, pessoal, null]);
    // O WhatsApp é outro canal: o código dele continua, e nada foi ligado lá.
    const wa = await repo.getChatLink('whatsapp');
    expect([wa.linked, wa.codeContextId]).toEqual([false, pessoal]);
  });

  it('anota pelo Telegram: o registro aparece no app, com a autoria da pessoa; a mesma entrega não anota duas vezes', async () => {
    const r = await send('mercado 52,30');
    expect(r.reply!.text).toBe(
      'Anotado no espaço Pessoal:\nGasto: Mercado, R$ 52,30\nCategoria: Mercado\nData: hoje, 07/10\nSaiu de: Conta principal\n\nSe algo ficou errado, responda DESFAZER.',
    );
    const again = await send('mercado 52,30', { id: r.id });
    expect([again.status, again.reply]).toEqual([200, null]);
    await send('recebi 1500 salário ontem');
    const records = await repo.listRecords(pessoal, '2026-10');
    expect(records.map((x) => [x.kind, x.amountCents, x.occurredOn, x.description, x.createdBy]).sort()).toEqual([
      ['despesa', 5230, '2026-10-07', 'Mercado', IVO],
      ['receita', 150000, '2026-10-06', 'Salário', IVO],
    ]);
  });

  it('DESFAZER, ajuda, Iniciar sem código e áudio', async () => {
    expect((await send('/desfazer')).reply!.text).toContain('Desfeito. Saiu do espaço Pessoal:\nRecebimento: Salário, R$ 1.500,00');
    expect((await repo.listRecords(pessoal, '2026-10')).map((x) => x.description)).toEqual(['Mercado']);
    expect((await send('/start')).reply!.text).toBe(TELEGRAM_REPLY.ajuda);
    expect((await send('oi')).reply!.text).toBe(TELEGRAM_REPLY.ajuda);
    expect((await send(null)).reply!.text).toBe(TELEGRAM_REPLY.midia);
  });

  it('as funções do servidor não abrem para o app nem para quem não entrou', async () => {
    for (const db of [clientFor(IVO), clientFor(null)]) {
      const { error } = await db.rpc('telegram_add_record', {
        p_message_id: 'telegram:1:1', p_sender_hash: 'a'.repeat(64), p_sent_at: '2026-10-07T15:00:00Z', p_kind: 'despesa', p_amount_cents: 100,
        p_days_ago: 0, p_occurred_on: null, p_description: 'x', p_category: null,
      });
      expect(error?.code).toBe('42501');
    }
    const { error } = await clientFor(null).rpc('my_telegram');
    expect(error?.code).toBe('42501');
  });

  it('DESLIGAR pelo Telegram e, depois de ligar de novo, desligar pelo app', async () => {
    expect((await send('/desligar')).reply!.text).toBe(TELEGRAM_REPLY.desligado);
    expect((await repo.getChatLink('telegram')).linked).toBe(false);
    expect((await send('café 5')).reply!.text).toBe(TELEGRAM_REPLY.nao_ligado);
    const code = await repo.createChatCode('telegram', newOperationKey(), pessoal);
    expect((await send(`/start ${code.code}`)).reply!.text).toContain('ligado à Clarevo');
    const key = newOperationKey();
    const off = await repo.unlinkChat('telegram', key);
    expect(off).toEqual({ linked: false, contextId: null, linkedAt: null, codeContextId: null, codeExpiresAt: null });
    expect(await repo.unlinkChat('telegram', key)).toEqual(off);
    const reused = await repo.unlinkChat('whatsapp', key).catch((e: unknown) => e);
    expect(reused).toBeInstanceOf(RepoError);
    expect((reused as RepoError).code).toBe('chave_reutilizada');
  });
});
