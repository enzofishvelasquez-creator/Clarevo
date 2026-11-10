import { describe, expect, it } from 'vitest';
import {
  MemoryRepository,
  RepoError,
  importKey,
  isRepoError,
  summarizeMonth,
  summarizeToPay,
  type ImportItem,
  purchaseInstallments,
  type RepoErrorCode,
} from '../src';

const TODAY = '2026-10-07';

/** Chave de importação de teste: 64 hexadecimais calculados do nome. */
const k = (name: string) => importKey('teste', { date: '2026-01-01', amountCents: 1, description: name, fitId: null }, 0);
const item = (name: string, kind: ImportItem['kind'], amountCents: number, occurredOn: string, description: string, category: string | null = null): ImportItem => ({
  importKey: k(name),
  kind,
  amountCents,
  occurredOn,
  description,
  category,
});

async function fresh(day = TODAY) {
  const clock = { today: day };
  const repo = new MemoryRepository({ actorId: 'pessoa-teste', displayName: 'Pessoa de teste', today: () => clock.today });
  const space = await repo.ensurePersonalSpace('Conta principal');
  const ctx = space.personalContextId;
  const accountId = space.accounts[0]!.id;
  const card = (await repo.createCard('op-card-0001', ctx, { name: 'Cartão Exemplo', lastDigits: '4321', closingDay: 3, dueDay: 10, limitCents: 500_000 })).card.id;
  const month = async (m: string) => {
    const s = summarizeMonth(await repo.listRecords(ctx, m), ctx, m);
    return [s.receivedCents, s.paidCents, s.differenceCents];
  };
  return { repo, ctx, accountId, card, clock, month };
}

async function code(p: Promise<unknown>): Promise<[RepoErrorCode | null, string | undefined]> {
  try {
    await p;
  } catch (e) {
    if (e instanceof RepoError) return [e.code, e.detail];
    throw e;
  }
  return [null, undefined];
}

