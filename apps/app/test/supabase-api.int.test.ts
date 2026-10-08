/// <reference types="node" />
/**
 * Teste de integração: o repositório do app falando com o banco real através de uma API
 * compatível com a do Supabase (PostgREST), com tokens de pessoas diferentes.
 * Executado por `npm run test:api` (ver supabase/tests/run_api.sh). Pessoas FICTÍCIAS.
 */
import { createHmac, randomUUID } from 'node:crypto';

import {
  RepoError,
  affectedByDelete,
  affectedByEditFrom,
  affectedByEnd,
  mergeOccurrences,
  missingMonths,
  monthOf,
  monthRange,
  newOperationKey,
  occurrenceLabel,
  occurrencesToMaterialize,
  seriesInputError,
  seriesPreview,
  summarizeMonth,
  summarizeToPay,
  type AmountMode,
  type Commitment,
  type CommitmentInput,
  type CommitmentSeries,
  type FinancialRecord,
  type IsoDate,
  type IsoMonth,
  type PaymentInput,
  type PlannedOccurrence,
  type RecordInput,
  type SeriesEditInput,
  type SeriesInput,
  type SeriesKind,
} from '@clarevo/core';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
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

/**
 * today: o "hoje" desta pessoa nas requisições (cabeçalho lido só pelo banco de teste do run_api.sh); sem ele, 07/10/2026.
 * fetchImpl: troca a rede, para simular falhas.
 */
function clientFor(personId: string | null, today?: IsoDate, fetchImpl?: typeof fetch) {
  const token = personId ? jwt({ role: 'authenticated', sub: personId }) : ANON_KEY();
  return createClient(API, ANON_KEY(), {
    accessToken: async () => token,
    global: { ...(today ? { headers: { 'x-clarevo-today': today } } : {}), ...(fetchImpl ? { fetch: fetchImpl } : {}) },
  });
}

const repoFor = (id: string, today?: IsoDate) => new SupabaseRepository(clientFor(id, today), { id });

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

  it('12. conta paga em outro mês aparece em "Pagas" do mês do pagamento (paid_on), sem mudar os totais', async () => {
    const seguro = (await ana.createCommitment(newOperationKey(), ctx, bill('Seguro do carro', 300, '2026-11-10', 'Transporte'))).commitment;
    const luz = (await ana.createCommitment(newOperationKey(), ctx, bill('Luz', 120, '2026-09-25'))).commitment;
    expect(names(await ana.listCommitments(ctx, '2026-10'))).toEqual(['Luz', 'Internet', 'Condomínio', 'Seguro do carro']);

    // Seguro vence em novembro e é pago adiantado em outubro; Luz vence em setembro e é paga em outubro.
    await ana.payCommitment(newOperationKey(), seguro.id, seguro.version, payment(300));
    const luzPaid = await ana.payCommitment(newOperationKey(), luz.id, luz.version, payment(120, '2026-10-02'));
    expect(await totals()).toEqual([6000, 4320, 1680]);
    const oct = await ana.listCommitments(ctx, '2026-10');
    expect(oct.map((c) => [c.description, c.status])).toEqual([
      ['Luz', 'quitado'],
      ['Internet', 'aberto'],
      ['Condomínio', 'aberto'],
      ['Seguro do carro', 'quitado'],
    ]);
    const s = await toPay('2026-10');
    expect(names(s.paidInMonth)).toEqual(['Luz', 'Seguro do carro']);
    expect(names(s.items)).toEqual(['Internet', 'Condomínio']);
    expect(s.later).toEqual([]);
    expect(s.toPayCents).toBe(65000);
    // Também no mês do vencimento.
    expect(names((await toPay('2026-11')).paidInMonth)).toEqual(['Seguro do carro']);
    const sep = await toPay('2026-09');
    expect(names(sep.paidInMonth)).toEqual(['Luz']);
    expect(sep.toPayCents).toBe(0);

    // O mês do pagamento segue o gasto vivo: com a data do gasto em setembro, Luz sai de outubro.
    await ana.updateRecord(newOperationKey(), luzPaid.record.id, luzPaid.record.version, {
      accountId: account,
      amountCents: 12000,
      occurredOn: '2026-09-30',
      description: 'Luz',
      category: 'Moradia',
    });
    expect(names(await ana.listCommitments(ctx, '2026-10'))).toEqual(['Internet', 'Condomínio', 'Seguro do carro']);
    expect(names((await toPay('2026-09')).paidInMonth)).toEqual(['Luz']);
    expect(await totals()).toEqual([6000, 4200, 1800]);
    expect(await bruno.listCommitments(ctx, '2026-10')).toEqual([]);

    // Limpeza: desfazer e excluir voltam à base.
    for (const id of [seguro.id, luz.id]) {
      const undone = await ana.undoCommitmentPayment(newOperationKey(), id, (await ana.getCommitment(id))!.version);
      await ana.deleteCommitment(newOperationKey(), id, undone.commitment.version);
    }
    expect(names(await ana.listCommitments(ctx, '2026-10'))).toEqual(['Internet', 'Condomínio']);
    expect((await toPay('2026-10')).toPayCents).toBe(65000);
    expect(await totals()).toEqual([6000, 3900, 2100]);
  });
});

