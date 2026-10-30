/// <reference types="node" />
/**
 * Teste de integração do WhatsApp (D-076): o app (SupabaseRepository) gera o código, a função do servidor (createWhatsAppHandler, a
 * mesma de supabase/functions/whatsapp) recebe entregas assinadas como as da Meta e fala com o banco real pela API (PostgREST), com a
 * chave de serviço. A Meta é falsa: as respostas que a função mandaria ficam guardadas aqui. Executado por `npm run test:api`
 * (supabase/tests/run_api.sh), depois do teste principal, com uma pessoa só deste teste. Pessoas e números FICTÍCIOS.
 */
import { createHmac } from 'node:crypto';

import {
  RepoError,
  WHATSAPP_REPLY,
  createWhatsAppHandler,
  newOperationKey,
  utf8Bytes,
  type WhatsAppConfig,
  type WhatsAppFetch,
} from '@clarevo/core';
import { createClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';

import { SupabaseRepository } from '../src/lib/supabase-repository';

const API = process.env.CLAREVO_API_URL!;
const SECRET = process.env.CLAREVO_JWT_SECRET!;
const GIL = process.env.CLAREVO_GIL!;

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
const repo = new SupabaseRepository(clientFor(GIL), { id: GIL });

const config: WhatsAppConfig = {
  verifyToken: 'verifica-local',
  appSecret: 'segredo-local-do-app',
  accessToken: 'token-local',
  phoneNumberId: '100200300',
  supabaseUrl: API,
  serviceKey: SERVICE_KEY,
  graphVersion: 'v23.0',
};

/** A Meta falsa: o que a função responderia, para quem e a qual mensagem. O banco é o de verdade. */
const replies: { to: string; replyTo: string; body: string; type: string }[] = [];
const net: WhatsAppFetch = async (url, init) => {
  if (url.startsWith('https://graph.facebook.com/')) {
    const b = JSON.parse(init.body);
    replies.push({ to: b.to, replyTo: b.context.message_id, body: b.text.body, type: b.type });
    return { status: 200, text: async () => '{}' };
  }
  const res = await fetch(url, init);
  return { status: res.status, text: () => res.text() };
};
const handler = createWhatsAppHandler({ config, fetch: net });

// 07/10/2026 às 15h (UTC): o "hoje" do banco de teste é 07/10/2026.
const TS = Date.UTC(2026, 9, 7, 15) / 1000;
let seq = 0;
/** Uma entrega da Meta com uma mensagem escrita, assinada. Devolve o status e a resposta mandada (ou null). */
async function send(from: string, text: string, opts: { id?: string; type?: string } = {}) {
  const id = opts.id ?? `wamid.teste.${++seq}`;
  const message = opts.type ? { from, id, timestamp: String(TS), type: opts.type } : { from, id, timestamp: String(TS), type: 'text', text: { body: text } };
  const body = JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [{ id: 'waba', changes: [{ field: 'messages', value: { metadata: { phone_number_id: config.phoneNumberId }, messages: [message] } }] }],
  });
  const before = replies.length;
  const res = await handler({
    method: 'POST',
    url: 'https://projeto.supabase.co/functions/v1/whatsapp',
    header: (n) => (n.toLowerCase() === 'x-hub-signature-256' ? `sha256=${createHmac('sha256', config.appSecret).update(body).digest('hex')}` : null),
    body: async () => ({ bytes: utf8Bytes(body), text: body }),
  });
  return { status: res.status, reply: replies.length > before ? replies[replies.length - 1]! : null, id };
}

const PHONE = '5521977770001';
const OTHER = '5521977770002';
let pessoal = '';

beforeAll(async () => {
  pessoal = (await repo.ensurePersonalSpace('Conta principal')).personalContextId;
});

