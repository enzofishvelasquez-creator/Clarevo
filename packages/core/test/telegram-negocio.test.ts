/// <reference types="node" />
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';
import {
  BUSINESS_CATEGORIES,
  BUSINESS_OUTSIDE_CATEGORIES,
  BUSINESS_TEXT,
  CATEGORIES,
  TELEGRAM_REPLY,
  TELEGRAM_TEXT,
  WHATSAPP_BUSINESS_RULES,
  WHATSAPP_REPLY,
  WHATSAPP_TEXT,
  businessMessageRest,
  cardCategories,
  chatMessageKey,
  handleTelegramMessage,
  handleWhatsAppMessage,
  readWhatsAppMessage,
  supabaseChatRpc,
  telegramSenderHash,
  whatsappCategory,
  whatsappOutcomeReply,
  whatsappParseReply,
  whatsappPhoneHash,
  type TelegramInbound,
  type WhatsAppInbound,
  type WhatsAppOutcome,
  type WhatsAppSpace,
} from '../src';
import { BUSINESS_NOT_ON_CARD } from '../src/business-categories';

/**
 * Telegram (e WhatsApp) no espaço Negócio (27/11/2026, no lugar do item 5 da D-113 para os canais; migração 0049): o vínculo continua no
 * Pessoal ou na Família, e a mensagem que começa com a palavra "negócio" anota no negócio da própria pessoa, com as categorias do
 * negócio. O servidor só tira a palavra e chama as funções de negócio do banco, que acham o negócio pela pessoa ligada.
 * Dados FICTÍCIOS: "Sacolé da Maria" é o negócio da demonstração (docs/52, seção 3).
 */
const TODAY = '2026-11-27';
const read = (text: string) => readWhatsAppMessage(text, TODAY);
const BIZ: WhatsAppSpace = { kind: 'negocio', name: 'Sacolé da Maria' };