describe('API real: gastos fixos e parcelamentos', () => {
  // Roda depois das contas a pagar: Ana com a base 6.000 / 3.900 / 2.100 e Internet (15/10) e Condomínio (20/10)
  // em aberto, 650,00. Passos da sequência de aceite A do Ciclo A, com os valores somados a essa base.
  const TODAY = '2026-10-07';
  const NOV = '2026-11-02';
  const MAR = '2027-03-15';
  const ana = repoFor(ANA);
  const bruno = repoFor(BRUNO);
  let ctx = '';
  let account = '';
  let escola: CommitmentSeries;
  let carro: CommitmentSeries;
  let luz: CommitmentSeries;
  let luzPayKey = '';

  const cents = (reais: number) => Math.round(reais * 100);
  const monthly = (
    description: string,
    reais: number,
    dueDay: number,
    firstDueMonth: IsoMonth,
    lastMonth: IsoMonth | null,
    category: string | null,
    amountMode: AmountMode = 'fixo',
  ): SeriesInput => ({
    kind: 'mensal',
    nature: 'conta',
    description,
    category,
    amountCents: cents(reais),
    amountMode,
    dueDay,
    firstDueMonth,
    firstNumber: 1,
    installmentTotal: null,
    lastMonth,
  });
  const carroInput: SeriesInput = {
    kind: 'parcelada',
    nature: 'financiamento',
    description: 'Financiamento do carro',
    category: 'Transporte',
    amountCents: 98000,
    amountMode: 'fixo',
    dueDay: 20,
    firstDueMonth: '2026-10',
    firstNumber: 14,
    installmentTotal: 48,
    lastMonth: null,
  };
  const escolaInput = monthly('Escola', 1200, 10, '2026-10', '2026-12', 'Educação');
  const luzInput = monthly('Luz', 210, 12, '2026-10', null, 'Moradia', 'variavel');
  const payment = (reais: number, paidOn = TODAY): PaymentInput => ({ accountId: account, amountCents: cents(reais), paidOn, category: 'Moradia' });
  const totals = async () => {
    const s = summarizeMonth(await ana.listRecords(ctx, '2026-10'), ctx, '2026-10');
    return [s.receivedCents / 100, s.paidCents / 100, s.differenceCents / 100];
  };
  const names = (list: Commitment[]) => list.map((c) => c.description);
  /** O que importa numa conta gerada: número, vencimento, textos, valor e marca de estimado. */
  const planOf = (c: Commitment) => ({
    number: c.series!.number,
    dueOn: c.dueOn,
    description: c.description,
    category: c.category,
    amountCents: c.amountCents,
    amountIsEstimate: c.amountIsEstimate,
  });
  const planned = ({ month: _month, ...p }: PlannedOccurrence) => p;
  const byNumber = (list: Commitment[], n: number) => list.find((c) => c.series!.number === n)!;

  /**
   * "Ainda a pagar" pelo core (summarizeToPay sobre listCommitments) e pelo banco (month_to_pay), no mesmo dia;
   * a parte estimada também é somada direto em commitment_items, com o critério de D-021(5).
   */
  const toPay = async (month: IsoMonth, today: IsoDate = TODAY) => {
    const s = summarizeToPay(await repoFor(ANA, today).listCommitments(ctx, month), ctx, month, today);
    const db = clientFor(ANA, today);
    const { data, error } = await db.rpc('month_to_pay', { p_context_id: ctx, p_month: `${month}-01` }).single();
    expect(error).toBeNull();
    const t = data as { due_in_month_cents: number; overdue_before_cents: number; to_pay_cents: number; open_count: number };
    expect([t.to_pay_cents, t.due_in_month_cents, t.overdue_before_cents, t.open_count].map(Number)).toEqual([
      s.toPayCents,
      s.dueInMonthCents,
      s.overdueBeforeCents,
      s.items.length,
    ]);
    const { start, endExclusive } = monthRange(month);
    let estimated = db
      .from('commitment_items')
      .select('amount_cents')
      .eq('context_id', ctx)
      .eq('status', 'aberto')
      .eq('amount_is_estimate', true)
      .lt('due_on', endExclusive);
    if (monthOf(today) !== month) estimated = estimated.gte('due_on', start);
    const direct = await estimated;
    expect(direct.error).toBeNull();
    expect(s.estimatedCents).toBe(direct.data!.reduce((sum, r) => sum + Number(r.amount_cents), 0));
    return s;
  };

  /**
   * Gerar pela API cria exatamente o que occurrencesToMaterialize calcula para cada série, com a autoria de quem
   * criou a série; gerar de novo não cria nada.
   */
  const syncMatchesCore = async (today: IsoDate) => {
    const repo = repoFor(ANA, today);
    const expected = new Map<string, ReturnType<typeof planned>[]>();
    for (const s of await repo.listSeries(ctx)) {
      expected.set(s.id, occurrencesToMaterialize(s, await repo.listSeriesOccurrences(s.id), today).map(planned));
    }
    const all = [...expected.values()].flat();
    expect(await repo.syncSeriesOccurrences(ctx)).toEqual({
      created: all.length,
      createdOverdue: all.filter((p) => p.dueOn < today).length,
    });
    for (const [id, plan] of expected) {
      const series = (await repo.getSeries(id))!;
      const live = await repo.listSeriesOccurrences(id);
      for (const p of plan) {
        const c = byNumber(live, p.number);
        expect(planOf(c)).toEqual(p);
        expect(c).toMatchObject({ status: 'aberto', payment: null, version: 1, seriesOverride: false, createdBy: series.createdBy });
      }
      expect(occurrencesToMaterialize(series, live, today)).toEqual([]);
    }
    expect(await repo.syncSeriesOccurrences(ctx)).toEqual({ created: 0, createdOverdue: 0 });
    return all;
  };

  beforeAll(async () => {
    const space = (await ana.getSpace())!;
    ctx = space.personalContextId;
    account = space.accounts[0]!.id;
    expect(await totals()).toEqual([6000, 3900, 2100]);
    expect((await toPay('2026-10')).toPayCents).toBe(65000);
  });

  it('1. conta nova sem gastos fixos; gerar não cria nada', async () => {
    const brunoCtx = (await bruno.getSpace())!.personalContextId;
    expect(await bruno.listSeries(brunoCtx)).toEqual([]);
    expect(await bruno.syncSeriesOccurrences(brunoCtx)).toEqual({ created: 0, createdOverdue: 0 });
    expect(await ana.listSeries(ctx)).toEqual([]);
    expect(await ana.syncSeriesOccurrences(ctx)).toEqual({ created: 0, createdOverdue: 0 });
  });

  it('2. criar: o banco gera as contas da prévia do core; visão e retorno da função dão o mesmo objeto', async () => {
    const created: CommitmentSeries[] = [];
    for (const input of [escolaInput, carroInput, luzInput]) {
      const preview = seriesPreview(input, TODAY);
      const key = newOperationKey();
      const w = await ana.createSeries(key, ctx, input);
      expect(w.occurrences.map(planOf)).toEqual(preview.createdNow.map(planned));
      expect(w.changed).toBe(preview.createdNow.length);
      expect(w.series).toMatchObject({
        contextId: ctx,
        kind: input.kind,
        nature: input.nature,
        firstDueMonth: input.firstDueMonth,
        firstNumber: input.firstNumber,
        lastNumber: preview.lastNumber,
        installmentTotal: input.installmentTotal,
        currency: 'BRL',
        terms: [
          {
            fromNumber: input.firstNumber,
            description: input.description,
            category: input.category,
            amountCents: input.amountCents,
            amountMode: input.amountMode,
            dueDay: input.dueDay,
          },
        ],
        skippedNumbers: [],
        paidCount: 0,
        openCount: preview.createdNow.length,
        generating: true,
        createdBy: ANA,
        version: 1,
      });
      expect(await ana.getSeries(w.series.id)).toEqual(w.series);
      expect(await ana.listSeriesOccurrences(w.series.id)).toEqual([...w.occurrences].reverse());
      for (const c of w.occurrences) {
        expect(await ana.getCommitment(c.id)).toEqual(c);
        expect(c).toMatchObject({
          contextId: ctx,
          status: 'aberto',
          payment: null,
          series: { id: w.series.id, kind: input.kind, nature: input.nature, installmentTotal: input.installmentTotal },
          seriesOverride: false,
          amountIsEstimate: input.amountMode === 'variavel',
          createdBy: ANA,
          version: 1,
        });
      }
      expect(await ana.findSeriesOperation(key)).toEqual({ action: 'criar_serie', seriesId: w.series.id });
      created.push(w.series);
    }
    [escola, carro, luz] = created as [CommitmentSeries, CommitmentSeries, CommitmentSeries];
    expect(await ana.listSeries(ctx)).toEqual(created);

    // Sequência A, passos 1 a 4: Escola 10/10 e 10/11; parcelas 14 (20/10) e 15 (20/11), a 48 em 20/08/2029;
    // Luz 12/10 e 12/11, estimadas.
    expect(escola.lastNumber).toBe(3);
    expect(carro.lastNumber).toBe(48);
    expect(seriesPreview(carroInput, TODAY).lastDueOn).toBe('2029-08-20');
    const out = await toPay('2026-10');
    expect(out.toPayCents).toBe(65000 + 120000 + 98000 + 21000);
    expect(out.estimatedCents).toBe(21000);
    expect(names(out.items)).toEqual(['Escola', 'Luz', 'Internet', 'Condomínio', 'Financiamento do carro']);
    expect(out.later.map((c) => [c.description, c.dueOn, occurrenceLabel(c)])).toEqual([
      ['Escola', '2026-11-10', 'Todo mês'],
      ['Luz', '2026-11-12', 'Todo mês'],
      ['Financiamento do carro', '2026-11-20', 'Parcela 15 de 48'],
    ]);
    const nov = await toPay('2026-11');
    expect([nov.toPayCents, nov.estimatedCents]).toEqual([239000, 21000]);
    expect(await totals()).toEqual([6000, 3900, 2100]);

    // Gerar de novo não cria nada (passo 2).
    expect(await syncMatchesCore(TODAY)).toEqual([]);
  });

  it('3. validação também no banco, com o mesmo código e a mesma ordem do core', async () => {
    const invalid: SeriesInput[] = [
      { ...escolaInput, kind: 'anual' as SeriesKind },
      { ...carroInput, nature: 'conta' },
      { ...escolaInput, nature: 'financiamento' },
      { ...escolaInput, amountCents: 0 },
      { ...escolaInput, amountCents: 1_000_000_000 },
      { ...escolaInput, description: '' },
      { ...escolaInput, description: 'x'.repeat(81) },
      { ...escolaInput, amountMode: 'anual' as AmountMode },
      { ...escolaInput, dueDay: 0 },
      { ...escolaInput, dueDay: 32 },
      { ...escolaInput, firstDueMonth: '2026-08' },
      { ...escolaInput, firstDueMonth: '2027-11' },
      { ...carroInput, installmentTotal: 1 },
      { ...carroInput, installmentTotal: 481 },
      { ...escolaInput, installmentTotal: 12 },
      { ...carroInput, firstNumber: 49 },
      { ...carroInput, firstNumber: 0 },
      { ...escolaInput, firstNumber: 2 },
      { ...escolaInput, lastMonth: '2026-09' },
      { ...escolaInput, lastMonth: '2076-10' },
      { ...carroInput, lastMonth: '2029-08' },
    ];
    const codes: (string | null)[] = [];
    for (const input of invalid) {
      const code = seriesInputError(input, TODAY);
      expect(code).not.toBeNull();
      expect(await err(ana.createSeries(newOperationKey(), ctx, input))).toBe(code);
      codes.push(code);
    }
    expect(new Set(codes)).toEqual(
      new Set([
        'tipo_invalido',
        'natureza_invalida',
        'valor_invalido',
        'valor_acima_do_limite',
        'descricao_obrigatoria',
        'descricao_longa',
        'modo_de_valor_invalido',
        'dia_invalido',
        'inicio_fora_do_intervalo',
        'parcelas_invalidas',
        'parcela_inicial_invalida',
        'fim_invalido',
      ]),
    );
    // Limites aceitos: primeiro mês de setembro de 2026 a outubro de 2027.
    expect(seriesInputError({ ...escolaInput, firstDueMonth: '2026-09' }, TODAY)).toBeNull();
    expect(seriesInputError({ ...escolaInput, firstDueMonth: '2027-10', lastMonth: null }, TODAY)).toBeNull();
    // As recusas não gravam nada.
    expect((await ana.listSeries(ctx)).map((s) => s.id)).toEqual([escola.id, carro.id, luz.id]);

    // "Esta e as próximas" fora do período da série.
    const edit: SeriesEditInput = { ...escola.terms[0]!, nature: 'conta' };
    for (const from of [0, 4]) {
      expect(await err(ana.updateSeriesFrom(newOperationKey(), escola.id, escola.version, from, [], edit))).toBe('numero_fora_da_serie');
    }
    expect(await err(ana.updateSeriesFrom(newOperationKey(), escola.id, escola.version, 1, [], { ...edit, nature: 'financiamento' }))).toBe(
      'natureza_invalida',
    );
    expect(await err(ana.endSeries(newOperationKey(), carro.id, carro.version, null, []))).toBe('fim_invalido');
    expect(await err(ana.endSeries(newOperationKey(), carro.id, carro.version, 49, []))).toBe('fim_invalido');
    expect(await ana.getSeries(escola.id)).toEqual(escola);
  });

  it('4. pagar uma conta da série cria um único gasto; repetir não duplica', async () => {
    const luzOut = byNumber(await ana.listSeriesOccurrences(luz.id), 1);
    luzPayKey = newOperationKey();
    const paid = await ana.payCommitment(luzPayKey, luzOut.id, luzOut.version, payment(232.4));
    expect(paid.record).toMatchObject({ kind: 'despesa', commitmentId: luzOut.id, description: 'Luz', amountCents: 23240, occurredOn: TODAY });
    // O previsto e a marca de estimado da conta paga não mudam; o gasto tem o valor real.
    expect(paid.commitment).toMatchObject({ status: 'quitado', amountCents: 21000, amountIsEstimate: true, version: 2 });
    expect(await ana.getCommitment(luzOut.id)).toEqual(paid.commitment);
    const again = await ana.payCommitment(luzPayKey, luzOut.id, luzOut.version, payment(232.4));
    expect(again.record.id).toBe(paid.record.id);
    expect((await ana.listRecords(ctx, '2026-10')).filter((r) => r.commitmentId === luzOut.id)).toHaveLength(1);
    expect(await ana.findSeriesOperation(luzPayKey)).toBeNull();
    expect(await totals()).toEqual([6000, 4132.4, 1867.6]);
    expect(await ana.getSeries(luz.id)).toMatchObject({ paidCount: 1, openCount: 1, version: 1 });

    const out = await toPay('2026-10');
    expect([out.toPayCents, out.estimatedCents]).toEqual([65000 + 120000 + 98000, 0]);
    expect(names(out.paidInMonth)).toEqual(['Luz']);
    // Luz de novembro continua 210,00 estimada (passo 5).
    const nov = await toPay('2026-11');
    expect([nov.toPayCents, nov.estimatedCents]).toEqual([239000, 21000]);

    // "Esta e as próximas" a partir da conta paga é recusada.
    const occ = await ana.listSeriesOccurrences(luz.id);
    expect(affectedByEditFrom(occ, luz, 1)).toEqual({ ok: false, code: 'inicio_em_conta_paga' });
    const edit: SeriesEditInput = { ...luz.terms[0]!, nature: 'conta', amountCents: 25000 };
    const affected = occ.filter((c) => c.status === 'aberto').map((c) => ({ id: c.id, version: c.version }));
    expect(await err(ana.updateSeriesFrom(newOperationKey(), luz.id, luz.version, 1, affected, edit))).toBe('inicio_em_conta_paga');
  });

  it('5. "Informar o valor da conta": sem a marca a estimativa continua; com false ela sai, mesmo com o valor igual', async () => {
    const luzNov = byNumber(await ana.listSeriesOccurrences(luz.id), 2);
    const bill: CommitmentInput = { description: 'Luz', amountCents: 21000, dueOn: '2026-11-12', category: 'Moradia' };
    const kept = await ana.updateCommitment(newOperationKey(), luzNov.id, luzNov.version, bill);
    expect(kept.commitment).toMatchObject({ amountIsEstimate: true, seriesOverride: true, version: 2 });
    const key = newOperationKey();
    const informed = await ana.updateCommitment(key, luzNov.id, 2, { ...bill, amountIsEstimate: false });
    expect(informed.commitment).toMatchObject({ amountCents: 21000, amountIsEstimate: false, seriesOverride: true, version: 3 });
    expect(await ana.getCommitment(luzNov.id)).toEqual(informed.commitment);
    // Repetir devolve o mesmo estado; sem a marca é outro pedido, que não cabe na mesma chave.
    expect((await ana.updateCommitment(key, luzNov.id, 2, { ...bill, amountIsEstimate: false })).commitment.version).toBe(3);
    expect(await err(ana.updateCommitment(key, luzNov.id, 2, bill))).toBe('chave_reutilizada');
    expect(await ana.findCommitmentOperation(key)).toEqual({ action: 'editar_compromisso', commitmentId: luzNov.id, recordId: null });
    // A edição de uma conta da série continua sendo operação de conta a pagar, não de série.
    expect(await ana.findSeriesOperation(key)).toBeNull();
    // A estimativa só nasce da vigência da série.
    const raw = await clientFor(ANA).rpc('update_commitment', {
      p_idempotency_key: newOperationKey(),
      p_commitment_id: luzNov.id,
      p_expected_version: 3,
      p_amount_cents: 21000,
      p_due_on: '2026-11-12',
      p_description: 'Luz',
      p_category: 'Moradia',
      p_amount_is_estimate: true,
    });
    expect(raw.error?.message).toBe('estimativa_invalida');
    const nov = await toPay('2026-11');
    expect([nov.toPayCents, nov.estimatedCents]).toEqual([239000, 0]);

    // "Só esta conta" com vencimento em outro mês é recusada (passo 10).
    const escolaOut = byNumber(await ana.listSeriesOccurrences(escola.id), 1);
    const moved: CommitmentInput = { description: 'Escola', amountCents: 120000, dueOn: '2026-11-05', category: 'Educação' };
    expect(await err(ana.updateCommitment(newOperationKey(), escolaOut.id, escolaOut.version, moved))).toBe('vencimento_fora_do_mes');
    expect(await ana.getCommitment(escolaOut.id)).toEqual(escolaOut);
  });

  it('6. excluir só esta: o número fica pulado e a geração não o recria', async () => {
    const escolaNov = byNumber(await ana.listSeriesOccurrences(escola.id), 2);
    const removed = await ana.deleteCommitment(newOperationKey(), escolaNov.id, escolaNov.version);
    expect(removed.commitment).toMatchObject({ id: escolaNov.id, version: 2 });
    expect(await ana.getCommitment(escolaNov.id)).toBeNull();
    escola = (await ana.getSeries(escola.id))!;
    expect(escola).toMatchObject({ skippedNumbers: [2], openCount: 1, version: 1 });
    expect(await syncMatchesCore(TODAY)).toEqual([]);
    expect((await ana.listSeriesOccurrences(escola.id)).map((c) => c.series!.number)).toEqual([1]);
    expect((await toPay('2026-11')).toPayCents).toBe(119000);
  });

  it('7. "esta e as próximas": conjunto afetado conferido; conta escolhida muda e a anterior não', async () => {
    const occ = await ana.listSeriesOccurrences(carro.id);
    const plan = affectedByEditFrom(occ, carro, 15);
    if (!plan.ok) throw new Error(plan.code);
    const parcela15 = byNumber(occ, 15);
    expect(plan.affected).toEqual([{ id: parcela15.id, version: 1 }]);
    const edit: SeriesEditInput = { ...carro.terms[0]!, nature: 'financiamento', amountCents: 101000 };
    const stale = async (expectedVersion: number, affected: unknown) =>
      err(ana.updateSeriesFrom(newOperationKey(), carro.id, expectedVersion, 15, affected as { id: string; version: number }[], edit));
    expect(await stale(carro.version, [{ id: parcela15.id, version: 2 }])).toBe('versao_desatualizada');
    expect(await stale(carro.version, [])).toBe('versao_desatualizada');
    expect(await stale(carro.version, [...plan.affected, { id: byNumber(occ, 14).id, version: 1 }])).toBe('versao_desatualizada');
    expect(await stale(carro.version + 1, plan.affected)).toBe('versao_desatualizada');
    expect(await stale(null as unknown as number, plan.affected)).toBe('versao_desatualizada');

    const key = newOperationKey();
    const w = await ana.updateSeriesFrom(key, carro.id, carro.version, 15, plan.affected, edit);
    expect(w.changed).toBe(1);
    expect(w.series).toMatchObject({
      version: 2,
      terms: [
        { fromNumber: 14, amountCents: 98000 },
        { fromNumber: 15, amountCents: 101000, description: 'Financiamento do carro', dueDay: 20 },
      ],
    });
    expect(byNumber(w.occurrences, 14)).toEqual(byNumber(occ, 14));
    expect(byNumber(w.occurrences, 15)).toMatchObject({ amountCents: 101000, version: 2, seriesOverride: false, dueOn: '2026-11-20' });
    expect(await ana.getSeries(carro.id)).toEqual(w.series);
    expect(await ana.findSeriesOperation(key)).toEqual({ action: 'alterar_serie', seriesId: carro.id });
    // Repetir devolve o estado atual, sem mudar nada.
    const again = await ana.updateSeriesFrom(key, carro.id, carro.version, 15, plan.affected, edit);
    expect(again).toEqual({ ...w, changed: 0 });
    carro = w.series;
    expect((await toPay('2026-11')).toPayCents).toBe(122000);
    expect((await toPay('2026-10')).toPayCents).toBe(65000 + 120000 + 98000);
  });

  it('8. reconciliação por findSeriesOperation depois de falha de rede; excluir o gasto fixo', async () => {
    // A criação chega ao banco, mas a resposta se perde: o app não sabe nem o id da série.
    const lost: typeof fetch = async (input, init) => {
      const res = await fetch(input, init);
      await res.arrayBuffer();
      throw new TypeError('Failed to fetch');
    };
    const flaky = new SupabaseRepository(clientFor(ANA, undefined, lost), { id: ANA });
    // Dia 31 desde setembro: 30/09 (vencida), 31/10 e 30/11.
    const input = monthly('Academia', 99.9, 31, '2026-09', null, 'Lazer');
    const key = newOperationKey();
    expect(await err(flaky.createSeries(key, ctx, input))).toBe('rede');
    const op = await ana.findSeriesOperation(key);
    expect(op?.action).toBe('criar_serie');
    expect(await ana.findOperation(key)).toBeNull();
    expect(await ana.findCommitmentOperation(key)).toBeNull();
    expect(await bruno.findSeriesOperation(key)).toBeNull();
    const academia = (await ana.getSeries(op!.seriesId))!;
    expect(academia).toMatchObject({ terms: [{ description: 'Academia', amountCents: 9990, dueDay: 31 }], openCount: 3 });
    const occ = await ana.listSeriesOccurrences(academia.id);
    expect([...occ].reverse().map(planOf)).toEqual(seriesPreview(input, TODAY).createdNow.map(planned));
    expect(occ.map((c) => c.dueOn)).toEqual(['2026-11-30', '2026-10-31', '2026-09-30']);
    // Tentar de novo com a mesma chave devolve a mesma série, sem criar outra.
    const again = await ana.createSeries(key, ctx, input);
    expect([again.series.id, again.changed]).toEqual([academia.id, 0]);
    expect(again.series).toEqual(academia);
    expect(await err(ana.endSeries(key, academia.id, academia.version, 0, []))).toBe('chave_reutilizada');
    const out = await toPay('2026-10');
    expect([out.toPayCents, out.overdueBeforeCents, out.overdueCount]).toEqual([65000 + 120000 + 98000 + 9990 + 9990, 9990, 1]);

    // Excluir: com conta paga é recusado (use Encerrar); sem paga, saem a série e as contas em aberto.
    expect(affectedByDelete(await ana.listSeriesOccurrences(luz.id), luz)).toEqual({ ok: false, code: 'serie_tem_pagamentos' });
    const luzOpen = (await ana.listSeriesOccurrences(luz.id)).filter((c) => c.status === 'aberto').map((c) => ({ id: c.id, version: c.version }));
    expect(await err(ana.deleteSeries(newOperationKey(), luz.id, luz.version, luzOpen))).toBe('serie_tem_pagamentos');
    const plan = affectedByDelete(occ, academia);
    if (!plan.ok) throw new Error(plan.code);
    expect(await err(ana.deleteSeries(newOperationKey(), academia.id, academia.version, plan.affected.slice(1)))).toBe('versao_desatualizada');
    const delKey = newOperationKey();
    const del = await ana.deleteSeries(delKey, academia.id, academia.version, plan.affected);
    expect(del).toMatchObject({ series: { id: academia.id, version: 2 }, occurrences: [], changed: 3 });
    expect((await ana.deleteSeries(delKey, academia.id, academia.version, plan.affected)).changed).toBe(0);
    expect(await ana.findSeriesOperation(delKey)).toEqual({ action: 'excluir_serie', seriesId: academia.id });
    expect(await ana.getSeries(academia.id)).toBeNull();
    expect(await ana.listSeriesOccurrences(academia.id)).toEqual([]);
    for (const c of occ) expect(await ana.getCommitment(c.id)).toBeNull();
    expect(await ana.syncSeriesOccurrences(ctx)).toEqual({ created: 0, createdOverdue: 0 });
    expect((await ana.listSeries(ctx)).map((s) => s.id)).toEqual([escola.id, carro.id, luz.id]);
    expect((await toPay('2026-10')).toPayCents).toBe(65000 + 120000 + 98000);
  });

  it('9. outra pessoa não lê, não altera e não gera', async () => {
    const occ = await ana.listSeriesOccurrences(carro.id);
    const open = occ.filter((c) => c.status === 'aberto').map((c) => ({ id: c.id, version: c.version }));
    const edit: SeriesEditInput = { ...carro.terms[1]!, nature: 'financiamento', description: 'Invasão' };
    expect(await bruno.getSeries(carro.id)).toBeNull();
    expect(await bruno.listSeries(ctx)).toEqual([]);
    expect(await bruno.listSeriesOccurrences(carro.id)).toEqual([]);
    expect(await err(bruno.updateSeriesFrom(newOperationKey(), carro.id, carro.version, 15, open.slice(1), edit))).toBe('nao_encontrado');
    expect(await err(bruno.endSeries(newOperationKey(), carro.id, carro.version, 20, []))).toBe('nao_encontrado');
    expect(await err(bruno.deleteSeries(newOperationKey(), carro.id, carro.version, open))).toBe('nao_encontrado');
    expect(await err(bruno.createSeries(newOperationKey(), ctx, escolaInput))).toBe('sem_permissao');
    expect(await err(bruno.syncSeriesOccurrences(ctx))).toBe('sem_permissao');
    const brunoDb = clientFor(BRUNO);
    for (const table of ['commitment_series', 'series_terms', 'series_items']) {
      const { data, error } = await brunoDb.from(table).select('id');
      expect(error).toBeNull();
      expect(data).toEqual([]);
    }
    // Gravação direta é recusada; sem sessão nada é visível.
    const db = clientFor(ANA);
    expect((await db.from('commitment_series').update({ last_number: 20 }).eq('id', carro.id)).error).not.toBeNull();
    expect((await db.from('series_terms').delete().eq('series_id', carro.id)).error).not.toBeNull();
    expect((await db.from('commitments').update({ series_override: true }).eq('id', occ[0]!.id)).error).not.toBeNull();
    const anon = await clientFor(null).from('series_items').select('id');
    expect(anon.error !== null || (anon.data ?? []).length === 0).toBe(true);
    expect((await clientFor(null).rpc('sync_series_occurrences', { p_context_id: ctx })).error).not.toBeNull();
    expect(await ana.getSeries(carro.id)).toEqual(carro);
    expect(await ana.listSeriesOccurrences(carro.id)).toEqual(occ);
  });

  it('10. em 02/11/2026: gerar cria dezembro como o core; encerrar e retomar', async () => {
    const created = await syncMatchesCore(NOV);
    // Passo 11: Escola 10/12 (a última), parcela 16 em 20/12 pela vigência nova e Luz 12/12 estimada. Novembro da Escola não volta.
    expect(created.map((p) => [p.description, p.number, p.dueOn, p.amountCents, p.amountIsEstimate])).toEqual([
      ['Escola', 3, '2026-12-10', 120000, false],
      ['Financiamento do carro', 16, '2026-12-20', 101000, false],
      ['Luz', 3, '2026-12-12', 21000, true],
    ]);
    const dec = await toPay('2026-12', NOV);
    expect([dec.toPayCents, dec.estimatedCents]).toEqual([242000, 21000]);
    await toPay('2026-11', NOV);

    const anaNov = repoFor(ANA, NOV);
    luz = (await anaNov.getSeries(luz.id))!;
    let occ = await anaNov.listSeriesOccurrences(luz.id);
    // Passo 12: "nenhuma conta" é recusado, porque outubro está paga.
    expect(affectedByEnd(occ, luz, 0)).toEqual({ ok: false, code: 'serie_tem_pagamento_posterior' });
    expect(await err(anaNov.endSeries(newOperationKey(), luz.id, luz.version, 0, []))).toBe('serie_tem_pagamento_posterior');
    // Passo 13: última conta em outubro; novembro (alterada só no mês) e dezembro saem.
    const end = affectedByEnd(occ, luz, 1);
    if (!end.ok) throw new Error(end.code);
    expect(end.removed.map((c) => c.series!.number)).toEqual([2, 3]);
    const endKey = newOperationKey();
    // As próprias contas servem de conjunto afetado: o repositório manda só {id, version} (o banco recusaria campos a mais).
    const ended = await anaNov.endSeries(endKey, luz.id, luz.version, 1, end.removed);
    expect(ended.changed).toBe(2);
    expect(ended.series).toMatchObject({ lastNumber: 1, version: 2, openCount: 0, paidCount: 1 });
    expect(ended.occurrences.map((c) => [c.series!.number, c.status])).toEqual([[1, 'quitado']]);
    expect((await anaNov.endSeries(endKey, luz.id, luz.version, 1, end.affected)).changed).toBe(0);
    expect(await anaNov.findSeriesOperation(endKey)).toEqual({ action: 'encerrar_serie', seriesId: luz.id });
    expect(await anaNov.syncSeriesOccurrences(ctx)).toEqual({ created: 0, createdOverdue: 0 });

    // Passo 14: retomar sem data para terminar recria novembro e dezembro com a vigência atual, estimadas,
    // sem a marca "alterada só neste mês".
    occ = await anaNov.listSeriesOccurrences(luz.id);
    const expected = occurrencesToMaterialize({ ...ended.series, lastNumber: null }, occ, NOV).map(planned);
    const resume = affectedByEnd(occ, ended.series, null);
    if (!resume.ok) throw new Error(resume.code);
    const resumed = await anaNov.endSeries(newOperationKey(), luz.id, ended.series.version, null, resume.affected);
    expect(resumed.changed).toBe(0);
    expect(resumed.series).toMatchObject({ lastNumber: null, version: 3, openCount: 2 });
    const recreated = resumed.occurrences.filter((c) => c.series!.number > 1);
    expect(recreated.map(planOf)).toEqual(expected);
    expect(expected.map((p) => [p.number, p.dueOn, p.amountCents, p.amountIsEstimate])).toEqual([
      [2, '2026-11-12', 21000, true],
      [3, '2026-12-12', 21000, true],
    ]);
    for (const c of recreated) expect(c).toMatchObject({ seriesOverride: false, version: 1, createdBy: ANA });
    luz = resumed.series;
    expect(await syncMatchesCore(NOV)).toEqual([]);
    await toPay('2026-11', NOV);
  });

  it('11. em 15/03/2027 (ausência longa): só do mês anterior ao seguinte; janeiro fica sem conta registrada', async () => {
    const created = await syncMatchesCore(MAR);
    expect(created.map((p) => [p.description, p.number, p.dueOn])).toEqual([
      ['Financiamento do carro', 18, '2027-02-20'],
      ['Financiamento do carro', 19, '2027-03-20'],
      ['Financiamento do carro', 20, '2027-04-20'],
      ['Luz', 5, '2027-02-12'],
      ['Luz', 6, '2027-03-12'],
      ['Luz', 7, '2027-04-12'],
    ]);
    expect(created.filter((p) => p.dueOn < MAR)).toHaveLength(3);
    const anaMar = repoFor(ANA, MAR);
    for (const [s, n] of [[carro, 17], [luz, 4]] as const) {
      const series = (await anaMar.getSeries(s.id))!;
      expect(missingMonths(series, await anaMar.listSeriesOccurrences(s.id), MAR)).toEqual([{ number: n, month: '2027-01' }]);
    }
    const mar = await toPay('2027-03', MAR);
    expect(mar.overdueCount).toBeGreaterThan(0);
    expect(mar.estimatedCents).toBe(4 * 21000);
    await toPay('2027-04', MAR);
  });

  it('12. listOpenSeriesOccurrences: todas as em aberto, por número crescente, com o mesmo conversor da visão', async () => {
    const anaMar = repoFor(ANA, MAR);
    // Escola: 2 excluída só esta. Carro: 17 sem conta registrada. Luz: 1 paga, 4 sem conta registrada.
    const cases: [CommitmentSeries, number[]][] = [
      [escola, [1, 3]],
      [carro, [14, 15, 16, 18, 19, 20]],
      [luz, [2, 3, 5, 6, 7]],
    ];
    for (const [s, numbers] of cases) {
      const capped = await anaMar.listSeriesOccurrences(s.id);
      const open = await anaMar.listOpenSeriesOccurrences(s.id);
      expect(open.map((c) => c.series!.number)).toEqual(numbers);
      expect(open).toEqual(capped.filter((c) => c.status === 'aberto').reverse());
      for (const c of open) expect(await anaMar.getCommitment(c.id)).toEqual(c);
      expect((await anaMar.getSeries(s.id))!.openCount).toBe(open.length);
      expect(mergeOccurrences(capped, open)).toEqual(capped);
    }
    expect(await bruno.listOpenSeriesOccurrences(carro.id)).toEqual([]);
    expect(await anaMar.listOpenSeriesOccurrences(randomUUID())).toEqual([]);
  });
});