describe('WhatsApp pela API, com a função do servidor', () => {
  it('conta nova: nada ligado; número sem vínculo recebe o caminho para ligar', async () => {
    expect(await repo.getWhatsApp()).toEqual({ linked: false, contextId: null, linkedAt: null, codeContextId: null, codeExpiresAt: null });
    const r = await send(PHONE, 'mercado 52,30');
    expect(r.status).toBe(200);
    expect(r.reply).toEqual({ to: PHONE, replyTo: r.id, body: WHATSAPP_REPLY.nao_ligado, type: 'text' });
    expect(await repo.listRecords(pessoal, '2026-10')).toEqual([]);
  });

  it('o app gera o código e a mensagem "Ativar" liga o número', async () => {
    const code = await repo.createWhatsAppCode(newOperationKey(), pessoal);
    expect(code.code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    const state = await repo.getWhatsApp();
    expect(state.linked).toBe(false);
    expect([state.codeContextId, state.codeExpiresAt]).toEqual([pessoal, code.expiresAt]);

    const wrong = await send(PHONE, 'Ativar ZZZZ-2222');
    expect(wrong.reply!.body).toBe(WHATSAPP_REPLY.codigo_invalido);
    const ok = await send(PHONE, `Ativar ${code.code!.slice(0, 4)}-${code.code!.slice(4)}`);
    expect(ok.reply!.body).toContain('ligado à Clarevo, no espaço Pessoal');
    const linked = await repo.getWhatsApp();
    expect([linked.linked, linked.contextId, linked.codeContextId]).toEqual([true, pessoal, null]);
  });

  it('anota pelo WhatsApp: o registro aparece no app, com a autoria da pessoa', async () => {
    const r = await send(PHONE, 'mercado 52,30');
    expect(r.reply!.body).toBe(
      'Anotado no espaço Pessoal:\nGasto: Mercado, R$ 52,30\nCategoria: Mercado\nData: hoje, 07/10\nSaiu de: Conta principal\n\nSe algo ficou errado, responda DESFAZER.',
    );
    await send(PHONE, 'recebi 1500 salário ontem');
    const records = await repo.listRecords(pessoal, '2026-10');
    expect(records.map((x) => [x.kind, x.amountCents, x.occurredOn, x.description, x.category, x.createdBy])).toEqual(
      expect.arrayContaining([
        ['despesa', 5230, '2026-10-07', 'Mercado', 'Mercado', GIL],
        ['receita', 150000, '2026-10-06', 'Salário', 'Salário', GIL],
      ]),
    );
    expect(records).toHaveLength(2);
  });

  it('a Meta entrega de novo a mesma mensagem: nada anotado duas vezes, nada respondido', async () => {
    const first = await send(PHONE, 'farmácia 38', { id: 'wamid.repetida' });
    expect(first.reply!.body).toContain('Gasto: Farmácia, R$ 38,00');
    const again = await send(PHONE, 'farmácia 38', { id: 'wamid.repetida' });
    expect([again.status, again.reply]).toEqual([200, null]);
    expect((await repo.listRecords(pessoal, '2026-10')).filter((x) => x.description === 'Farmácia')).toHaveLength(1);
  });

  it('DESFAZER apaga a última anotação feita por lá', async () => {
    const r = await send(PHONE, 'desfazer');
    expect(r.reply!.body).toContain('Desfeito. Saiu do espaço Pessoal:\nGasto: Farmácia, R$ 38,00');
    expect((await repo.listRecords(pessoal, '2026-10')).map((x) => x.description).sort()).toEqual(['Mercado', 'Salário']);
  });

  it('o que não vai ao banco: ajuda, áudio e mensagem sem valor', async () => {
    expect((await send(PHONE, 'oi')).reply!.body).toBe(WHATSAPP_REPLY.ajuda);
    expect((await send(PHONE, '', { type: 'audio' })).reply!.body).toBe(WHATSAPP_REPLY.midia);
    expect((await send(PHONE, 'mercado')).reply!.body).toContain('Não encontrei o valor');
    expect((await send(PHONE, 'luz 180 25/12')).reply!.body).toBe(WHATSAPP_REPLY.data_futura);
  });

  it('as funções do servidor não abrem para o app nem para quem não entrou', async () => {
    for (const db of [clientFor(GIL), clientFor(null)]) {
      const { error } = await db.rpc('whatsapp_add_record', {
        p_message_id: 'x', p_phone_hash: 'a'.repeat(64), p_kind: 'despesa', p_amount_cents: 100, p_occurred_on: '2026-10-07', p_description: 'x', p_category: null,
      });
      expect(error?.code).toBe('42501');
    }
    const { error } = await clientFor(null).rpc('my_whatsapp');
    expect(error?.code).toBe('42501');
  });

  it('DESLIGAR pelo WhatsApp e, depois de ligar de novo, desligar pelo app', async () => {
    expect((await send(PHONE, 'desligar')).reply!.body).toBe(WHATSAPP_REPLY.desligado);
    expect((await repo.getWhatsApp()).linked).toBe(false);
    expect((await send(PHONE, 'café 5')).reply!.body).toBe(WHATSAPP_REPLY.nao_ligado);

    const code = await repo.createWhatsAppCode(newOperationKey(), pessoal);
    expect((await send(OTHER, `Ativar ${code.code}`)).reply!.body).toContain('ligado à Clarevo');
    const key = newOperationKey();
    const off = await repo.unlinkWhatsApp(key);
    expect(off).toEqual({ linked: false, contextId: null, linkedAt: null, codeContextId: null, codeExpiresAt: null });
    expect(await repo.unlinkWhatsApp(key)).toEqual(off);
    expect((await send(OTHER, 'café 5')).reply!.body).toBe(WHATSAPP_REPLY.nao_ligado);
  });

  it('a repetição da chave de gerar código não devolve o código; outro espaço com a mesma chave é recusado', async () => {
    const key = newOperationKey();
    const first = await repo.createWhatsAppCode(key, pessoal);
    expect(first.code).not.toBeNull();
    const again = await repo.createWhatsAppCode(key, pessoal);
    expect([again.code, again.contextId, again.expiresAt]).toEqual([null, pessoal, first.expiresAt]);
    const other = await repo.createWhatsAppCode(key, '00000000-0000-0000-0000-000000000000').catch((e: unknown) => e);
    expect((other as RepoError).code).toBe('chave_reutilizada');
    const noAccess = await repo.createWhatsAppCode(newOperationKey(), '00000000-0000-0000-0000-000000000000').catch((e: unknown) => e);
    expect((noAccess as RepoError).code).toBe('sem_permissao');
  });

  it('todas as respostas foram texto simples, para quem escreveu e em resposta a uma mensagem recebida', () => {
    expect(replies.length).toBeGreaterThan(10);
    for (const r of replies) {
      expect(r.type).toBe('text');
      expect([PHONE, OTHER]).toContain(r.to);
      expect(r.replyTo).toMatch(/^wamid\./);
    }
  });
});
