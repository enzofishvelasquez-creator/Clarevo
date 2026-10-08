/// <reference types="node" />
/**
 * Teste de integração: o repositório do app falando com o banco real através de uma API
 * compatível com a do Supabase (PostgREST), com tokens de pessoas diferentes.
 * Executado por `npm run test:api` (ver supabase/tests/run_api.sh). Pessoas FICTÍCIAS.
 */
import { createHmac, randomUUID } from 'node:crypto';

import {
  RepoError,
  newOperationKey,
  summarizeMonth,
  summarizeToPay,
  type Commitment,
  type CommitmentInput,
  type FinancialRecord,
  type IsoMonth,
  type PaymentInput,
  type RecordInput,
} from '@clarevo/core';
import { createClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';

import { SupabaseRepository } from '../src/lib/supabase-repository';

const API = process.env.CLAREVO_API_URL!;
const SECRET = process.env.CLAREVO_JWT_SECRET!;
const ANA = process.env.CLAREVO_ANA!;
const BRUNO = process.env.CLAREVO_BRUNO!;
const EVA = process.env.CLAREVO_EVA!;

function jwt(payload: Record<string, unknown>) {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const body = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ exp: Math.floor(Date.now() / 1000) + 3600, ...payload })}`;
  return `${body}.${createHmac('sha256', SECRET).update(body).digest('base64url')}`;
}

const ANON_KEY = () => jwt({ role: 'anon' });

function clientFor(personId: string | null) {
  const token = personId ? jwt({ role: 'authenticated', sub: personId }) : ANON_KEY();
  return createClient(API, ANON_KEY(), { accessToken: async () => token });
}

const repoFor = (id: string) => new SupabaseRepository(clientFor(id), { id });

const err = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => (e instanceof RepoError ? e.code : String(e)));

describe('API real: espaço pessoal, registros e permissões', () => {
  const ana = repoFor(ANA);
  const bruno = repoFor(BRUNO);
  let ctx = '';
  let account = '';
  const input = (reais: number, occurredOn = '2026-10-07', description = 'Café'): RecordInput => ({
    accountId: account,
    amountCents: Math.round(reais * 100),
    occurredOn,
    description,
    category: null,
  });
  const totals = async () => {
    const s = summarizeMonth(await ana.listRecords(ctx, '2026-10'), ctx, '2026-10');
    return [s.receivedCents / 100, s.paidCents / 100, s.differenceCents / 100];
  };

  beforeAll(async () => {
    expect(await ana.getSpace()).toBeNull();
    const space = await ana.ensurePersonalSpace('Conta principal');
    ctx = space.personalContextId;
    account = space.accounts[0]!.id;
    await bruno.ensurePersonalSpace('Conta do Bruno');
  });

  it('e-mail não confirmado não cria espaço', async () => {
    expect(await err(repoFor(EVA).ensurePersonalSpace('Conta principal'))).toBe('email_nao_confirmado');
  });

  it('primeira conta é criada uma única vez, sem dados de exemplo', async () => {
    const again = await ana.ensurePersonalSpace('Outro nome');
    expect(again.personalContextId).toBe(ctx);
    expect(again.accounts).toHaveLength(1);
    expect(again.accounts[0]!.name).toBe('Conta principal');
    expect(again.accounts[0]!.initialBalanceCents).toBeNull();
    expect(await ana.listRecords(ctx, '2026-10')).toEqual([]);
    expect(await ana.listCommitments(ctx, '2026-10')).toEqual([]);
  });

  it('sequência de aceite pela API', async () => {
    await ana.createRecord(newOperationKey(), ctx, 'receita', input(6000, '2026-10-01', 'Salário'));
    await ana.createRecord(newOperationKey(), ctx, 'despesa', input(2500, '2026-10-05', 'Aluguel'));
    await ana.createRecord(newOperationKey(), ctx, 'despesa', input(1400, '2026-10-06', 'Mercado'));
    expect(await totals()).toEqual([6000, 3900, 2100]);

    const g = await ana.createRecord(newOperationKey(), ctx, 'despesa', input(80));
    expect(await totals()).toEqual([6000, 3980, 2020]);
    const g2 = await ana.updateRecord(newOperationKey(), g.id, g.version, input(95));
    expect([g2.id, g2.version]).toEqual([g.id, g.version + 1]);
    expect(await totals()).toEqual([6000, 3995, 2005]);
    await ana.deleteRecord(newOperationKey(), g.id, g2.version);
    expect(await totals()).toEqual([6000, 3900, 2100]);

    const r = await ana.createRecord(newOperationKey(), ctx, 'receita', input(200, '2026-10-07', 'Freela'));
    expect(await totals()).toEqual([6200, 3900, 2300]);
    const r2 = await ana.updateRecord(newOperationKey(), r.id, r.version, input(250, '2026-10-07', 'Freela'));
    expect(await totals()).toEqual([6250, 3900, 2350]);
    await ana.deleteRecord(newOperationKey(), r.id, r2.version);
    expect(await totals()).toEqual([6000, 3900, 2100]);
    expect(await ana.getRecord(r.id)).toBeNull();
  });

  it('repetir a operação devolve o mesmo registro; mesma chave com outro conteúdo é recusada', async () => {
    const key = newOperationKey();
    const a = await ana.createRecord(key, ctx, 'despesa', input(10));
    const b = await ana.createRecord(key, ctx, 'despesa', input(10));
    expect(b.id).toBe(a.id);
    expect((await ana.findOperation(key))?.recordId).toBe(a.id);
    expect(await err(ana.createRecord(key, ctx, 'despesa', input(11)))).toBe('chave_reutilizada');
    await ana.deleteRecord(newOperationKey(), a.id, a.version);
  });

  it('versão antiga não sobrescreve', async () => {
    const a = await ana.createRecord(newOperationKey(), ctx, 'despesa', input(10));
    const a2 = await ana.updateRecord(newOperationKey(), a.id, a.version, input(12));
    expect(await err(ana.updateRecord(newOperationKey(), a.id, a.version, input(15)))).toBe('versao_desatualizada');
    expect((await ana.getRecord(a.id))!.amountCents).toBe(1200);
    await ana.deleteRecord(newOperationKey(), a.id, a2.version);
  });

  it('validação também no banco', async () => {
    expect(await err(ana.createRecord(newOperationKey(), ctx, 'despesa', input(10, '2026-10-08')))).toBe('data_futura');
    expect(await err(ana.createRecord(newOperationKey(), ctx, 'despesa', input(10, '2026-10-07', 'x'.repeat(81))))).toBe('descricao_longa');
    expect(await err(ana.createRecord(newOperationKey(), ctx, 'despesa', input(10_000_000)))).toBe('valor_acima_do_limite');
    expect(await err(ana.createRecord(newOperationKey(), ctx, 'despesa', { ...input(10), accountId: randomUUID() }))).toBe('conta_invalida');
  });

  it('outra pessoa não lê nem altera por ID, filtro ou operação', async () => {
    const a = await ana.createRecord(newOperationKey(), ctx, 'despesa', input(33, '2026-10-07', 'Privado'));
    const key = newOperationKey();
    await ana.updateRecord(key, a.id, a.version, input(34, '2026-10-07', 'Privado'));
    expect(await bruno.getRecord(a.id)).toBeNull();
    expect(await bruno.listRecords(ctx, '2026-10')).toEqual([]);
    expect(await bruno.findOperation(key)).toBeNull();
    expect(await err(bruno.updateRecord(newOperationKey(), a.id, 2, input(1)))).toBe('nao_encontrado');
    expect(await err(bruno.deleteRecord(newOperationKey(), a.id, 2))).toBe('nao_encontrado');
    expect(await err(bruno.createRecord(newOperationKey(), ctx, 'despesa', input(1)))).toBe('sem_permissao');
    expect(await err(bruno.renameAccount(account, 'Invasão'))).toBe('nao_encontrado');
    expect((await ana.getRecord(a.id))!.amountCents).toBe(3400);
    await ana.deleteRecord(newOperationKey(), a.id, 2);
  });

  it('gravação direta na tabela é recusada; sem sessão nada é visível', async () => {
    const direct = await clientFor(ANA)
      .from('financial_records')
      .insert({ context_id: ctx, account_id: account, kind: 'despesa', amount_cents: 1, currency: 'BRL', occurred_on: '2026-10-07', description: 'x', created_by: ANA });
    expect(direct.error).not.toBeNull();
    const anon = await clientFor(null).from('financial_records').select('id');
    expect(anon.data ?? []).toEqual([]);
    const rpc = await clientFor(null).rpc('ensure_personal_space', { p_account_name: 'x' });
    expect(rpc.error).not.toBeNull();
  });

  it('renomear a própria conta', async () => {
    await ana.renameAccount(account, 'Conta corrente');
    expect((await ana.getSpace())!.accounts[0]!.name).toBe('Conta corrente');
    expect(await err(ana.renameAccount(account, '   '))).toBe('nome_da_conta_invalido');
  });
});

describe('API real: contas a pagar', () => {
  // Mesmo dia de clarevo.today no run_api.sh. Roda depois da sequência de aceite acima (base 6.000 / 3.900 / 2.100).
  const TODAY = '2026-10-07';
  const ana = repoFor(ANA);
  const bruno = repoFor(BRUNO);
  let ctx = '';
  let account = '';
  let internet: Commitment;
  let condominio: Commitment;
  let agua: Commitment;
  let gas: Commitment;
  let payKey = '';
  let gasto: FinancialRecord;

  const bill = (description: string, reais: number, dueOn: string, category: string | null = null): CommitmentInput => ({
    description,
    amountCents: Math.round(reais * 100),
    dueOn,
    category,
  });
  const payment = (reais: number, paidOn = TODAY, accountId = account): PaymentInput => ({
    accountId,
    amountCents: Math.round(reais * 100),
    paidOn,
    category: 'Moradia',
  });
  const totals = async () => {
    const s = summarizeMonth(await ana.listRecords(ctx, '2026-10'), ctx, '2026-10');
    return [s.receivedCents / 100, s.paidCents / 100, s.differenceCents / 100];
  };
  const names = (list: Commitment[]) => list.map((c) => c.description);

  /** "Ainda a pagar" pelo core (summarizeToPay sobre listCommitments) e pelo banco (month_to_pay): precisam bater. */
  const toPay = async (month: IsoMonth, who = ANA, context = ctx) => {
    const repo = who === ANA ? ana : bruno;
    const s = summarizeToPay(await repo.listCommitments(context, month), context, month, TODAY);
    const { data, error } = await clientFor(who).rpc('month_to_pay', { p_context_id: context, p_month: `${month}-01` }).single();
    expect(error).toBeNull();
    const db = data as { due_in_month_cents: number; overdue_before_cents: number; to_pay_cents: number; open_count: number };
    expect([db.to_pay_cents, db.due_in_month_cents, db.overdue_before_cents, db.open_count].map(Number)).toEqual([
      s.toPayCents,
      s.dueInMonthCents,
      s.overdueBeforeCents,
      s.items.length,
    ]);
    return s;
  };

  beforeAll(async () => {
    const space = (await ana.getSpace())!;
    ctx = space.personalContextId;
    account = space.accounts[0]!.id;
    expect(await totals()).toEqual([6000, 3900, 2100]);
  });

  it('1. base: anotar e conferir "Ainda a pagar" no core e no banco', async () => {
    const key = newOperationKey();
    const i = await ana.createCommitment(key, ctx, bill('Internet', 150, '2026-10-15', 'Moradia'));
    expect(i.record).toBeNull();
    expect(i.commitment).toMatchObject({
      contextId: ctx,
      description: 'Internet',
      amountCents: 15000,
      currency: 'BRL',
      dueOn: '2026-10-15',
      category: 'Moradia',
      status: 'aberto',
      payment: null,
      createdBy: ANA,
      version: 1,
    });
    internet = i.commitment;
    // Repetir devolve a mesma conta; a operação é de conta a pagar, não de registro.
    expect((await ana.createCommitment(key, ctx, bill(' Internet ', 150, '2026-10-15', 'Moradia'))).commitment.id).toBe(internet.id);
    expect(await ana.findCommitmentOperation(key)).toEqual({ action: 'criar_compromisso', commitmentId: internet.id, recordId: null });
    expect(await ana.findOperation(key)).toBeNull();
    condominio = (await ana.createCommitment(newOperationKey(), ctx, bill('Condomínio', 500, '2026-10-20', 'Moradia'))).commitment;
    // A leitura pela visão e o retorno da função usam o mesmo conversor e dão o mesmo objeto.
    expect(await ana.getCommitment(internet.id)).toEqual(internet);

    const s = await toPay('2026-10');
    expect(s.toPayCents).toBe(65000);
    expect(names(s.items)).toEqual(['Internet', 'Condomínio']);
    expect(s.nextDue?.id).toBe(internet.id);
    expect(await totals()).toEqual([6000, 3900, 2100]);
  });

  it('2. vencidas: do mês e de meses anteriores', async () => {
    agua = (await ana.createCommitment(newOperationKey(), ctx, bill('Água', 90, '2026-10-05'))).commitment;
    gas = (await ana.createCommitment(newOperationKey(), ctx, bill('Gás', 40, '2026-09-28'))).commitment;
    const out = await toPay('2026-10');
    expect([out.toPayCents, out.overdueBeforeCents, out.overdueCount]).toEqual([78000, 4000, 2]);
    expect(names(out.items)).toEqual(['Gás', 'Água', 'Internet', 'Condomínio']);
    const set = await toPay('2026-09');
    expect(set.toPayCents).toBe(4000);
    expect(names(set.items)).toEqual(['Gás']);
  });

  it('3. pagar cria um gasto e quita a conta', async () => {
    payKey = newOperationKey();
    const paid = await ana.payCommitment(payKey, internet.id, 1, payment(155));
    expect(paid.record).toMatchObject({
      kind: 'despesa',
      commitmentId: internet.id,
      description: 'Internet',
      category: 'Moradia',
      amountCents: 15500,
      occurredOn: TODAY,
      accountId: account,
      version: 1,
    });
    expect(paid.commitment).toMatchObject({ status: 'quitado', version: 2, amountCents: 15000 });
    gasto = paid.record;
    const fresh = await ana.getCommitment(internet.id);
    expect(fresh!.payment).toEqual({ recordId: gasto.id, amountCents: 15500, paidOn: TODAY, accountId: account });
    expect(fresh).toEqual(paid.commitment);
    expect(await totals()).toEqual([6000, 4055, 1945]);
    const s = await toPay('2026-10');
    expect(s.toPayCents).toBe(63000);
    expect(names(s.paidInMonth)).toEqual(['Internet']);
  });

  it('4. repetir o pagamento devolve o mesmo gasto', async () => {
    const again = await ana.payCommitment(payKey, internet.id, 1, payment(155));
    expect(again.record.id).toBe(gasto.id);
    expect(again.commitment.version).toBe(2);
    expect((await ana.listRecords(ctx, '2026-10')).filter((r) => r.commitmentId === internet.id)).toHaveLength(1);
    expect(await totals()).toEqual([6000, 4055, 1945]);
    expect(await ana.findCommitmentOperation(payKey)).toEqual({ action: 'pagar_compromisso', commitmentId: internet.id, recordId: gasto.id });
    expect(await ana.findOperation(payKey)).toBeNull();
    expect(await err(ana.payCommitment(payKey, internet.id, 1, payment(156)))).toBe('chave_reutilizada');
  });

  it('5. segundo pagamento é recusado', async () => {
    expect(await err(ana.payCommitment(newOperationKey(), internet.id, 1, payment(150)))).toBe('versao_desatualizada');
    expect(await err(ana.payCommitment(newOperationKey(), internet.id, 2, payment(150)))).toBe('compromisso_quitado');
    expect(await totals()).toEqual([6000, 4055, 1945]);
  });

  it('6. desfazer exclui o gasto e reabre a conta', async () => {
    const key = newOperationKey();
    const undo = await ana.undoCommitmentPayment(key, internet.id, 2);
    expect(undo.record).toMatchObject({ id: gasto.id, commitmentId: internet.id, version: 2 });
    expect(undo.commitment).toMatchObject({ status: 'aberto', payment: null, version: 3 });
    expect(await totals()).toEqual([6000, 3900, 2100]);
    expect(await ana.getRecord(gasto.id)).toBeNull();
    expect(await ana.getCommitment(internet.id)).toMatchObject({ status: 'aberto', payment: null, version: 3 });
    expect((await toPay('2026-10')).toPayCents).toBe(78000);
    expect((await ana.undoCommitmentPayment(key, internet.id, 2)).commitment.version).toBe(3);
    expect(await ana.findCommitmentOperation(key)).toEqual({ action: 'desfazer_pagamento', commitmentId: internet.id, recordId: gasto.id });
    expect(await err(ana.undoCommitmentPayment(newOperationKey(), internet.id, 3))).toBe('compromisso_aberto');
  });

  it('7. excluir o gasto em Movimentações reabre a conta', async () => {
    const paid = await ana.payCommitment(newOperationKey(), internet.id, 3, payment(150));
    expect(paid.record.id).not.toBe(gasto.id);
    expect(paid.commitment.version).toBe(4);
    expect(await totals()).toEqual([6000, 4050, 1950]);
    expect((await toPay('2026-10')).toPayCents).toBe(63000);
    const key = newOperationKey();
    await ana.deleteRecord(key, paid.record.id, paid.record.version);
    expect(await ana.getCommitment(internet.id)).toMatchObject({ status: 'aberto', payment: null, version: 5 });
    expect(await totals()).toEqual([6000, 3900, 2100]);
    expect((await toPay('2026-10')).toPayCents).toBe(78000);
    expect(await ana.findOperation(key)).toEqual({ recordId: paid.record.id });
    // A exclusão do gasto guarda o vínculo, mas continua sendo operação de registro.
    expect(await ana.findCommitmentOperation(key)).toBeNull();
    // Repetir a exclusão não reabre de novo.
    await ana.deleteRecord(key, paid.record.id, paid.record.version);
    expect((await ana.getCommitment(internet.id))!.version).toBe(5);
  });

  it('8. validação também no banco', async () => {
    expect(await err(ana.createCommitment(newOperationKey(), ctx, bill('Luz', 100, '2028-10-08')))).toBe('vencimento_fora_do_intervalo');
    expect(await err(ana.payCommitment(newOperationKey(), internet.id, 5, payment(150, '2026-10-08')))).toBe('data_futura');
    expect(await err(ana.payCommitment(newOperationKey(), internet.id, 5, payment(150, TODAY, randomUUID())))).toBe('conta_invalida');
    // As recusas não gravam nada.
    expect(await ana.getCommitment(internet.id)).toMatchObject({ status: 'aberto', version: 5 });
    expect(await totals()).toEqual([6000, 3900, 2100]);

    const paid = await ana.payCommitment(newOperationKey(), internet.id, 5, payment(150));
    const v = paid.commitment.version;
    expect(await err(ana.updateCommitment(newOperationKey(), internet.id, v, bill('Internet', 160, '2026-10-15')))).toBe('compromisso_quitado');
    expect(await err(ana.deleteCommitment(newOperationKey(), internet.id, v))).toBe('compromisso_quitado');

    // Versão ausente é recusada como desatualizada (antes passava sem conferir conflito).
    const recordInput: RecordInput = { accountId: account, amountCents: 15800, occurredOn: TODAY, description: 'Internet', category: 'Moradia' };
    expect(await err(ana.updateRecord(newOperationKey(), paid.record.id, null as unknown as number, recordInput))).toBe('versao_desatualizada');
    expect(await err(ana.deleteRecord(newOperationKey(), paid.record.id, null as unknown as number))).toBe('versao_desatualizada');
    expect(await err(ana.updateCommitment(newOperationKey(), condominio.id, null as unknown as number, bill('Condomínio', 1, '2026-10-20')))).toBe(
      'versao_desatualizada',
    );
    expect(await ana.getRecord(paid.record.id)).toMatchObject({ amountCents: 15000, version: 1 });

    // Editar o gasto gerado: o previsto não muda, a versão da conta sobe e o pagamento acompanha.
    const edited = await ana.updateRecord(newOperationKey(), paid.record.id, 1, recordInput);
    expect(edited.commitmentId).toBe(internet.id);
    const after = await ana.getCommitment(internet.id);
    expect(after).toMatchObject({ status: 'quitado', amountCents: 15000, version: v + 1 });
    expect(after!.payment!.amountCents).toBe(15800);
    expect(await err(ana.undoCommitmentPayment(newOperationKey(), internet.id, v))).toBe('versao_desatualizada');
    await ana.undoCommitmentPayment(newOperationKey(), internet.id, v + 1);
    internet = (await ana.getCommitment(internet.id))!;
    expect(internet).toMatchObject({ status: 'aberto', version: v + 2 });
    expect(await totals()).toEqual([6000, 3900, 2100]);
  });

  it('9. outra pessoa não lê, não altera e não consulta o total', async () => {
    const brunoCtx = (await bruno.getSpace())!.personalContextId;
    expect(await bruno.getCommitment(internet.id)).toBeNull();
    expect(await bruno.listCommitments(ctx, '2026-10')).toEqual([]);
    expect(await err(bruno.payCommitment(newOperationKey(), internet.id, internet.version, payment(150)))).toBe('nao_encontrado');
    expect(await err(bruno.deleteCommitment(newOperationKey(), internet.id, internet.version))).toBe('nao_encontrado');
    expect(await err(bruno.updateCommitment(newOperationKey(), internet.id, internet.version, bill('Invasão', 1, TODAY)))).toBe('nao_encontrado');
    expect(await err(bruno.undoCommitmentPayment(newOperationKey(), internet.id, internet.version))).toBe('nao_encontrado');
    expect(await err(bruno.createCommitment(newOperationKey(), ctx, bill('Invasão', 1, TODAY)))).toBe('sem_permissao');
    expect(await bruno.findCommitmentOperation(payKey)).toBeNull();
    const total = await clientFor(BRUNO).rpc('month_to_pay', { p_context_id: ctx, p_month: '2026-10-01' });
    expect(total.error?.message).toBe('sem_permissao');
    // Conta nova nunca recebe dados de exemplo.
    expect(await bruno.listCommitments(brunoCtx, '2026-10')).toEqual([]);
    expect((await toPay('2026-10', BRUNO, brunoCtx)).toPayCents).toBe(0);
    expect(await ana.getCommitment(internet.id)).toEqual(internet);
  });

  it('10. gravação direta é recusada; sem sessão nada é visível', async () => {
    const db = clientFor(ANA);
    const row = { context_id: ctx, description: 'x', amount_cents: 1, currency: 'BRL', due_on: TODAY, created_by: ANA };
    expect((await db.from('commitments').insert(row)).error).not.toBeNull();
    expect((await db.from('commitment_items').insert(row)).error).not.toBeNull();
    expect((await db.from('commitments').update({ amount_cents: 1 }).eq('id', internet.id)).error).not.toBeNull();
    expect((await db.from('commitments').delete().eq('id', internet.id)).error).not.toBeNull();
    expect((await db.from('financial_records').update({ commitment_id: null }).eq('id', gasto.id)).error).not.toBeNull();
    const rpc = await clientFor(null).rpc('pay_commitment', {
      p_idempotency_key: newOperationKey(),
      p_commitment_id: internet.id,
      p_expected_version: internet.version,
      p_account_id: account,
      p_amount_cents: 15000,
      p_paid_on: TODAY,
      p_category: null,
    });
    expect(rpc.error).not.toBeNull();
    const anon = await clientFor(null).from('commitment_items').select('id');
    expect(anon.error !== null || (anon.data ?? []).length === 0).toBe(true);
    expect(await ana.getCommitment(internet.id)).toEqual(internet);
  });

  it('11. limpeza: excluir Água e Gás volta à base', async () => {
    const key = newOperationKey();
    const removed = await ana.deleteCommitment(key, agua.id, agua.version);
    expect(removed).toMatchObject({ record: null, commitment: { id: agua.id, status: 'aberto', version: agua.version + 1 } });
    expect((await ana.deleteCommitment(key, agua.id, agua.version)).commitment.version).toBe(agua.version + 1);
    expect(await ana.getCommitment(agua.id)).toBeNull();
    expect(await err(ana.updateCommitment(newOperationKey(), agua.id, agua.version + 1, bill('Água', 90, '2026-10-05')))).toBe('nao_encontrado');
    await ana.deleteCommitment(newOperationKey(), gas.id, gas.version);

    const s = await toPay('2026-10');
    expect(s.toPayCents).toBe(65000);
    expect(names(s.items)).toEqual(['Internet', 'Condomínio']);
    expect(s.overdueCount).toBe(0);
    expect((await toPay('2026-09')).toPayCents).toBe(0);
    expect(await totals()).toEqual([6000, 3900, 2100]);
  });
});