describe('conversor de contas a pagar e gastos fixos', () => {
  // Defesa de último nível, sem rede: o banco garante o vínculo (I1), mas o app nunca mostra "paga" sem o gasto.
  const row = {
    id: 'c1',
    context_id: 'ctx',
    description: 'Internet',
    amount_cents: 15000,
    currency: 'BRL',
    due_on: '2026-10-15',
    status: 'aberto',
    category: null,
    created_by: 'p1',
    version: 1,
    created_at: '2026-10-07T12:00:00Z',
    updated_at: '2026-10-07T12:00:00Z',
    paid_record_id: null,
    paid_on: null,
    paid_amount_cents: null,
    paid_account_id: null,
  };
  const paidCols = { paid_record_id: 'r1', paid_on: '2026-10-07', paid_amount_cents: 15500, paid_account_id: 'a1' };
  /** Cliente falso que devolve a mesma linha pela visão (getCommitment) e pela função (createCommitment). */
  const repoWith = (r: object) => {
    const db = {
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: r, error: null }) }) }) }),
      rpc: async () => ({ data: { commitment: r, record: null }, error: null }),
    };
    return new SupabaseRepository(db as unknown as SupabaseClient, { id: 'p1' });
  };
  const failure = (p: Promise<unknown>) =>
    p.then(() => null, (e: unknown) => (e instanceof RepoError ? [e.code, e.message] : String(e)));
  const create = (r: object) => repoWith(r).createCommitment('chave-0001', 'ctx', { description: 'Internet', amountCents: 15000, dueOn: '2026-10-15', category: null });

  it('aberta sem gasto e paga com gasto', async () => {
    expect((await repoWith(row).getCommitment('c1'))!.payment).toBeNull();
    const paid = { ...row, status: 'quitado', ...paidCols };
    const expected = { recordId: 'r1', amountCents: 15500, paidOn: '2026-10-07', accountId: 'a1' };
    expect((await repoWith(paid).getCommitment('c1'))!.payment).toEqual(expected);
    expect((await create(paid)).commitment.payment).toEqual(expected);
    // Pagar e desfazer sem o gasto no retorno também são recusados.
    expect(await failure(repoWith(paid).undoCommitmentPayment('chave-0002', 'c1', 1))).toEqual(['desconhecido', 'desconhecido']);
  });

  it('paga sem gasto, aberta com gasto e status desconhecido são recusados', async () => {
    for (const bad of [{ ...row, status: 'quitado' }, { ...row, ...paidCols }, { ...row, status: 'cancelado' }]) {
      expect(await failure(repoWith(bad).getCommitment('c1'))).toEqual(['desconhecido', 'vinculo_inconsistente']);
      expect(await failure(create(bad))).toEqual(['desconhecido', 'vinculo_inconsistente']);
    }
  });

  const avulsa = {
    ...row,
    series_id: null,
    occurrence_number: null,
    series_override: false,
    amount_is_estimate: false,
    series_kind: null,
    series_nature: null,
    series_installment_total: null,
  };
  const occurrence = {
    ...avulsa,
    series_id: 's1',
    occurrence_number: 13,
    series_override: true,
    amount_is_estimate: true,
    series_kind: 'parcelada',
    series_nature: 'financiamento',
    series_installment_total: 48,
  };

  it('ocorrência de série com número, tipo e marcas; conta avulsa sem nenhuma marca de série', async () => {
    expect(await repoWith(occurrence).getCommitment('c1')).toMatchObject({
      series: { id: 's1', number: 13, kind: 'parcelada', nature: 'financiamento', installmentTotal: 48 },
      seriesOverride: true,
      amountIsEstimate: true,
    });
    expect(await repoWith(avulsa).getCommitment('c1')).toMatchObject({ series: null, seriesOverride: false, amountIsEstimate: false });
    expect((await create(occurrence)).commitment.series?.number).toBe(13);
    const bad = [
      { ...occurrence, series_kind: null },
      { ...occurrence, series_nature: null },
      { ...occurrence, occurrence_number: null },
      { ...avulsa, occurrence_number: 2 },
      { ...avulsa, series_override: true },
      { ...avulsa, amount_is_estimate: true },
    ];
    for (const r of bad) expect(await failure(repoWith(r).getCommitment('c1'))).toEqual(['desconhecido', 'serie_inconsistente']);
  });

  it('série: mês, vigências, números pulados e generating; sem vigência no primeiro número é recusada', async () => {
    const term = { from_number: 1, description: 'Luz', category: null, amount_cents: 18000, amount_mode: 'variavel', due_day: 12, created_at: '2026-10-07T12:00:00Z' };
    const series = {
      id: 's1',
      context_id: 'ctx',
      kind: 'mensal',
      nature: 'conta',
      first_due_month: '2026-11-01',
      first_number: 1,
      last_number: null,
      installment_total: null,
      currency: 'BRL',
      created_by: 'p1',
      version: 2,
      created_at: '2026-10-07T12:00:00Z',
      updated_at: '2026-10-08T12:00:00Z',
      terms: [term, { ...term, from_number: 3, amount_cents: 19000, amount_mode: 'fixo', due_day: 31 }],
      skipped_numbers: [2],
      paid_count: 1,
      open_count: 1,
      generating: false,
    };
    expect(await repoWith(series).getSeries('s1')).toEqual({
      id: 's1',
      contextId: 'ctx',
      kind: 'mensal',
      nature: 'conta',
      firstDueMonth: '2026-11',
      firstNumber: 1,
      lastNumber: null,
      installmentTotal: null,
      currency: 'BRL',
      terms: [
        { fromNumber: 1, description: 'Luz', category: null, amountCents: 18000, amountMode: 'variavel', dueDay: 12 },
        { fromNumber: 3, description: 'Luz', category: null, amountCents: 19000, amountMode: 'fixo', dueDay: 31 },
      ],
      skippedNumbers: [2],
      paidCount: 1,
      openCount: 1,
      generating: false,
      createdBy: 'p1',
      version: 2,
      createdAt: '2026-10-07T12:00:00Z',
      updatedAt: '2026-10-08T12:00:00Z',
    });
    for (const bad of [{ ...series, terms: [] }, { ...series, terms: [{ ...term, from_number: 2 }] }]) {
      expect(await failure(repoWith(bad).getSeries('s1'))).toEqual(['desconhecido', 'serie_inconsistente']);
    }
  });
});