describe('importRecords: conta', () => {
  it('cria gastos e recebimentos nos dias deles, na conta escolhida; Pago e Recebido mudam, Ainda a pagar não', async () => {
    const f = await fresh();
    const before = summarizeToPay(await f.repo.listCommitments(f.ctx, '2026-10'), f.ctx, '2026-10', TODAY).toPayCents;
    const r = await f.repo.importRecords('imp-conta-0001', f.ctx, 'conta', f.accountId, [
      item('a1', 'despesa', 4590, '2026-10-02', '  Padaria  Pão Quente ', 'Mercado'),
      item('a2', 'despesa', 12000, '2026-10-03', 'Posto', 'Transporte'),
      item('a3', 'receita', 500000, '2026-10-05', 'Salário', 'Salário'),
      item('a4', 'despesa', 3500, '2026-09-28', 'Farmácia', null),
    ]);
    expect(r).toEqual({ created: 4, skipped: 0 });
    expect(await f.month('2026-10')).toEqual([500000, 16590, 483410]);
    expect(await f.month('2026-09')).toEqual([0, 3500, -3500]);
    expect(summarizeToPay(await f.repo.listCommitments(f.ctx, '2026-10'), f.ctx, '2026-10', TODAY).toPayCents).toBe(before);
    const records = await f.repo.listRecords(f.ctx, '2026-10');
    expect(records.map((x) => [x.kind, x.amountCents, x.occurredOn, x.description, x.category, x.accountId, x.version, x.commitmentId, x.receiptKey]).sort()).toEqual(
      [
        ['despesa', 12000, '2026-10-03', 'Posto', 'Transporte', f.accountId, 1, null, null],
        ['despesa', 4590, '2026-10-02', 'Padaria  Pão Quente', 'Mercado', f.accountId, 1, null, null],
        ['receita', 500000, '2026-10-05', 'Salário', 'Salário', f.accountId, 1, null, null],
      ].sort(),
    );
    // O registro devolvido ao app não leva a chave da importação.
    expect(JSON.stringify(records)).not.toContain(k('a1'));
  });

  it('repetição com a mesma chave devolve o resultado sem gravar; outro conteúdo é chave_reutilizada', async () => {
    const f = await fresh();
    const items = [item('b1', 'despesa', 100, '2026-10-01', 'Bala'), item('b2', 'despesa', 200, '2026-10-01', 'Doce')];
    const first = await f.repo.importRecords('imp-conta-0002', f.ctx, 'conta', f.accountId, items);
    expect(await f.repo.importRecords('imp-conta-0002', f.ctx, 'conta', f.accountId, items)).toEqual(first);
    expect((await f.repo.listRecords(f.ctx, '2026-10')).length).toBe(2);
    expect(await code(f.repo.importRecords('imp-conta-0002', f.ctx, 'conta', f.accountId, items.slice(0, 1)))).toEqual(['chave_reutilizada', undefined]);
    expect(await code(f.repo.createRecord('imp-conta-0002', f.ctx, 'despesa', { accountId: f.accountId, amountCents: 100, occurredOn: '2026-10-01', description: 'x', category: null }))).toEqual(['chave_reutilizada', undefined]);
    expect(await f.repo.findImportOperation('imp-conta-0002')).toEqual({ targetId: f.accountId, result: { created: 2, skipped: 0 } });
    expect(await f.repo.findImportOperation('nao-existe-0001')).toBeNull();
    expect(await f.repo.findOperation('imp-conta-0002')).toBeNull();
  });

  it('chave que já existe viva é pulada (sem validar); excluir libera; editar mantém', async () => {
    const f = await fresh();
    await f.repo.importRecords('imp-conta-0003', f.ctx, 'conta', f.accountId, [item('c1', 'despesa', 700, '2026-10-06', 'Bala')]);
    expect(await f.repo.importRecords('imp-conta-0004', f.ctx, 'conta', f.accountId, [item('c1', 'despesa', 0, '2026-10-06', ''), item('c2', 'despesa', 300, '2026-10-06', 'Doce')])).toEqual({
      created: 1,
      skipped: 1,
    });
    expect(await f.repo.importRecords('imp-conta-0005', f.ctx, 'conta', f.accountId, [item('c3', 'despesa', 1, '2026-10-06', 'X'), item('c3', 'despesa', 1, '2026-10-06', 'X')])).toEqual({
      created: 1,
      skipped: 1,
    });
    const bala = (await f.repo.listRecords(f.ctx, '2026-10')).find((r) => r.description === 'Bala')!;
    const edited = await f.repo.updateRecord('imp-conta-0006', bala.id, 1, { accountId: f.accountId, amountCents: 750, occurredOn: '2026-10-06', description: 'Bala de menta', category: 'Lazer' });
    expect(await f.repo.importRecords('imp-conta-0007', f.ctx, 'conta', f.accountId, [item('c1', 'despesa', 700, '2026-10-06', 'Bala')])).toEqual({ created: 0, skipped: 1 });
    await f.repo.deleteRecord('imp-conta-0008', bala.id, edited.version);
    expect(await f.repo.importRecords('imp-conta-0009', f.ctx, 'conta', f.accountId, [item('c1', 'despesa', 700, '2026-10-06', 'Bala')])).toEqual({ created: 1, skipped: 0 });
    expect(await f.repo.findImportedKeys(f.ctx, [k('c1'), k('c2'), k('zzz')])).toEqual(expect.arrayContaining([k('c1'), k('c2')]));
    expect(await f.repo.findImportedKeys(f.ctx, [k('c1'), k('c2'), k('zzz')])).toHaveLength(2);
    expect(await f.repo.findImportedKeys('outro-contexto', [k('c1')])).toEqual([]);
    expect(await f.repo.findImportedKeys(f.ctx, [])).toEqual([]);
  });

  it('a ordem das recusas é a do banco, com a posição do item, e nada é gravado', async () => {
    const f = await fresh();
    const good = item('d0', 'despesa', 100, '2026-10-01', 'Bom');
    const bad = (patch: Partial<ImportItem>) => [good, { ...item('d1', 'despesa', 100, '2026-10-01', 'x'), ...patch }];
    const run = (key: string, items: readonly ImportItem[], dest: 'conta' | 'cartao' = 'conta', target = f.accountId, ctx = f.ctx) =>
      code(f.repo.importRecords(key, ctx, dest, target, items));
    expect(await run('imp-err-0001', [], 'conta')).toEqual(['itens_invalidos', undefined]);
    expect(await run('imp-err-0002', Array.from({ length: 501 }, (_, i) => item(`m${i}`, 'despesa', 1, '2026-10-01', 'x')))).toEqual(['itens_invalidos', undefined]);
    expect(await run('imp-err-0003', [good], 'banco' as 'conta')).toEqual(['destino_invalido', undefined]);
    expect(await run('imp-err-0004', [good], 'conta', f.accountId, 'outro-contexto')).toEqual(['sem_permissao', undefined]);
    expect(await run('imp-err-0005', [good], 'conta', 'conta-que-nao-existe')).toEqual(['conta_invalida', undefined]);
    expect(await run('imp-err-0006', [good], 'cartao', 'cartao-que-nao-existe')).toEqual(['nao_encontrado', undefined]);
    expect(await run('imp-err-0010', bad({ importKey: 'abc' }))).toEqual(['chave_de_importacao_invalida', 'item=2']);
    expect(await run('imp-err-0011', bad({ kind: 'compra' }))).toEqual(['tipo_invalido', 'item=2']);
    expect(await run('imp-err-0012', bad({ amountCents: 0 }))).toEqual(['valor_invalido', 'item=2']);
    expect(await run('imp-err-0013', bad({ amountCents: 12.5 }))).toEqual(['valor_invalido', 'item=2']);
    expect(await run('imp-err-0014', bad({ amountCents: 1_000_000_000 }))).toEqual(['valor_acima_do_limite', 'item=2']);
    expect(await run('imp-err-0015', bad({ description: '   ' }))).toEqual(['descricao_obrigatoria', 'item=2']);
    expect(await run('imp-err-0016', bad({ description: 'x'.repeat(81) }))).toEqual(['descricao_longa', 'item=2']);
    expect(await run('imp-err-0017', bad({ category: 'c'.repeat(41) }))).toEqual(['categoria_invalida', 'item=2']);
    expect(await run('imp-err-0018', bad({ occurredOn: '2026-02-30' }))).toEqual(['data_invalida', 'item=2']);
    expect(await run('imp-err-0019', bad({ occurredOn: '2026-10-08' }))).toEqual(['data_futura', 'item=2']);
    expect(await run('imp-err-0020', bad({ amountCents: 0, description: '' }))).toEqual(['valor_invalido', 'item=2']);
    expect(await run('imp-err-0021', bad({ occurredOn: '2026-10-08', description: '' }))).toEqual(['descricao_obrigatoria', 'item=2']);
    expect(await f.repo.listRecords(f.ctx, '2026-10')).toEqual([]);
    expect(await f.repo.findImportOperation('imp-err-0010')).toBeNull();
    // Conta arquivada não recebe.
    const other = await f.repo.createAccount('imp-acc-0001', f.ctx, { name: 'Carteira', kind: 'dinheiro' });
    await f.repo.setAccountStatus('imp-acc-0002', other.id, other.version, 'arquivada');
    expect(await run('imp-err-0030', [good], 'conta', other.id)).toEqual(['conta_invalida', undefined]);
  });

  it('a importação conta como anotação na atividade', async () => {
    const f = await fresh('2026-10-01');
    expect((await f.repo.getReturnReviewState(f.ctx)).activity?.lastWriteOn).toBe('2026-10-01');
    f.clock.today = TODAY;
    await f.repo.importRecords('imp-act-0001', f.ctx, 'conta', f.accountId, [item('e1', 'despesa', 100, '2026-10-06', 'Pão')]);
    expect((await f.repo.getReturnReviewState(f.ctx)).activity?.lastWriteOn).toBe(TODAY);
  });

  it('falha de rede antes de gravar não deixa nada; depois de gravar, repetir a chave é seguro', async () => {
    const f = await fresh();
    const items = [item('f1', 'despesa', 100, '2026-10-06', 'Pão')];
    f.repo.failNextWrite = 'antes';
    expect(await code(f.repo.importRecords('imp-net-0001', f.ctx, 'conta', f.accountId, items))).toEqual(['rede', undefined]);
    expect(await f.repo.findImportOperation('imp-net-0001')).toBeNull();
    f.repo.failNextWrite = 'depois';
    expect(await code(f.repo.importRecords('imp-net-0002', f.ctx, 'conta', f.accountId, items))).toEqual(['rede', undefined]);
    expect(await f.repo.findImportOperation('imp-net-0002')).toEqual({ targetId: f.accountId, result: { created: 1, skipped: 0 } });
    expect(await f.repo.importRecords('imp-net-0002', f.ctx, 'conta', f.accountId, items)).toEqual({ created: 1, skipped: 0 });
    expect((await f.repo.listRecords(f.ctx, '2026-10')).length).toBe(1);
  });
});