describe('Negócio pelo Telegram: a palavra "negócio" no começo da mensagem', () => {
  it('em qualquer caixa, com ou sem acento, com ":", "," ou "." depois; só como primeira palavra inteira', () => {
    for (const t of ['negócio material 120', 'Negócio material 120', 'NEGÓCIO material 120', 'negocio material 120', 'Negocio: material 120',
      'negócio, material 120', 'negócio:material 120', '  negócio   material 120', 'negócio material 120',
      // O ponto logo depois da palavra, como ":" e "," (o celular põe o ponto sozinho depois de dois espaços).
      'Negócio. material 120', 'negócio.material 120', 'negocio . material 120']) {
      expect(businessMessageRest(t)?.trim(), t).toBe('material 120');
      expect(read(t), t).toMatchObject({ type: 'anotar', business: true, description: 'Material', amountCents: 12000 });
    }
    expect(read('Negócio. Vendi 80 no cartão')).toMatchObject({ type: 'anotar', kind: 'receita', business: true, description: 'Vendas', card: null });
    for (const t of ['negócios 50', 'negociação 50', 'material negócio 120', 'negócios. material 120', 'mercado 52,30']) {
      expect(businessMessageRest(t), t).toBeNull();
      expect(read(t), t).not.toHaveProperty('business');
    }
    // Sem a palavra, nada muda: as categorias do Pessoal e da Família.
    expect(read('mercado 52,30')).toEqual({
      type: 'anotar', kind: 'despesa', amountCents: 5230, occurredOn: TODAY, daysAgo: 0, description: 'Mercado', category: 'Mercado', card: null,
    });
    expect(read('negócios 50')).toMatchObject({ description: 'Negócios', category: null });
  });

  it('o resto da mensagem segue as regras de sempre: recebimento, data, valor, cartão; a palavra sai da descrição', () => {
    expect(read('negócio material 120 cartão')).toEqual({
      type: 'anotar', kind: 'despesa', amountCents: 12000, occurredOn: TODAY, daysAgo: 0, description: 'Material', category: 'Material e mercadoria',
      card: { hint: null }, business: true,
    });
    expect(read('negócio recebi 300 conserto')).toEqual({
      type: 'anotar', kind: 'receita', amountCents: 30000, occurredOn: TODAY, daysAgo: 0, description: 'Conserto', category: 'Serviços', card: null, business: true,
    });
    expect(read('negócio +300 conserto')).toMatchObject({ kind: 'receita', category: 'Serviços', business: true });
    expect(read('negócio gasolina 80 ontem cartão azul')).toMatchObject({
      kind: 'despesa', amountCents: 8000, daysAgo: 1, occurredOn: '2026-11-26', description: 'Gasolina', category: 'Combustível e transporte',
      card: { hint: 'azul' }, business: true,
    });
    expect(read('negócio aluguel 1.500,00 05/11')).toMatchObject({ amountCents: 150000, daysAgo: null, occurredOn: '2026-11-05', category: 'Aluguel do ponto' });
    // Sem palavra de tipo: entrada só quando a descrição é de entrada e não de saída.
    expect(read('negócio vendas 450')).toMatchObject({ kind: 'receita', category: 'Vendas' });
    expect(read('negócio venda de sacolé 45')).toMatchObject({ kind: 'receita', description: 'Venda de sacolé', category: 'Vendas' });
    expect(read('negócio empréstimo 1000')).toMatchObject({ kind: 'despesa', category: 'Parcela de empréstimo' });
    expect(read('negócio recebi 5000 empréstimo')).toMatchObject({ kind: 'receita', category: 'Empréstimo recebido' });
    // Os erros de leitura são os de sempre, com a resposta de sempre.
    expect(read('negócio material')).toEqual({ type: 'erro', reason: 'sem_valor' });
    expect(read('negócio material 120 amanhã 30/11')).toEqual({ type: 'erro', reason: 'data_futura' });
    expect(whatsappParseReply('sem_valor', 'telegram')).toBe('Não encontrei o valor. Escreva o que foi e o valor, por exemplo: mercado 52,30');
  });

  it('só as categorias do negócio, nunca as do Pessoal; no cartão do negócio, sem as saídas de fora da operação', () => {
    expect(read('negócio mercado 50')).toMatchObject({ business: true, category: null });
    expect(read('negócio farmácia 41')).toMatchObject({ business: true, category: null });
    expect(read('negócio juros do empréstimo 30')).toMatchObject({ category: 'Juros e multas' });
    expect(read('negócio taxa da maquininha 12,50')).toMatchObject({ category: 'Taxas e maquininha' });
    expect(read('negócio máquina de cartão 90')).toMatchObject({ category: 'Taxas e maquininha' });
    expect(read('negócio peças 200')).toMatchObject({ category: 'Peças e ferramentas' });
    expect(read('negócio impostos e das 76')).toMatchObject({ category: 'Impostos e DAS' });
    expect(read('negócio divulgação 60')).toMatchObject({ category: 'Divulgação' });
    expect(read('negócio luz do ponto 180')).toMatchObject({ category: 'Contas do ponto' });
    expect(read('negócio ajudante 150')).toMatchObject({ category: 'Funcionários e ajudantes' });
    expect(read('negócio equipamento 900')).toMatchObject({ category: 'Equipamento', card: null });
    expect(read('negócio equipamento 900 cartão')).toMatchObject({ category: null, card: { hint: null } });
    expect(read('negócio empréstimo 300 cartão')).toMatchObject({ category: null });
    expect(read('negócio material 120 cartão')).toMatchObject({ category: 'Material e mercadoria' });
    for (const kind of ['despesa', 'receita'] as const) {
      for (const rule of WHATSAPP_BUSINESS_RULES[kind]) expect(BUSINESS_CATEGORIES[kind], rule.category).toContain(rule.category);
      for (const c of BUSINESS_CATEGORIES[kind]) expect(whatsappCategory(`${c} 10`, kind, 'negocio'), c).toBe(c);
      for (const c of CATEGORIES[kind]) {
        const got = whatsappCategory(c, kind, 'negocio');
        expect(got === null || BUSINESS_CATEGORIES[kind].includes(got), `${c} → ${got}`).toBe(true);
      }
    }
    expect([...BUSINESS_NOT_ON_CARD]).toEqual([...BUSINESS_OUTSIDE_CATEGORIES.despesa]);
    expect(cardCategories(BUSINESS_CATEGORIES.despesa).filter((c) => BUSINESS_NOT_ON_CARD.includes(c))).toEqual([]);
  });

  it('o DAS no negócio: "das" é a guia, com a categoria Impostos e DAS, e não a palavra de ligação que sai das pontas', () => {
    const das = (description: string, amountCents: number) => ({
      type: 'anotar', kind: 'despesa', amountCents, occurredOn: TODAY, daysAgo: 0, description, category: 'Impostos e DAS', card: null, business: true,
    });
    expect(read('negócio DAS 76,60')).toEqual(das('DAS', 7660));
    expect(read('negócio paguei o DAS 76')).toEqual(das('DAS', 7600));
    expect(read('negócio guia do das 76')).toEqual(das('Guia do DAS', 7600));
    expect(read('negócio das do mei 76')).toEqual(das('DAS do MEI', 7600));
    expect(read('negócio das 76')).toEqual(das('DAS', 7600));
    expect(read('negócio pagamento do das 76')).toEqual(das('Pagamento do DAS', 7600));
    expect(read('negócio das de novembro 76')).toEqual(das('DAS de novembro', 7600));
    expect(read('negócio impostos e das 76')).toEqual(das('Impostos e DAS', 7600));
    // A regra que vem antes continua valendo ("juros do DAS" é Juros e multas); o MEI é escrito em maiúsculas no negócio.
    expect(read('negócio juros do das 12')).toMatchObject({ description: 'Juros do DAS', category: 'Juros e multas' });
    expect(read('negócio contador do mei 150')).toMatchObject({ description: 'Contador do MEI', category: 'Contabilidade e sistemas' });
    // "das" como palavra de ligação, no meio ou no começo antes de outra palavra, segue como antes, também com a mensagem em maiúsculas.
    expect(read('negócio venda das camisetas 300')).toMatchObject({ kind: 'receita', description: 'Venda das camisetas', category: 'Vendas' });
    expect(read('NEGÓCIO VENDA DAS CAMISETAS 300')).toMatchObject({ kind: 'receita', description: 'VENDA DAS CAMISETAS', category: 'Vendas' });
    expect(read('negócio 300 das vendas')).toMatchObject({ kind: 'receita', description: 'Vendas', category: 'Vendas' });
    expect(read('negócio taxa das vendas 12')).toMatchObject({ kind: 'despesa', description: 'Taxa das vendas', category: 'Taxas e maquininha' });
    expect(whatsappCategory('DAS', 'despesa', 'negocio')).toBe('Impostos e DAS');
    expect(whatsappCategory('Venda das camisetas', 'despesa', 'negocio')).toBeNull();
    // No Pessoal, nada muda: "das" segue palavra de ligação.
    expect(read('almoço das crianças 50')).toEqual({
      type: 'anotar', kind: 'despesa', amountCents: 5000, occurredOn: TODAY, daysAgo: 0, description: 'Almoço das crianças', category: null, card: null,
    });
    expect(read('das do mei 76')).toMatchObject({ description: 'Mei', category: null });
    expect(read('DAS 76,60')).toEqual({ type: 'erro', reason: 'sem_descricao' });
    expect(read('paguei o das 76')).toEqual({ type: 'erro', reason: 'sem_descricao' });
  });

  it('venda paga no cartão é entrada do negócio (Vendas), nunca compra no cartão do negócio', () => {
    const venda = (description: string) => ({
      type: 'anotar', kind: 'receita', amountCents: 8000, occurredOn: TODAY, daysAgo: 0, description, category: 'Vendas', card: null, business: true,
    });
    expect(read('negócio vendi 80 no cartão')).toEqual(venda('Vendas'));
    expect(read('negócio venda 80 cartão')).toEqual(venda('Venda'));
    expect(read('negócio vendas 80 no cartão')).toEqual(venda('Vendas'));
    expect(read('negócio vendi 80 no cartão azul')).toEqual(venda('Vendas'));
    expect(read('negócio vendi 80 no cartão de crédito')).toEqual(venda('Vendas'));
    expect(read('negócio venda 80 cartão azul')).toEqual(venda('Venda'));
    expect(read('negócio vendido 80 no cartão')).toEqual(venda('Vendido'));
    expect(read('negócio cartão venda 80')).toEqual(venda('Venda'));
    // "vendi" decide o tipo e sai da descrição, como "recebi"; a categoria fica Vendas quando a descrição não diz outra.
    expect(read('negócio vendi 80')).toEqual(venda('Vendas'));
    expect(read('negócio vendi 80 bolo de pote')).toEqual(venda('Bolo de pote'));
    expect(read('negócio bolo vendido 80')).toEqual(venda('Bolo vendido'));
    expect(read('negócio vendi 80 conserto')).toMatchObject({ kind: 'receita', description: 'Conserto', category: 'Serviços' });
    // Outra entrada paga no cartão: a palavra sai; sem nada além do cartão, as palavras escritas, como antes.
    expect(read('negócio recebi 300 conserto no cartão')).toMatchObject({ kind: 'receita', description: 'Conserto', category: 'Serviços', card: null });
    expect(read('negócio recebi 300 cartão')).toMatchObject({ kind: 'receita', description: 'Cartão', category: null, card: null });
    expect(read('negócio +80 venda cartão')).toEqual(venda('Venda'));
    // Saída com palavra de venda continua saída, no cartão quando escrito.
    expect(read('negócio taxa da venda 5')).toMatchObject({ kind: 'despesa', category: 'Taxas e maquininha', card: null });
    expect(read('negócio taxa da venda 5 cartão')).toMatchObject({ kind: 'despesa', category: 'Taxas e maquininha', card: { hint: null } });
    expect(read('negócio material para venda 120 cartão')).toMatchObject({ kind: 'despesa', category: 'Material e mercadoria', card: { hint: null } });
    expect(read('negócio frete do produto vendido 20')).toMatchObject({ kind: 'despesa', category: 'Combustível e transporte' });
    expect(read('negócio paguei 50 venda cartão')).toMatchObject({ kind: 'despesa', card: { hint: null } });
    // Nenhuma entrada do negócio sai com cartão.
    for (const t of ['negócio vendi 80 no cartão', 'negócio venda 80 cartão', 'negócio recebi 80 cartão azul', 'negócio +80 conserto cartão', 'negócio vendas 80 no crédito']) {
      expect(read(t), t).toMatchObject({ type: 'anotar', kind: 'receita', card: null });
    }
    // No Pessoal, nada muda: venda no cartão segue compra no cartão, e "vendi" não é palavra de recebimento.
    expect(read('vendi 80 no cartão')).toMatchObject({ kind: 'despesa', description: 'Vendi', card: { hint: null } });
    expect(read('venda 80 cartão')).toMatchObject({ kind: 'despesa', description: 'Venda', card: { hint: null } });
    expect(read('recebi 300 cartão')).toMatchObject({ kind: 'receita', description: 'Cartão', card: null });
  });

  it('depois da palavra, só anotar vale (e DESFAZER, que é a última anotação do canal); ligar, desligar e ajuda recebem a ajuda', () => {
    expect(read('negócio')).toEqual({ type: 'ajuda' });
    expect(read('Negócio:')).toEqual({ type: 'ajuda' });
    expect(read('negócio ajuda')).toEqual({ type: 'ajuda' });
    expect(read('negócio desligar')).toEqual({ type: 'ajuda' });
    expect(read('negócio ativar ABCD-EF23')).toEqual({ type: 'ajuda' });
    expect(read('negócio ativar 12')).toEqual({ type: 'ajuda' });
    expect(read('negócio desfazer')).toEqual({ type: 'desfazer' });
    expect(read('negócio como eu anoto?')).toEqual({ type: 'ajuda' });
  });
});

