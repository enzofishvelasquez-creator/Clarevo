/// <reference types="node" />
import { execFileSync } from 'node:child_process';
import { createHmac, createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';
import {
  WHATSAPP_CODE_ALPHABET,
  WHATSAPP_REPLY,
  WHATSAPP_TEXT,
  createWhatsAppHandler,
  formatWhatsAppNumber,
  handleWhatsAppMessage,
  hmacSha256Hex,
  normalizeWhatsAppCode,
  readWhatsAppMessage,
  utf8Bytes,
  verifyMetaSignature,
  whatsappActivationText,
  whatsappCategory,
  whatsappChatLink,
  whatsappConfigFrom,
  whatsappInbound,
  whatsappOutcomeReply,
  whatsappParseReply,
  whatsappPhoneHash,
  type WhatsAppConfig,
  type WhatsAppFetch,
  type WhatsAppInbound,
  type WhatsAppOutcome,
  type WhatsAppParseError,
} from '../src';

const TODAY = '2026-10-30';
const read = (text: string) => readWhatsAppMessage(text, TODAY);
const anotar = (kind: 'despesa' | 'receita', amountCents: number, description: string, category: string | null, occurredOn = TODAY) => ({
  type: 'anotar',
  kind,
  amountCents,
  occurredOn,
  description,
  category,
});

describe('WhatsApp: leitura das mensagens (sem IA)', () => {
  it('gasto com valor e descrição, em vários jeitos de escrever', () => {
    expect(read('mercado 52,30')).toEqual(anotar('despesa', 5230, 'Mercado', 'Mercado'));
    expect(read('Mercado R$ 52,30')).toEqual(anotar('despesa', 5230, 'Mercado', 'Mercado'));
    expect(read('R$52,30 mercado')).toEqual(anotar('despesa', 5230, 'Mercado', 'Mercado'));
    expect(read('gastei 52,30 no mercado')).toEqual(anotar('despesa', 5230, 'Mercado', 'Mercado'));
    expect(read('paguei 180 de luz')).toEqual(anotar('despesa', 18000, 'Luz', 'Moradia'));
    expect(read('52 reais de padaria.')).toEqual(anotar('despesa', 5200, 'Padaria', 'Mercado'));
    expect(read('uber 23,50')).toEqual(anotar('despesa', 2350, 'Uber', null));
    expect(read('Farmácia São João 38,90')).toEqual(anotar('despesa', 3890, 'Farmácia São João', 'Saúde'));
    expect(read('aluguel 1.500,00')).toEqual(anotar('despesa', 150000, 'Aluguel', 'Moradia'));
    expect(read('-40 cinema')).toEqual(anotar('despesa', 4000, 'Cinema', 'Lazer'));
    expect(read('lazer 80')).toEqual(anotar('despesa', 8000, 'Lazer', 'Lazer'));
    expect(read('pizza 12.5')).toEqual(anotar('despesa', 1250, 'Pizza', null));
    expect(read('mercado - 50')).toEqual(anotar('despesa', 5000, 'Mercado', 'Mercado'));
    expect(read('luz \u2013 180')).toEqual(anotar('despesa', 18000, 'Luz', 'Moradia'));
  });

  it('recebimento: sinal de mais, palavra de recebimento ou só palavras de recebimento', () => {
    expect(read('recebi 1500 salário')).toEqual(anotar('receita', 150000, 'Salário', 'Salário'));
    expect(read('+3000 salario')).toEqual(anotar('receita', 300000, 'Salario', 'Salário'));
    expect(read('+ 200 freela')).toEqual(anotar('receita', 20000, 'Freela', null));
    expect(read('salário 3.000,00')).toEqual(anotar('receita', 300000, 'Salário', 'Salário'));
    expect(read('reembolso 80')).toEqual(anotar('receita', 8000, 'Reembolso', 'Reembolso'));
    expect(read('entrou 250 venda do bolo')).toEqual(anotar('receita', 25000, 'Venda do bolo', 'Renda extra'));
    // Palavra de gasto ganha da descrição: "paguei" a "venda" é gasto.
    expect(read('paguei 50 venda')).toEqual(anotar('despesa', 5000, 'Venda', null));
  });

  it('data: hoje, ontem, anteontem, dia N e dia/mês', () => {
    expect(read('farmácia 38 ontem')).toEqual(anotar('despesa', 3800, 'Farmácia', 'Saúde', '2026-10-29'));
    expect(read('anteontem feira 45')).toEqual(anotar('despesa', 4500, 'Feira', 'Mercado', '2026-10-28'));
    expect(read('luz 180 12/10')).toEqual(anotar('despesa', 18000, 'Luz', 'Moradia', '2026-10-12'));
    expect(read('luz 180 12/10/2025')).toEqual(anotar('despesa', 18000, 'Luz', 'Moradia', '2025-10-12'));
    expect(read('luz 180 12/10/25')).toEqual(anotar('despesa', 18000, 'Luz', 'Moradia', '2025-10-12'));
    expect(read('gás 120 dia 5')).toEqual(anotar('despesa', 12000, 'Gás', 'Moradia', '2026-10-05'));
    expect(read('café 8 hoje')).toEqual(anotar('despesa', 800, 'Café', 'Lazer'));
    expect(read('café 8 hoje hoje')).toEqual(anotar('despesa', 800, 'Café', 'Lazer'));
    // Na virada do ano, "ontem" é o dia anterior de verdade.
    expect(readWhatsAppMessage('café 8 ontem', '2027-01-01')).toEqual(anotar('despesa', 800, 'Café', 'Lazer', '2026-12-31'));
  });

  it('recusas com o motivo, sem anotar nada', () => {
    const reason = (text: string) => {
      const out = read(text);
      return out.type === 'erro' ? out.reason : out.type;
    };
    expect(reason('mercado')).toBe('sem_valor');
    expect(reason('oi, tudo bem com vocês')).toBe('sem_valor');
    expect(reason('mercado 50 farmácia 30')).toBe('valor_ambiguo');
    expect(reason('52,30')).toBe('sem_descricao');
    expect(reason('R$ 52,30 reais')).toBe('sem_descricao');
    expect(reason('mercado 0')).toBe('valor_invalido');
    expect(reason('casa 99999999999')).toBe('valor_acima_do_limite');
    expect(reason('luz 180 31/02')).toBe('data_invalida');
    expect(reason('luz 180 ontem 12/10')).toBe('data_invalida');
    expect(reason('luz 180 25/12')).toBe('data_futura');
    expect(reason('gás 120 dia 31')).toBe('data_futura');
    expect(reason('ativar ABC')).toBe('codigo_invalido');
    expect(reason('código 1234-0000')).toBe('codigo_invalido');
  });

  it('dois números: vale o que tem centavos ou R$, se for só um', () => {
    expect(read('13 salário 3.000,00')).toEqual(anotar('receita', 300000, '13 salário', 'Salário'));
    expect(read('2 pães 10,50')).toEqual(anotar('despesa', 1050, '2 pães', null));
    expect(read('uber 99 R$ 18')).toEqual(anotar('despesa', 1800, 'Uber 99', null));
  });

  it('descrição de até 80 caracteres, cortada no último espaço', () => {
    const long = `${'presente de aniversário para a família toda '.repeat(3)}120`;
    const out = read(long);
    expect(out.type).toBe('anotar');
    if (out.type !== 'anotar') return;
    expect(out.description.length).toBeLessThanOrEqual(80);
    expect(out.description.endsWith(' ')).toBe(false);
    expect(long.startsWith(out.description.toLowerCase())).toBe(true);
  });

  it('comandos: desfazer, desligar, ajuda (também mensagem vazia e saudação)', () => {
    for (const t of ['desfazer', 'DESFAZER', 'Desfaz!', 'desfaça', 'desfazer a última']) expect(read(t), t).toEqual({ type: 'desfazer' });
    for (const t of ['desligar', 'PARAR', 'sair', 'Stop']) expect(read(t), t).toEqual({ type: 'desligar' });
    for (const t of ['ajuda', 'Oi', 'olá!', 'bom dia', '?', '', '   ', 'menu']) expect(read(t), t).toEqual({ type: 'ajuda' });
  });

  it('ligar: "Ativar" e o código, a palavra "código" ou só o código com hífen', () => {
    expect(read('Ativar ABCD-EF23')).toEqual({ type: 'ligar', code: 'ABCDEF23' });
    expect(read('ativar abcd ef23')).toEqual({ type: 'ligar', code: 'ABCDEF23' });
    expect(read('Código: ABCDEF23')).toEqual({ type: 'ligar', code: 'ABCDEF23' });
    expect(read('abcd-ef23')).toEqual({ type: 'ligar', code: 'ABCDEF23' });
    // Oito letras sem hífen e sem a palavra de ligar: não é código.
    expect(read('MERCADOS').type).toBe('erro');
    expect(normalizeWhatsAppCode('ABCD-EF2O')).toBeNull();
    expect(normalizeWhatsAppCode('ABCD-EF21')).toBeNull();
  });

  it('categoria pelo nome escrito ou pelas regras da importação', () => {
    expect(whatsappCategory('Consulta médica', 'despesa')).toBe('Saúde');
    expect(whatsappCategory('Coisas de educação', 'despesa')).toBe('Educação');
    expect(whatsappCategory('Uber', 'despesa')).toBeNull();
    expect(whatsappCategory('Renda extra', 'receita')).toBe('Renda extra');
    expect(whatsappCategory('Mercado', 'receita')).toBeNull();
  });
});

describe('WhatsApp: respostas', () => {
  const space = { kind: 'pessoal' as const, name: 'Pessoal' };
  const record = {
    kind: 'despesa' as const,
    amount_cents: 5230,
    occurred_on: TODAY,
    description: 'Mercado',
    category: 'Mercado',
    account_name: 'Conta principal',
  };

  it('anotado: espaço, valor, categoria, data e conta de origem, com DESFAZER', () => {
    expect(whatsappOutcomeReply({ result: 'anotado', space, record }, TODAY)).toBe(
      'Anotado no espaço Pessoal:\nGasto: Mercado, R$ 52,30\nCategoria: Mercado\nData: hoje, 30/10\nSaiu de: Conta principal\n\n' +
        'Se algo ficou errado, responda DESFAZER.',
    );
    const income = { ...record, kind: 'receita' as const, description: 'Salário', category: null, occurred_on: '2026-10-29', amount_cents: 300000 };
    expect(whatsappOutcomeReply({ result: 'anotado', space: { kind: 'familia', name: 'Família Souza' }, record: income }, TODAY)).toBe(
      'Anotado no espaço Família Souza:\nRecebimento: Salário, R$ 3.000,00\nCategoria: Sem categoria\nData: ontem, 29/10\nEntrou em: Conta principal\n\n' +
        'Se algo ficou errado, responda DESFAZER.',
    );
    const old = { ...record, occurred_on: '2025-12-20' };
    expect(whatsappOutcomeReply({ result: 'desfeito', space, record: old }, TODAY)).toContain('Data: 20/12/2025');
  });

  it('repetida não responde; as demais têm texto', () => {
    expect(whatsappOutcomeReply({ result: 'repetida' }, TODAY)).toBeNull();
    const all: WhatsAppOutcome[] = [
      { result: 'ligado', space },
      { result: 'desfeito', space, record },
      { result: 'sem_permissao', space },
      { result: 'sem_conta', space },
      ...(['nada_para_desfazer', 'desligado', 'nao_ligado', 'codigo_invalido', 'muitas_tentativas', 'muitas_mensagens', 'data_futura',
        'valor_invalido', 'valor_acima_do_limite', 'descricao_invalida', 'erro'] as const).map((result) => ({ result }) as WhatsAppOutcome),
    ];
    for (const o of all) expect(whatsappOutcomeReply(o, TODAY), o.result).toMatch(/\S/);
    expect(whatsappOutcomeReply({ result: 'ligado', space }, TODAY)).toContain('ligado à Clarevo, no espaço Pessoal');
  });

  it('cada motivo de recusa tem resposta com exemplo ou caminho', () => {
    const reasons: WhatsAppParseError[] = ['sem_valor', 'valor_ambiguo', 'valor_invalido', 'valor_acima_do_limite', 'sem_descricao',
      'data_invalida', 'data_futura', 'codigo_invalido'];
    for (const r of reasons) expect(whatsappParseReply(r), r).toMatch(/\S/);
    expect(whatsappParseReply('sem_valor')).toContain('mercado 52,30');
  });

  it('textos: pt-BR neutro, sem travessão, sem "contexto", sem promessa de IA nem de áudio', () => {
    const texts = [
      ...Object.values(WHATSAPP_REPLY),
      ...Object.values(WHATSAPP_TEXT).flatMap((v) => (typeof v === 'function' ? [v('Pessoal')] : Array.isArray(v) ? v : [v])),
      whatsappOutcomeReply({ result: 'ligado', space: { kind: 'pessoal', name: 'Pessoal' } }, TODAY)!,
    ] as string[];
    for (const t of texts) {
      expect(t, t).not.toMatch(/—|–/);
      expect(t, t).not.toMatch(/contexto|fazer sentido|inteligência artificial|\bIA\b|obrigad[oa]|bem-vind[oa]/i);
      expect(t, t).not.toMatch(/\bo Clarevo\b/);
    }
  });
});

describe('WhatsApp: código e link do app', () => {
  it('alfabeto sem I, O, 0 e 1', () => {
    expect(WHATSAPP_CODE_ALPHABET).toHaveLength(32);
    expect(WHATSAPP_CODE_ALPHABET).not.toMatch(/[IO01]/);
  });

  it('o texto pronto e o link oficial do WhatsApp', () => {
    expect(whatsappActivationText('ABCDEF23')).toBe('Ativar ABCD-EF23');
    expect(whatsappChatLink('5521912345678', 'ABCDEF23')).toBe('https://wa.me/5521912345678?text=Ativar%20ABCD-EF23');
    // O que o app preenche é o que a leitura reconhece.
    expect(read(whatsappActivationText('ABCDEF23'))).toEqual({ type: 'ligar', code: 'ABCDEF23' });
    expect(formatWhatsAppNumber('5521912345678')).toBe('+55 21 91234-5678');
    expect(formatWhatsAppNumber('15551234567')).toBe('+15551234567');
  });
});

describe('WhatsApp: servidor', () => {
  it('HMAC-SHA256 igual ao do Node (RFC 4231 e chave longa)', () => {
    const hex = (s: string) => Array.from(Buffer.from(s, 'hex'));
    // RFC 4231, caso 2.
    expect(hmacSha256Hex(utf8Bytes('Jefe'), utf8Bytes('what do ya want for nothing?'))).toBe(
      '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843',
    );
    // RFC 4231, caso 6 (chave maior que o bloco).
    expect(hmacSha256Hex(hex('aa'.repeat(131)), utf8Bytes('Test Using Larger Than Block-Size Key - Hash Key First'))).toBe(
      '60e431591ee0b67f0d8a26aacbf5b77f8e0bc6213728c5140546040f0ee37f54',
    );
    for (const [key, msg] of [
      ['segredo', '{"object":"whatsapp_business_account"}'],
      ['', 'x'],
      ['chave-com-acentuação', 'mensagem com ç e emoji 🙂'],
    ] as const) {
      expect(hmacSha256Hex(utf8Bytes(key), utf8Bytes(msg))).toBe(createHmac('sha256', key).update(msg).digest('hex'));
    }
  });

  it('assinatura da Meta: confere o corpo exato', () => {
    const body = utf8Bytes('{"a":1}');
    const sig = `sha256=${createHmac('sha256', 'app-secret').update('{"a":1}').digest('hex')}`;
    expect(verifyMetaSignature(body, sig, 'app-secret')).toBe(true);
    expect(verifyMetaSignature(body, sig.toUpperCase().replace('SHA256=', 'sha256='), 'app-secret')).toBe(true);
    expect(verifyMetaSignature(utf8Bytes('{"a":2}'), sig, 'app-secret')).toBe(false);
    expect(verifyMetaSignature(body, sig, 'outro')).toBe(false);
    expect(verifyMetaSignature(body, null, 'app-secret')).toBe(false);
    expect(verifyMetaSignature(body, 'sha1=abc', 'app-secret')).toBe(false);
    expect(verifyMetaSignature(body, sig, '')).toBe(false);
  });

  it('resumo do número: SHA-256 só dos algarismos (o mesmo do banco)', () => {
    expect(whatsappPhoneHash('5521900000001')).toBe(createHash('sha256').update('5521900000001').digest('hex'));
    expect(whatsappPhoneHash('+55 21 90000-0001')).toBe(whatsappPhoneHash('5521900000001'));
  });

  const payload = (messages: unknown[], phoneNumberId = '111') => ({
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'waba',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '5521900000000', phone_number_id: phoneNumberId },
              contacts: [{ profile: { name: 'Nome que não é guardado' }, wa_id: '5521988887777' }],
              messages,
            },
          },
          { field: 'messages', value: { metadata: { phone_number_id: phoneNumberId }, statuses: [{ id: 'x', status: 'read' }] } },
        ],
      },
    ],
  });
  const text = (id: string, body: string, from = '5521988887777', ts = 1793361600) => ({ from, id, timestamp: String(ts), type: 'text', text: { body } });

  it('lê só as mensagens do número da Clarevo, sem nome de perfil nem avisos de leitura', () => {
    const p = payload([text('m1', 'mercado 10'), { from: '5521988887777', id: 'm2', timestamp: '1793361600', type: 'audio', audio: { id: 'a' } }]);
    expect(whatsappInbound(p, '111')).toEqual([
      { id: 'm1', from: '5521988887777', timestamp: 1793361600, type: 'text', text: 'mercado 10' },
      { id: 'm2', from: '5521988887777', timestamp: 1793361600, type: 'audio', text: null },
    ]);
    expect(whatsappInbound(p, '222')).toEqual([]);
    expect(whatsappInbound({ object: 'page', entry: [] }, '111')).toEqual([]);
    expect(whatsappInbound(null, '111')).toEqual([]);
    expect(whatsappInbound(payload([text('m3', 'x', '+55 21')]), '111')).toEqual([]);
    expect(whatsappInbound(payload([{ ...text('', 'x') }]), '111')).toEqual([]);
  });

  it('cada mensagem: o que vai ao banco e a resposta', async () => {
    const calls: [string, Record<string, unknown>][] = [];
    const outcome: WhatsAppOutcome = {
      result: 'anotado',
      space: { kind: 'pessoal', name: 'Pessoal' },
      record: { kind: 'despesa', amount_cents: 1000, occurred_on: '2026-10-30', description: 'Mercado', category: 'Mercado', account_name: 'Conta principal' },
    };
    const rpc = async (fn: string, args: Record<string, unknown>) => {
      calls.push([fn, args]);
      return fn === 'whatsapp_add_record' ? outcome : ({ result: 'repetida' } as WhatsAppOutcome);
    };
    // 1793361600 = 30/10/2026 às 12h (UTC), 9h em Brasília.
    const msg = (t: string, type = 'text'): WhatsAppInbound => ({ id: 'wamid.1', from: '5521988887777', timestamp: 1793361600, type, text: type === 'text' ? t : null });
    const hash = whatsappPhoneHash('5521988887777');

    expect(await handleWhatsAppMessage(msg('mercado 10'), rpc)).toContain('Anotado no espaço Pessoal');
    expect(calls).toEqual([
      ['whatsapp_add_record', { p_message_id: 'wamid.1', p_phone_hash: hash, p_kind: 'despesa', p_amount_cents: 1000, p_occurred_on: '2026-10-30', p_description: 'Mercado', p_category: 'Mercado' }],
    ]);
    calls.length = 0;
    expect(await handleWhatsAppMessage(msg('Ativar ABCD-EF23'), rpc)).toBeNull();
    expect(await handleWhatsAppMessage(msg('desfazer'), rpc)).toBeNull();
    expect(await handleWhatsAppMessage(msg('parar'), rpc)).toBeNull();
    expect(calls.map((c) => c[0])).toEqual(['whatsapp_link', 'whatsapp_undo', 'whatsapp_unlink']);
    expect(calls[0]![1]).toEqual({ p_message_id: 'wamid.1', p_phone_hash: hash, p_code: 'ABCDEF23' });
    calls.length = 0;
    // Sem ir ao banco: ajuda, recusa de leitura, mídia, reação.
    expect(await handleWhatsAppMessage(msg('oi'), rpc)).toBe(WHATSAPP_REPLY.ajuda);
    expect(await handleWhatsAppMessage(msg('mercado'), rpc)).toBe(whatsappParseReply('sem_valor'));
    expect(await handleWhatsAppMessage(msg('', 'audio'), rpc)).toBe(WHATSAPP_REPLY.midia);
    expect(await handleWhatsAppMessage(msg('', 'image'), rpc)).toBe(WHATSAPP_REPLY.midia);
    expect(await handleWhatsAppMessage(msg('', 'reaction'), rpc)).toBeNull();
    expect(await handleWhatsAppMessage(msg('', 'request_welcome'), rpc)).toBe(WHATSAPP_REPLY.ajuda);
    expect(calls).toEqual([]);
  });

  it('"hoje" é o dia da mensagem em Brasília, não o do servidor', async () => {
    const seen: unknown[] = [];
    const rpc = async (_fn: string, args: Record<string, unknown>) => {
      seen.push(args.p_occurred_on);
      return { result: 'repetida' } as WhatsAppOutcome;
    };
    // 31/10/2026 às 02h (UTC) ainda é 30/10 em Brasília (23h).
    await handleWhatsAppMessage({ id: 'w', from: '5521988887777', timestamp: Date.UTC(2026, 9, 31, 2) / 1000, type: 'text', text: 'café 5' }, rpc);
    expect(seen).toEqual(['2026-10-30']);
  });

  describe('a função inteira (sem Deno)', () => {
    const config: WhatsAppConfig = {
      verifyToken: 'token-de-verificacao',
      appSecret: 'segredo-do-app',
      accessToken: 'token-de-acesso',
      phoneNumberId: '111',
      supabaseUrl: 'https://projeto.supabase.co',
      serviceKey: 'sb_secret_teste',
      graphVersion: 'v23.0',
    };
    const signed = (obj: unknown) => {
      const t = JSON.stringify(obj);
      return { t, sig: `sha256=${createHmac('sha256', config.appSecret).update(t).digest('hex')}` };
    };
    const request = (method: string, url: string, body = '', sig: string | null = null) => ({
      method,
      url,
      header: (name: string) => (name.toLowerCase() === 'x-hub-signature-256' ? sig : null),
      body: async () => ({ bytes: utf8Bytes(body), text: body }),
    });
    function fakeNet(dbStatus = 200, outcome: WhatsAppOutcome = { result: 'nao_ligado' }) {
      const sent: { url: string; headers: Record<string, string>; body: unknown }[] = [];
      const fetcher: WhatsAppFetch = async (url, init) => {
        sent.push({ url, headers: init.headers, body: JSON.parse(init.body) });
        if (url.startsWith(config.supabaseUrl)) return { status: dbStatus, text: async () => JSON.stringify(outcome) };
        return { status: 200, text: async () => '{}' };
      };
      return { sent, fetcher };
    }

    it('GET confirma o endereço só com o token certo', async () => {
      const h = createWhatsAppHandler({ config, fetch: fakeNet().fetcher });
      expect(await h(request('GET', 'https://f/whatsapp?hub.mode=subscribe&hub.verify_token=token-de-verificacao&hub.challenge=123'))).toEqual({ status: 200, body: '123' });
      expect((await h(request('GET', 'https://f/whatsapp?hub.mode=subscribe&hub.verify_token=errado&hub.challenge=123'))).status).toBe(403);
      expect((await h(request('GET', 'https://f/whatsapp'))).status).toBe(403);
      expect((await h(request('PUT', 'https://f/whatsapp'))).status).toBe(405);
    });

    it('sem os segredos, não faz nada', async () => {
      const logs: string[] = [];
      const h = createWhatsAppHandler({ config: whatsappConfigFrom(() => undefined), fetch: fakeNet().fetcher, log: (m) => logs.push(m) });
      expect((await h(request('POST', 'https://f/whatsapp', '{}', 'sha256=00'))).status).toBe(503);
      expect(logs).toHaveLength(1);
      expect(whatsappConfigFrom((n) => ({ WHATSAPP_VERIFY_TOKEN: 'a', WHATSAPP_APP_SECRET: 'b', WHATSAPP_ACCESS_TOKEN: 'c', WHATSAPP_PHONE_NUMBER_ID: 'd', SUPABASE_URL: 'https://x.supabase.co/', SUPABASE_SERVICE_ROLE_KEY: 'e' })[n])).toEqual({
        verifyToken: 'a', appSecret: 'b', accessToken: 'c', phoneNumberId: 'd', supabaseUrl: 'https://x.supabase.co', serviceKey: 'e', graphVersion: 'v23.0',
      });
    });

    it('POST sem assinatura válida é recusado antes de qualquer chamada', async () => {
      const net = fakeNet();
      const h = createWhatsAppHandler({ config, fetch: net.fetcher });
      const { t } = signed(payload([text('m1', 'mercado 10')]));
      expect((await h(request('POST', 'https://f/whatsapp', t, null))).status).toBe(401);
      expect((await h(request('POST', 'https://f/whatsapp', t, 'sha256=' + '0'.repeat(64)))).status).toBe(401);
      expect(net.sent).toEqual([]);
    });

    it('POST válido: chama o banco com a chave de serviço e só RESPONDE, em texto, a quem escreveu', async () => {
      const net = fakeNet();
      const h = createWhatsAppHandler({ config, fetch: net.fetcher });
      const { t, sig } = signed(payload([text('wamid.A', 'mercado 10')]));
      expect(await h(request('POST', 'https://f/whatsapp', t, sig))).toEqual({ status: 200, body: 'ok' });
      expect(net.sent).toHaveLength(2);
      const [db, meta] = net.sent;
      expect(db!.url).toBe('https://projeto.supabase.co/rest/v1/rpc/whatsapp_add_record');
      expect(db!.headers).toEqual({ apikey: 'sb_secret_teste', 'Content-Type': 'application/json' });
      expect(meta!.url).toBe('https://graph.facebook.com/v23.0/111/messages');
      expect(meta!.headers.Authorization).toBe('Bearer token-de-acesso');
      expect(meta!.body).toEqual({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: '5521988887777',
        context: { message_id: 'wamid.A' },
        type: 'text',
        text: { preview_url: false, body: WHATSAPP_REPLY.nao_ligado },
      });
    });

    it('chave antiga (JWT) vai também em Authorization', async () => {
      const net = fakeNet();
      const h = createWhatsAppHandler({ config: { ...config, serviceKey: 'eyJ.teste' }, fetch: net.fetcher });
      const { t, sig } = signed(payload([text('wamid.B', 'mercado 10')]));
      await h(request('POST', 'https://f/whatsapp', t, sig));
      expect(net.sent[0]!.headers).toEqual({ apikey: 'eyJ.teste', 'Content-Type': 'application/json', Authorization: 'Bearer eyJ.teste' });
    });

    it('falha do banco: 500 (a Meta entrega de novo) e nenhuma resposta enviada', async () => {
      const net = fakeNet(500);
      const logs: string[] = [];
      const h = createWhatsAppHandler({ config, fetch: net.fetcher, log: (m) => logs.push(m) });
      const { t, sig } = signed(payload([text('wamid.C', 'mercado 10')]));
      expect((await h(request('POST', 'https://f/whatsapp', t, sig))).status).toBe(500);
      expect(net.sent.filter((s) => s.url.includes('graph.facebook.com'))).toEqual([]);
      // O log não traz o texto nem o número.
      expect(logs.join(' ')).not.toMatch(/mercado|5521988887777/);
    });

    it('repetida: 200 e nenhuma resposta (a Meta entregou de novo)', async () => {
      const net = fakeNet(200, { result: 'repetida' });
      const h = createWhatsAppHandler({ config, fetch: net.fetcher });
      const { t, sig } = signed(payload([text('wamid.D', 'mercado 10')]));
      expect((await h(request('POST', 'https://f/whatsapp', t, sig))).status).toBe(200);
      expect(net.sent.map((s) => s.url)).toEqual(['https://projeto.supabase.co/rest/v1/rpc/whatsapp_add_record']);
    });

    it('no máximo 20 mensagens por entrega', async () => {
      const net = fakeNet();
      const h = createWhatsAppHandler({ config, fetch: net.fetcher });
      const { t, sig } = signed(payload(Array.from({ length: 25 }, (_, i) => text(`wamid.${i}`, 'oi'))));
      await h(request('POST', 'https://f/whatsapp', t, sig));
      expect(net.sent).toHaveLength(20);
    });
  });

  it('a função gerada (supabase/functions/whatsapp) está em dia com o núcleo e roda como no Deno', async () => {
    const root = join(__dirname, '../../..');
    execFileSync('node', [join(root, 'scripts/gerar-whatsapp.js'), '--conferir']);
    const src = readFileSync(join(root, 'supabase/functions/whatsapp/index.ts'), 'utf8');
    const env: Record<string, string> = {
      WHATSAPP_VERIFY_TOKEN: 'verifica',
      WHATSAPP_APP_SECRET: 'segredo',
      WHATSAPP_ACCESS_TOKEN: 'acesso',
      WHATSAPP_PHONE_NUMBER_ID: '111',
      SUPABASE_URL: 'https://projeto.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_x',
    };
    let serve: ((req: Request) => Promise<Response>) | undefined;
    const deno = { env: { get: (n: string) => env[n] }, serve: (h: (req: Request) => Promise<Response>) => (serve = h) };
    const sent: string[] = [];
    const fakeFetch = async (url: string, init: { body: string }) => {
      sent.push(`${url} ${init.body}`);
      return new Response(url.includes('supabase.co') ? '{"result":"nao_ligado"}' : '{}', { status: 200 });
    };
    new Function('Deno', 'fetch', 'console', src)(deno, fakeFetch, { error: () => {} });
    expect(serve).toBeDefined();
    const get = await serve!(new Request('https://f/whatsapp?hub.mode=subscribe&hub.verify_token=verifica&hub.challenge=42'));
    expect([get.status, await get.text()]).toEqual([200, '42']);
    const body = JSON.stringify(payload([text('wamid.Z', 'café 5 ☕')]));
    const sig = `sha256=${createHmac('sha256', 'segredo').update(body).digest('hex')}`;
    const post = await serve!(new Request('https://f/whatsapp', { method: 'POST', body, headers: { 'X-Hub-Signature-256': sig } }));
    expect(post.status).toBe(200);
    expect(sent).toHaveLength(2);
    expect(sent[0]).toContain('https://projeto.supabase.co/rest/v1/rpc/whatsapp_add_record');
    expect(sent[0]).toContain('"p_description":"Café ☕"');
    expect(sent[1]).toContain('https://graph.facebook.com/v23.0/111/messages');
    const bad = await serve!(new Request('https://f/whatsapp', { method: 'POST', body, headers: { 'X-Hub-Signature-256': 'sha256=' + '1'.repeat(64) } }));
    expect(bad.status).toBe(401);
  });

  it('nenhum envio por iniciativa da Clarevo nem mensagem de modelo (as cobradas) no código do WhatsApp', () => {
    const dir = join(__dirname, '../src/whatsapp');
    const files = [...readdirSync(dir).map((f) => join(dir, f)), join(__dirname, '../../../supabase/functions/whatsapp/index.ts')];
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/['"]template['"]|type:\s*['"]template|\/marketing_messages|\/message_templates/);
    }
    // O único envio responde a uma mensagem recebida (context.message_id) e manda para quem escreveu.
    const server = readFileSync(join(dir, 'servidor.ts'), 'utf8');
    expect(server.match(/graph\.facebook\.com/g)).toHaveLength(1);
    expect(server).toMatch(/sendWhatsAppReply\(config, deps\.fetch, msg\.from, msg\.id, reply\)/);
  });
});