describe('importRecords: cartão', () => {
  it('compras à vista na fatura da data e estorno na fatura do estorno; nada entra em Pago; Ainda a pagar cresce com a fatura', async () => {
    const f = await fresh();
    const before = summarizeToPay(await f.repo.listCommitments(f.ctx, '2026-10'), f.ctx, '2026-10', TODAY).toPayCents;
    const totals = await f.month('2026-10');
    const r = await f.repo.importRecords('imp-card-0001', f.ctx, 'cartao', f.card, [
      item('g1', 'compra', 20000, '2026-09-20', 'Livro', 'Educação'),
      item('g2', 'compra', 8050, '2026-10-03', 'Mercado do bairro', 'Mercado'),
      item('g3', 'compra', 15990, '2026-10-04', 'Cinema', 'Lazer'),
      item('g4', 'compra', 3000, '2026-10-06', ' Café ', null),
      item('g5', 'estorno', 4000, '2026-10-05', 'Devolução do cinema', 'Lazer'),
    ]);
    expect(r).toEqual({ created: 5, skipped: 0 });
    expect(await f.month('2026-10')).toEqual(totals);
    const entries = await f.repo.listCardEntries(f.card);
    expect(entries.map((e) => [e.kind, e.amountCents, e.invoiceMonth, e.installments, e.purchasedOn, e.description]).sort()).toEqual(
      [
        ['compra', 20000, '2026-10', 1, '2026-09-20', 'Livro'],
        ['compra', 8050, '2026-10', 1, '2026-10-03', 'Mercado do bairro'],
        ['compra', 15990, '2026-11', 1, '2026-10-04', 'Cinema'],
        ['compra', 3000, '2026-11', 1, '2026-10-06', 'Café'],
        ['estorno', 4000, '2026-11', 1, null, 'Devolução do cinema'],
      ].sort(),
    );
    expect(JSON.stringify(entries)).not.toContain(k('g1'));
    const invoices = await f.repo.listInvoiceItems(f.card);
    expect(invoices.map((i) => [i.month, i.totalCents])).toEqual([
      ['2026-10', 28050],
      ['2026-11', 14990],
    ]);
    expect(summarizeToPay(await f.repo.listCommitments(f.ctx, '2026-10'), f.ctx, '2026-10', TODAY).toPayCents - before).toBe(28050);
    expect(await f.repo.findImportOperation('imp-card-0001')).toEqual({ targetId: f.card, result: { created: 5, skipped: 0 } });
    expect(await f.repo.findCardOperation('imp-card-0001')).toBeNull();
  });

  it('linha com a parcela escrita (D-089 B): a compra entra com as parcelas que faltam, da fatura em que a parcela entra em diante, numeradas como na fatura', async () => {
    const f = await fresh();
    // Compra original de 15/07 (fatura de agosto, fechamento dia 3), parcela 3 de 10 de R$ 120,00: entra em outubro com as 8 que faltam.
    const r = await f.repo.importRecords('imp-card-parc-0001', f.ctx, 'cartao', f.card, [
      { ...item('p1', 'compra', 12000, '2026-07-15', 'Loja de móveis 03/10', 'Lazer'), installment: { number: 3, count: 10 } },
      // Última parcela: uma linha só, nesta fatura.
      { ...item('p2', 'compra', 5000, '2026-10-02', 'Papelaria 03/03', null), installment: { number: 3, count: 3 } },
      // Data da cobrança (fatura de outubro) com a parcela 3 de 10: dezembro passaria da próxima fatura, então entra em outubro.
      { ...item('p3', 'compra', 2000, '2026-10-02', 'Tênis 03/10', null), installment: { number: 3, count: 10 } },
    ]);
    expect(r).toEqual({ created: 3, skipped: 0 });
    const entries = await f.repo.listCardEntries(f.card);
    expect(entries.map((e) => [e.description, e.amountCents, e.installments, e.installmentOffset ?? 0, e.invoiceMonth, e.purchasedOn]).sort()).toEqual(
      [
        ['Loja de móveis 03/10', 96000, 8, 2, '2026-10', '2026-07-15'],
        ['Papelaria 03/03', 5000, 1, 2, '2026-10', '2026-10-02'],
        ['Tênis 03/10', 16000, 8, 2, '2026-10', '2026-10-02'],
      ].sort(),
    );
    const moveis = entries.find((e) => e.description === 'Loja de móveis 03/10')!;
    expect(purchaseInstallments(moveis).map((p) => [p.number, p.count, p.invoiceMonth]).slice(0, 2)).toEqual([[3, 10, '2026-10'], [4, 10, '2026-11']]);
    const invoices = await f.repo.listInvoiceItems(f.card);
    expect(invoices.slice(0, 3).map((i) => [i.month, i.totalCents])).toEqual([
      ['2026-10', 19000],
      ['2026-11', 14000],
      ['2026-12', 14000],
    ]);
    expect(invoices.at(-1)!.month).toBe('2027-05');
    // Números fora da faixa: recusa, nada gravado.
    for (const installment of [{ number: 0, count: 3 }, { number: 4, count: 3 }, { number: 1, count: 1 }, { number: 1, count: 49 }]) {
      await expect(f.repo.importRecords(`imp-card-parc-x-${installment.number}-${installment.count}`, f.ctx, 'cartao', f.card, [{ ...item('px', 'compra', 100, '2026-10-02', 'X', null), installment }])).rejects.toMatchObject({ code: 'parcelas_invalidas' });
    }
  });

  it('repetição, pulados e chaves iguais no lote; a compra editada para parcelada continua "já anotada"', async () => {
    const f = await fresh();
    const items = [item('h1', 'compra', 15990, '2026-10-04', 'Cinema', 'Lazer'), item('h1', 'compra', 15990, '2026-10-04', 'Cinema', 'Lazer')];
    expect(await f.repo.importRecords('imp-card-0002', f.ctx, 'cartao', f.card, items)).toEqual({ created: 1, skipped: 1 });
    expect(await f.repo.importRecords('imp-card-0002', f.ctx, 'cartao', f.card, items)).toEqual({ created: 1, skipped: 1 });
    expect(await f.repo.importRecords('imp-card-0003', f.ctx, 'cartao', f.card, items.slice(0, 1))).toEqual({ created: 0, skipped: 1 });
    const entry = (await f.repo.listCardEntries(f.card))[0]!;
    await f.repo.updateCardEntry('imp-card-0004', entry.id, entry.version, { kind: 'compra', description: 'Cinema', category: 'Lazer', purchasedOn: '2026-10-04', totalCents: 15990, installments: 3 });
    expect(await f.repo.importRecords('imp-card-0005', f.ctx, 'cartao', f.card, items.slice(0, 1))).toEqual({ created: 0, skipped: 1 });
    const edited = (await f.repo.listCardEntries(f.card))[0]!;
    await f.repo.deleteCardEntry('imp-card-0006', edited.id, edited.version);
    expect(await f.repo.importRecords('imp-card-0007', f.ctx, 'cartao', f.card, items.slice(0, 1))).toEqual({ created: 1, skipped: 0 });
    expect((await f.repo.findImportedKeys(f.ctx, [k('h1')])).length).toBe(1);
  });

  it('fatura paga recusa o lote inteiro; pulado nela passa; cartão arquivado e tipos errados são recusados', async () => {
    const f = await fresh();
    await f.repo.importRecords('imp-card-0010', f.ctx, 'cartao', f.card, [item('i1', 'compra', 28050, '2026-09-20', 'Livro')]);
    const oct = (await f.repo.listInvoiceItems(f.card)).find((i) => i.month === '2026-10')!;
    await f.repo.payInvoice('imp-card-0011', f.card, '2026-10', oct.commitmentVersion!, 28050, '2026-10-07');
    const run = (key: string, items: readonly ImportItem[], card = f.card) => code(f.repo.importRecords(key, f.ctx, 'cartao', card, items));
    expect(await run('imp-card-0012', [item('i2', 'compra', 500, '2026-10-06', 'Pão'), item('i3', 'compra', 700, '2026-09-25', 'Livro usado')])).toEqual(['fatura_paga', 'item=2']);
    expect(await run('imp-card-0013', [item('i4', 'estorno', 700, '2026-09-25', 'Devolução')])).toEqual(['fatura_paga', 'item=1']);
    expect((await f.repo.listCardEntries(f.card)).length).toBe(1);
    expect(await f.repo.importRecords('imp-card-0014', f.ctx, 'cartao', f.card, [item('i1', 'compra', 28050, '2026-09-20', 'Livro'), item('i2', 'compra', 500, '2026-10-06', 'Pão')])).toEqual({
      created: 1,
      skipped: 1,
    });
    expect(await run('imp-card-0015', [item('i5', 'despesa', 500, '2026-10-06', 'x')])).toEqual(['tipo_invalido', 'item=1']);
    const old = await f.repo.createCard('imp-card-0016', f.ctx, { name: 'Cartão Velho', lastDigits: null, closingDay: 28, dueDay: 5, limitCents: null });
    await f.repo.setCardStatus('imp-card-0017', old.card.id, old.card.version, 'arquivado');
    expect(await run('imp-card-0018', [item('i6', 'compra', 500, '2026-10-06', 'Pão')], old.card.id)).toEqual(['cartao_arquivado', undefined]);
  });

  it('validação do cartão: faixa de 48 meses da compra e da fatura do estorno, dia futuro, descrição', async () => {
    const f = await fresh();
    const run = (key: string, it: ImportItem) => code(f.repo.importRecords(key, f.ctx, 'cartao', f.card, [it]));
    expect(await run('imp-val-0001', item('v1', 'compra', 100, '2022-09-30', 'Antiga'))).toEqual(['data_invalida', 'item=1']);
    expect(await run('imp-val-0002', item('v2', 'estorno', 100, '2022-06-15', 'Antigo'))).toEqual(['mes_invalido', 'item=1']);
    expect(await run('imp-val-0003', item('v3', 'compra', 100, '2026-10-08', 'Futura'))).toEqual(['data_futura', 'item=1']);
    expect(await run('imp-val-0004', item('v4', 'estorno', 100, '2026-10-08', 'Futuro'))).toEqual(['data_futura', 'item=1']);
    expect(await run('imp-val-0005', item('v5', 'compra', 100, '2026-10-01', ''))).toEqual(['descricao_obrigatoria', 'item=1']);
    expect(await run('imp-val-0006', item('v6', 'estorno', 0, '2026-10-01', 'x'))).toEqual(['valor_invalido', 'item=1']);
    expect(await run('imp-val-0007', item('v7', 'compra', 100, '2022-10-01', 'No limite'))).toEqual([null, undefined]);
    expect(await run('imp-val-0008', item('v8', 'compra', 100, 'ontem', 'x'))).toEqual(['data_invalida', 'item=1']);
  });

  it('no máximo 5.000 lançamentos vivos por cartão', async () => {
    const f = await fresh();
    for (let b = 0; b < 10; b++) {
      const items = Array.from({ length: 500 }, (_, n) => item(`o${b * 500 + n}`, 'compra', 100 + n, '2026-09-20', `Compra ${b * 500 + n}`));
      expect(await f.repo.importRecords(`imp-lim-${String(b).padStart(4, '0')}`, f.ctx, 'cartao', f.card, items)).toEqual({ created: 500, skipped: 0 });
    }
    expect(await code(f.repo.importRecords('imp-lim-1001', f.ctx, 'cartao', f.card, [item('o-extra', 'compra', 100, '2026-09-20', 'Mais uma')]))).toEqual(['limite_de_lancamentos', 'item=1']);
    expect(await f.repo.importRecords('imp-lim-1002', f.ctx, 'cartao', f.card, [item('o1', 'compra', 101, '2026-09-20', 'Compra 1')])).toEqual({ created: 0, skipped: 1 });
  }, 60_000);
});