describe('Negócio pelo Telegram: as funções do banco', () => {
  const USER = 700100299;
  const NOW = Date.UTC(2026, 10, 27, 15, 0) / 1000; // 27/11/2026, 12h em Brasília
  const KEY = 'chave-dos-resumos-de-teste-0123456789abcdef';
  const inbound = (t: string): TelegramInbound => ({ chatId: USER, messageId: 9, fromId: USER, timestamp: NOW, kind: 'texto', text: t });

  it('com a palavra, as funções de negócio, com os mesmos argumentos de sempre (sem espaço, sem negócio escolhido pelo texto)', async () => {
    const calls: { fn: string; args: Record<string, unknown> }[] = [];
    const rpc = async (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      return { result: 'nao_ligado' } as WhatsAppOutcome;
    };
    await handleTelegramMessage(inbound('negócio material 120'), rpc, KEY);
    await handleTelegramMessage(inbound('material 120'), rpc, KEY);
    await handleTelegramMessage(inbound('negócio gasolina 80 cartão azul'), rpc, KEY);
    await handleTelegramMessage(inbound('gasolina 80 cartão azul'), rpc, KEY);
    await handleTelegramMessage(inbound('Negócio: recebi 300 conserto'), rpc, KEY);
    expect(calls.map((c) => c.fn)).toEqual([
      'telegram_add_business_record', 'telegram_add_record', 'telegram_add_business_card_purchase', 'telegram_add_card_purchase', 'telegram_add_business_record',
    ]);
    const base = { p_message_id: chatMessageKey('telegram', `${USER}:9`, KEY), p_sender_hash: telegramSenderHash(USER, KEY), p_sent_at: new Date(NOW * 1000).toISOString() };
    expect(calls[0]!.args).toEqual({
      ...base, p_kind: 'despesa', p_amount_cents: 12000, p_days_ago: 0, p_occurred_on: null, p_description: 'Material', p_category: 'Material e mercadoria',
    });
    // As mesmas chaves das funções de sempre: o espaço nunca vai na chamada.
    expect(Object.keys(calls[0]!.args).sort()).toEqual(Object.keys(calls[1]!.args).sort());
    expect(calls[2]!.args).toEqual({
      ...base, p_amount_cents: 8000, p_days_ago: 0, p_occurred_on: null, p_description: 'Gasolina', p_category: 'Combustível e transporte', p_card_hint: 'azul',
    });
    expect(Object.keys(calls[2]!.args).sort()).toEqual(Object.keys(calls[3]!.args).sort());
    expect(calls[4]!.args).toMatchObject({ p_kind: 'receita', p_description: 'Conserto', p_category: 'Serviços' });
    for (const c of calls) expect(JSON.stringify(c.args)).not.toMatch(/negocio|negócio|context|space/i);
  });

  it('o WhatsApp (ainda em piloto fechado) usa a mesma leitura: whatsapp_add_business_record e whatsapp_add_business_card_purchase', async () => {
    const calls: { fn: string; args: Record<string, unknown> }[] = [];
    const rpc = async (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      return { result: 'nao_ligado' } as WhatsAppOutcome;
    };
    const msg = (t: string): WhatsAppInbound => ({ id: 'wamid.n', from: '5521988887777', timestamp: NOW, type: 'text', text: t });
    await handleWhatsAppMessage(msg('negócio material 120'), rpc, 'chave');
    await handleWhatsAppMessage(msg('negocio material 120 cartão'), rpc, 'chave');
    expect(calls.map((c) => c.fn)).toEqual(['whatsapp_add_business_record', 'whatsapp_add_business_card_purchase']);
    expect(calls[0]!.args).toMatchObject({ p_phone_hash: whatsappPhoneHash('5521988887777', 'chave'), p_description: 'Material', p_category: 'Material e mercadoria' });
  });

  it('o resultado novo (sem_negocio) é aceito na resposta do banco; outro resultado desconhecido continua sendo erro', async () => {
    const fetcher = (body: unknown) => async () => ({ status: 200, text: async () => JSON.stringify(body) });
    const config = { supabaseUrl: 'https://projeto.supabase.co', serviceKey: 'sb_secret_x' };
    expect(await supabaseChatRpc(config, fetcher({ result: 'sem_negocio', today: TODAY }))('telegram_add_business_record', {})).toEqual({ result: 'sem_negocio', today: TODAY });
    await expect(supabaseChatRpc(config, fetcher({ result: 'negocio_de_outra_pessoa' }))('telegram_add_business_record', {})).rejects.toThrow();
  });

  it('a ajuda e o ligado ensinam a palavra só a quem tem o próprio negócio (o banco diz com "negocio": true)', async () => {
    const withNote = (note: WhatsAppOutcome) => async (fn: string) => (fn === 'telegram_note' ? note : ({ result: 'nao_ligado' } as WhatsAppOutcome));
    expect(await handleTelegramMessage(inbound('ajuda'), withNote({ result: 'registrada' }), KEY)).toBe(TELEGRAM_REPLY.ajuda);
    expect(await handleTelegramMessage(inbound('/start'), withNote({ result: 'registrada', negocio: true }), KEY)).toBe(TELEGRAM_REPLY.ajuda_negocio);
    expect(await handleTelegramMessage(inbound('negócio'), withNote({ result: 'registrada', negocio: true }), KEY)).toBe(TELEGRAM_REPLY.ajuda_negocio);
    // Mídia e mensagem que a Clarevo não entendeu: as respostas de sempre, mesmo com a chave.
    expect(await handleTelegramMessage({ ...inbound(''), kind: 'midia', text: null }, withNote({ result: 'registrada', negocio: true }), KEY)).toBe(TELEGRAM_REPLY.midia);
    expect(TELEGRAM_REPLY.ajuda).not.toContain('negócio');
    expect(TELEGRAM_REPLY.ajuda_negocio).toBe(
      TELEGRAM_REPLY.ajuda.replace(
        'cartão azul".',
        'cartão azul".\n\nPara anotar no seu negócio, comece com a palavra negócio:\nnegócio material 120\nnegócio recebi 300 conserto',
      ),
    );
    const space: WhatsAppSpace = { kind: 'pessoal', name: 'Pessoal' };
    const linked = whatsappOutcomeReply({ result: 'ligado', space, name: 'Maria Exemplo', negocio: true }, TODAY, 'telegram')!;
    expect(linked).toContain('Pronto, este Telegram está ligado à conta de Maria Exemplo na Clarevo, no espaço Pessoal.');
    expect(linked).toContain('Para anotar no seu negócio, comece com a palavra negócio:\nnegócio material 120');
    expect(whatsappOutcomeReply({ result: 'ligado', space, name: 'Maria Exemplo' }, TODAY, 'telegram')).not.toContain('negócio');
  });
});

describe('Negócio pelo Telegram: as respostas', () => {
  const reply = (o: WhatsAppOutcome) => whatsappOutcomeReply(o, TODAY, 'telegram');
  const record = (kind: 'despesa' | 'receita') => ({
    kind, amount_cents: kind === 'despesa' ? 12000 : 30000, occurred_on: TODAY, description: kind === 'despesa' ? 'Material' : 'Conserto',
    category: kind === 'despesa' ? 'Material e mercadoria' : 'Serviços', account_name: 'Conta do negócio',
  });

  it('a confirmação diz o nome do negócio, com as palavras do negócio no app (Saída e Entrada)', () => {
    expect(reply({ result: 'anotado', space: BIZ, record: record('despesa'), today: TODAY })).toBe(
      'Anotado no espaço Sacolé da Maria:\nSaída: Material, R$ 120,00\nCategoria: Material e mercadoria\nData: hoje, 27/11\nSaiu de: Conta do negócio\n\nSe algo ficou errado, responda DESFAZER.',
    );
    expect(reply({ result: 'anotado', space: BIZ, record: record('receita'), today: TODAY })).toBe(
      'Anotado no espaço Sacolé da Maria:\nEntrada: Conserto, R$ 300,00\nCategoria: Serviços\nData: hoje, 27/11\nEntrou em: Conta do negócio\n\nSe algo ficou errado, responda DESFAZER.',
    );
    expect(reply({ result: 'desfeito', space: BIZ, record: record('despesa'), today: TODAY })).toBe(
      'Desfeito. Saiu do espaço Sacolé da Maria:\nSaída: Material, R$ 120,00\nCategoria: Material e mercadoria\nData: hoje, 27/11\nSaiu de: Conta do negócio',
    );
    const purchase = { amount_cents: 8000, purchased_on: TODAY, description: 'Gasolina', category: 'Combustível e transporte', card_nickname: 'Cartão da loja', invoice_month: '2026-12-01' };
    expect(reply({ result: 'compra_anotada', space: BIZ, purchase, today: TODAY })).toBe(
      'Anotado no espaço Sacolé da Maria:\nCompra no Cartão da loja: Gasolina, R$ 80,00\nCategoria: Combustível e transporte\nData da compra: hoje, 27/11\nFatura de dezembro\n\nSe algo ficou errado, responda DESFAZER.',
    );
    // No Pessoal, nada muda.
    expect(reply({ result: 'anotado', space: { kind: 'pessoal', name: 'Pessoal' }, record: record('despesa'), today: TODAY })).toContain('\nGasto: Material, R$ 120,00\n');
  });

  it('sem negócio, a resposta diz como criar, sem gravar nada e sem falar de negócio de outra pessoa', () => {
    expect(reply({ result: 'sem_negocio', today: TODAY })).toBe(
      'Nada foi anotado. Para anotar no negócio por aqui, crie antes o espaço Negócio no app: abra Conta e toque em Criar o espaço Negócio. Sem a palavra negócio no começo, a mensagem anota como sempre.',
    );
    expect(TELEGRAM_REPLY.sem_negocio).toContain(BUSINESS_TEXT.accountCreate);
    expect(TELEGRAM_REPLY.sem_negocio).toBe(WHATSAPP_REPLY.sem_negocio);
    expect(TELEGRAM_REPLY.sem_negocio).not.toMatch(/plus|outra pessoa|compartilh|sócio|convite/i);
  });

  it('cartão, banco e permissão no negócio: respostas do negócio, sem mandar ligar de novo', () => {
    expect(reply({ result: 'sem_cartao', space: BIZ, today: TODAY })).toBe(
      'O espaço Sacolé da Maria não tem cartão de crédito cadastrado. Para anotar no cartão, cadastre um no app, com o negócio escolhido no topo, em Movimentos, Cartões. Para anotar como saída já paga, mande de novo sem a palavra cartão.',
    );
    expect(reply({ result: 'qual_cartao', space: BIZ, cards: ['Cartão da loja', 'Roxo'], today: TODAY })).toBe(
      'Qual cartão? Você tem: Cartão da loja e Roxo. Mande de novo com o nome depois da palavra cartão, como "negócio material 120 cartão da loja".',
    );
    expect(reply({ result: 'sem_conta', space: BIZ, today: TODAY })).toBe(
      'O espaço Sacolé da Maria está sem banco ou carteira principal. No app, escolha o negócio no topo, abra Conta e escolha a opção principal em Bancos e carteira.',
    );
    expect(reply({ result: 'sem_permissao', space: BIZ, today: TODAY })).toBe('Você não anota mais no espaço Sacolé da Maria.');
    // No Pessoal e na Família, as de sempre.
    expect(reply({ result: 'sem_cartao', space: { kind: 'pessoal', name: 'Pessoal' } })).toContain('O espaço Pessoal não tem cartão de crédito cadastrado.');
    expect(reply({ result: 'qual_cartao', space: { kind: 'pessoal', name: 'Pessoal' }, cards: ['Azul', 'Roxo'] })).toContain('"farmácia 41 cartão azul"');
  });

  it('os textos novos seguem as regras de escrita (sem travessão, sem "fazer sentido", sem contabilidade nem conselho) e não falam em WhatsApp no Telegram', () => {
    const texts = [
      TELEGRAM_REPLY.ajuda_negocio, TELEGRAM_REPLY.sem_negocio,
      reply({ result: 'sem_cartao', space: BIZ })!, reply({ result: 'sem_conta', space: BIZ })!, reply({ result: 'sem_permissao', space: BIZ })!,
      reply({ result: 'qual_cartao', space: BIZ, cards: ['Azul', 'Roxo'] })!,
      TELEGRAM_TEXT.businessTitle, TELEGRAM_TEXT.businessBody('Sacolé da Maria'), ...TELEGRAM_TEXT.businessExamples, BUSINESS_TEXT.chatNoteOwner,
    ];
    for (const t of texts) {
      expect(t, t).not.toMatch(/—|–|fazer sentido|contexto|whatsapp|\bmeta\b|número|contábil|contabilidade|imposto devido|declar|recomend|invista|obrigad[oa]|bem-vind[oa]/i);
      expect(t, t).not.toMatch(/\bo Clarevo\b|\bdo Clarevo\b|\bno Clarevo\b/);
    }
    expect(TELEGRAM_TEXT.businessBody('Sacolé da Maria')).toBe('Comece a mensagem com a palavra negócio para anotar no espaço Sacolé da Maria, com as categorias do negócio.');
    expect(WHATSAPP_TEXT.businessExamples).toEqual(TELEGRAM_TEXT.businessExamples);
    // Os exemplos da tela leem como devem: cada um vira uma anotação do negócio.
    for (const e of TELEGRAM_TEXT.businessExamples) expect(read(e.split(':')[0]!), e).toMatchObject({ type: 'anotar', business: true });
  });
});