describe('importRecords: compra em andamento depois da importação (revisão independente do D-089 B)', () => {
  it('o orçamento conta a parcela no mês certo e corrigir a data mantém a distância das faturas, como o banco', async () => {
    const f = await fresh();
    // Compra original de 15/08 (fatura natural de setembro), parcela 3 de 6: novembro a fevereiro.
    await f.repo.importRecords('imp-sofa-0001', f.ctx, 'cartao', f.card, [{ ...item('s3', 'compra', 4000, '2026-08-15', 'Sofá 03/06', 'Educação'), installment: { number: 3, count: 6 } }]);
    const used = async (m: string) => (await f.repo.getMonthBudget(f.ctx, m)).lines.find((l) => l.category === 'Educação')!.usedCents;
    expect([await used('2026-08'), await used('2026-10'), await used('2027-01'), await used('2027-02')]).toEqual([0, 4000, 4000, 0]);
    let sofa = (await f.repo.listCardEntries(f.card)).find((e) => e.description === 'Sofá 03/06')!;
    expect([sofa.invoiceMonth, sofa.installments, sofa.installmentOffset]).toEqual(['2026-11', 4, 2]);
    // 20/08 está na mesma fatura natural: nada anda (antes, a primeira voltava para setembro).
    await f.repo.updateCardEntry('imp-sofa-u1', sofa.id, sofa.version, {
      kind: 'compra', purchasedOn: '2026-08-20', totalCents: sofa.amountCents, installments: sofa.installments, description: 'Sofá 03/06', category: 'Educação',
    });
    sofa = (await f.repo.listCardEntries(f.card)).find((e) => e.description === 'Sofá 03/06')!;
    expect([sofa.invoiceMonth, sofa.purchasedOn]).toEqual(['2026-11', '2026-08-20']);
    // 02/08 (fatura natural de agosto): a primeira guardada anda uma fatura para trás, para outubro.
    await f.repo.updateCardEntry('imp-sofa-u2', sofa.id, sofa.version, {
      kind: 'compra', purchasedOn: '2026-08-02', totalCents: sofa.amountCents, installments: sofa.installments, description: 'Sofá 03/06', category: 'Educação',
    });
    sofa = (await f.repo.listCardEntries(f.card)).find((e) => e.description === 'Sofá 03/06')!;
    expect(sofa.invoiceMonth).toBe('2026-10');
  });

  it('a fatura aberta é a do cartão: fecha dia 6 e vence dia 1, hoje 07/10, a fatura aberta é a de dezembro', async () => {
    const f = await fresh();
    const verde = (await f.repo.createCard('op-card-verde', f.ctx, { name: 'Verde', lastDigits: null, closingDay: 6, dueDay: 1, limitCents: 500_000 })).card.id;
    await f.repo.importRecords('imp-verde-0001', f.ctx, 'cartao', verde, [{ ...item('v3', 'compra', 1000, '2026-08-10', 'Loja verde 03/05', null), installment: { number: 3, count: 5 } }]);
    const e = (await f.repo.listCardEntries(verde)).find((x) => x.description === 'Loja verde 03/05')!;
    expect([e.invoiceMonth, e.installments, e.installmentOffset]).toEqual(['2026-12', 3, 2]);
  });
});

describe('importRecords: o erro conhecido do app', () => {
  it('RepoError com código e detalhe', async () => {
    const f = await fresh();
    try {
      await f.repo.importRecords('imp-end-0001', f.ctx, 'conta', f.accountId, [item('z1', 'despesa', 0, '2026-10-01', 'x')]);
      expect.unreachable();
    } catch (e) {
      expect(isRepoError(e, 'valor_invalido')).toBe(true);
      expect((e as RepoError).detail).toBe('item=1');
    }
  });
});