describe('Negócio pelo Telegram: a função gerada', () => {
  it('a função telegram gerada chama telegram_add_business_record com a palavra "negócio"', async () => {
    const root = join(__dirname, '../../..');
    execFileSync('node', [join(root, 'scripts/gerar-funcoes.js'), '--conferir']);
    const src = readFileSync(join(root, 'supabase/functions/telegram/index.ts'), 'utf8');
    const SECRET = 'segredo_do_endereco_de_teste_0123456789';
    const env: Record<string, string> = { TELEGRAM_WEBHOOK_SECRET: SECRET, TELEGRAM_ID_KEY: 'chave-dos-resumos-de-teste-0123456789abcdef', SUPABASE_URL: 'https://projeto.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_x' };
    let serve: ((req: Request) => Promise<Response>) | undefined;
    const deno = { env: { get: (n: string) => env[n] }, serve: (h: (req: Request) => Promise<Response>) => (serve = h) };
    const sent: string[] = [];
    const fakeFetch = async (url: string, init: { body: string }) => {
      sent.push(`${url} ${init.body}`);
      return new Response(JSON.stringify({ result: 'sem_negocio', today: TODAY }), { status: 200 });
    };
    new Function('Deno', 'fetch', 'console', src)(deno, fakeFetch, { error: () => {} });
    const update = { update_id: 1, message: { message_id: 3, date: Date.UTC(2026, 10, 27, 15) / 1000, chat: { id: 700100299, type: 'private' }, from: { id: 700100299, is_bot: false }, text: 'negócio material 120' } };
    const res = await serve!(new Request('https://f/telegram', { method: 'POST', body: JSON.stringify(update), headers: { 'X-Telegram-Bot-Api-Secret-Token': SECRET } }));
    expect(res.status).toBe(200);
    expect((await res.json()).text).toBe(TELEGRAM_REPLY.sem_negocio);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain('https://projeto.supabase.co/rest/v1/rpc/telegram_add_business_record');
    expect(sent[0]).toContain('"p_description":"Material"');
  });
});
