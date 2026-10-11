/// <reference types="node" />
/**
 * Teste de integração: o repositório do app falando com o banco real através de uma API
 * compatível com a do Supabase (PostgREST), com tokens de pessoas diferentes.
 * Executado por `npm run test:api` (ver supabase/tests/run_api.sh). Pessoas FICTÍCIAS.
 */
import { createHmac, randomUUID } from 'node:crypto';

import {
  BUDGET_CATEGORIES,
  DEFAULT_SEARCH,
  NO_CATEGORY_LABEL,
  RepoError,
  SEARCH_LIMIT,
  addMonths,
  affectedByDelete,
  affectedByEditFrom,
  affectedByEnd,
  affectedByYear,
  annualCommitmentIds,
  annualYearSummary,
  budgetCaption,
  budgetCrossing,
  buildReturnReview,
  cardErrorText,
  cardLimitUsed,
  categoryBreakdown,
  compareNewestPurchase,
  compareNewestRecord,
  committedGoalLines,
  coverageTenths,
  emergencyTarget,
  limitFor,
  limitStatus,
  emptyMonthCaption,
  exampleReceiptQr,
  essentialMonthly,
  firstNegativeDay,
  formatPermille,
  goalComposition,
  goalPlan,
  goalProgress,
  goalSaved,
  groupAnnualLater,
  installmentProgress,
  isSavingsStepDone,
  lastClosedMonth,
  lastIncomeReferenceChange,
  loadInvoices,
  loadInvoicesOfRecords,
  loadReturnReview,
  lastNumberFromEndYear,
  mergeOccurrences,
  minimumReserveInput,
  missingMonths,
  monthOf,
  monthRange,
  monthReachedWithPlan,
  monthlyNeeded,
  monthsOverview,
  negativeDayFromDetail,
  newOperationKey,
  occurrenceLabel,
  occurrencesToMaterialize,
  organizeGoals,
  paidInvoiceMonths,
  purchasePreview,
  paymentsForecast,
  plannedForGoals,
  projectCommitted,
  purchaseFirstInvoiceMonth,
  purchaseMatchesFilter,
  readMonthBudget,
  readReceiptCode,
  recordMatchesFilter,
  returnBannerText,
  returnWindow,
  reviewDecision,
  reviewExpectedVersion,
  savedInMonth,
  savingsAnswerError,
  savingsAskAgainOn,
  savingsCardState,
  savingsPlan,
  savingsReserveInput,
  searchFilterOf,
  searchResultPurchases,
  searchResultRecords,
  searchTerms,
  seriesGapsInRange,
  seriesInputError,
  seriesPreview,
  shouldAskSavings,
  suggestReference,
  suggestedAnnualReference,
  summarizeBudget,
  summarizeCommitted,
  summarizeMonth,
  summarizePurchases,
  summarizeSearch,
  summarizeToPay,
  updateSavedValue,
  upcomingCommittedMonths,
  weeklySavingsToMonthly,
  wholeYearPayment,
  type AccountKind,
  type AffectedRef,
  type AmountMode,
  type Card,
  type CardEntry,
  type CardInput,
  type CategoryBudget,
  type Cents,
  type Commitment,
  type CommitmentInput,
  type CommitmentLimit,
  type CommitmentSeries,
  type CommittedSummary,
  type FinancialAccount,
  type FinancialRecord,
  type Goal,
  type GoalInput,
  type GoalMovementInput,
  type GoalMovementKind,
  type GoalStatus,
  type IncomeReference,
  type IsoDate,
  type IsoMonth,
  type MonthBudgetRead,
  type NewGoalInput,
  type OccurrenceMode,
  type PaymentInput,
  type PlannedOccurrence,
  type RecordInput,
  type RecordSearchFilter,
  type RecordKind,
  type ReturnDecision,
  type ReturnReview,
  type ReviewRow,
  type SavingsAnswer,
  type SavingsCheck,
  type SearchParams,
  type SeriesEditInput,
  type SeriesInput,
  type SeriesKind,
} from '@clarevo/core';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it, vi } from 'vitest';

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

const cents = (reais: number) => Math.round(reais * 100);

/** A escrita chega ao banco, mas a resposta se perde: o app não sabe o resultado. */
const lostResponse: typeof fetch = async (input, init) => {
  const res = await fetch(input, init);
  await res.arrayBuffer();
  throw new TypeError('Failed to fetch');
};

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
const byNumber = (list: readonly Commitment[], n: number) => list.find((c) => c.series!.number === n)!;

/**
 * "Ainda a pagar" pelo core (summarizeToPay sobre listCommitments) e pelo banco (month_to_pay), no mesmo dia e pela
 * mesma pessoa; a parte estimada também é somada direto em commitment_items, com o critério de D-021(5).
 */
async function checkedToPay(person: string, ctx: string, month: IsoMonth, today: IsoDate) {
  const s = summarizeToPay(await repoFor(person, today).listCommitments(ctx, month), ctx, month, today);
  const db = clientFor(person, today);
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
}

/**
 * Gerar pela API cria exatamente o que occurrencesToMaterialize calcula para cada série do contexto, com a autoria de
 * quem criou a série; gerar de novo não cria nada. Devolve o que foi criado, na ordem das séries.
 */
async function checkedSync(person: string, ctx: string, today: IsoDate) {
  const repo = repoFor(person, today);
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
}

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
    partsPerYear: null,
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
    partsPerYear: null,
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
  const toPay = (month: IsoMonth, today: IsoDate = TODAY) => checkedToPay(ANA, ctx, month, today);
  const syncMatchesCore = (today: IsoDate) => checkedSync(ANA, ctx, today);

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
        partsPerYear: null,
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
          series: { id: w.series.id, kind: input.kind, nature: input.nature, installmentTotal: input.installmentTotal, partsPerYear: null },
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
      { ...escolaInput, kind: 'semanal' as SeriesKind },
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
      { ...escolaInput, partsPerYear: 1 },
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
        'parcelas_no_ano_invalidas',
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
    const flaky = new SupabaseRepository(clientFor(ANA, undefined, lostResponse), { id: ANA });
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

describe('API real: contas do ano', () => {
  // Bruno, sem nenhum dado até aqui, faz a sequência de aceite A3: base de outubro de 2026 com Recebido 6.000,00,
  // Pago 3.900,00 e Ainda a pagar 650,00 (Internet em 15/10 e Condomínio em 20/10), mais Seguro do carro em 10/11.
  // Cada passo usa o "hoje" da tabela da sequência. Ana é a pessoa de fora. Pessoas e contas fictícias.
  const OCT = '2026-10-07';
  const NOV = '2026-11-01';
  const DEC = '2026-12-01';
  const DEC10 = '2026-12-10';
  const JAN15 = '2027-01-15';
  const JAN20 = '2027-01-20';
  const FEB10 = '2027-02-10';
  const NOV27 = '2027-11-01';
  const DEC27 = '2027-12-01';
  const NOV28 = '2028-11-01';
  const bruno = repoFor(BRUNO);
  const ana = repoFor(ANA);
  let ctx = '';
  let account = '';
  let ipva: CommitmentSeries;
  let iptu: CommitmentSeries;
  let matricula: CommitmentSeries;
  let informKey = '';

  const annual = (
    description: string,
    reais: number,
    partsPerYear: number,
    firstDueMonth: IsoMonth,
    dueDay: number,
    amountMode: AmountMode,
    category: string,
  ): SeriesInput => ({
    kind: 'anual',
    nature: 'conta',
    description,
    category,
    amountCents: cents(reais),
    amountMode,
    dueDay,
    firstDueMonth,
    firstNumber: 1,
    installmentTotal: null,
    partsPerYear,
    lastMonth: null,
  });
  // Passos 1 a 3: IPVA em cota única, IPTU em 10 parcelas de fevereiro a novembro e Matrícula com valor fixo.
  const ipvaInput = annual('IPVA', 2400, 1, '2027-01', 20, 'variavel', 'Transporte');
  const iptuInput = annual('IPTU', 180, 10, '2027-02', 10, 'variavel', 'Moradia');
  const matriculaInput = annual('Matrícula', 1200, 1, '2026-12', 10, 'fixo', 'Educação');

  const at = (today: IsoDate) => repoFor(BRUNO, today);
  const payment = (amountCents: Cents, paidOn: IsoDate): PaymentInput => ({ accountId: account, amountCents, paidOn, category: null });
  /** Colunas da sequência A3, em reais: Ainda a pagar (conferido no core e no banco) e Pago do mês de hoje. */
  const columns = async (today: IsoDate) => {
    const month = monthOf(today);
    const toPay = await checkedToPay(BRUNO, ctx, month, today);
    const paid = summarizeMonth(await at(today).listRecords(ctx, month), ctx, month).paidCents;
    return [toPay.toPayCents / 100, paid / 100];
  };
  /** Geração conferida com o core; nenhuma conta viva vence depois do fim do 13º mês a partir do mês de hoje (S10). */
  const sync = async (today: IsoDate) => {
    const created = await checkedSync(BRUNO, ctx, today);
    const limit = `${addMonths(monthOf(today), 14)}-01`;
    for (const s of await at(today).listSeries(ctx)) {
      for (const c of await at(today).listSeriesOccurrences(s.id)) expect(c.dueOn < limit).toBe(true);
    }
    return created.map((p) => [p.description, p.number, p.dueOn, p.amountCents, p.amountIsEstimate]);
  };
  /** Lista completa da série (as 60 mais recentes e todas as em aberto), como pedem affectedByYear e wholeYearPayment. */
  const full = async (repo: SupabaseRepository, id: string) =>
    mergeOccurrences(await repo.listSeriesOccurrences(id), await repo.listOpenSeriesOccurrences(id));
  /** Parcelas de um ano do IPTU (dia 10, de fevereiro a novembro). */
  const iptuYear = (year: number, firstNumber: number, reais: number) =>
    Array.from({ length: 10 }, (_, i) => ['IPTU', firstNumber + i, `${year}-${String(i + 2).padStart(2, '0')}-10`, cents(reais), true]);

  beforeAll(async () => {
    const space = (await bruno.getSpace())!;
    ctx = space.personalContextId;
    account = space.accounts[0]!.id;
    expect(await bruno.listSeries(ctx)).toEqual([]);
    expect(await bruno.listRecords(ctx, '2026-10')).toEqual([]);
  });

  it('base da sequência A3: outubro com 6.000,00 recebidos, 3.900,00 pagos e 650,00 a pagar', async () => {
    const record = (kind: RecordKind, description: string, reais: number, occurredOn: IsoDate) =>
      bruno.createRecord(newOperationKey(), ctx, kind, { accountId: account, amountCents: cents(reais), occurredOn, description, category: null });
    await record('receita', 'Salário', 6000, '2026-10-01');
    await record('despesa', 'Aluguel', 2500, '2026-10-05');
    await record('despesa', 'Mercado', 1400, '2026-10-06');
    const bills = [
      ['Internet', 150, '2026-10-15'],
      ['Condomínio', 500, '2026-10-20'],
      ['Seguro do carro', 300, '2026-11-10'],
    ] as const;
    for (const [description, reais, dueOn] of bills) {
      await bruno.createCommitment(newOperationKey(), ctx, { description, amountCents: cents(reais), dueOn, category: null });
    }
    expect(await columns(OCT)).toEqual([650, 3900]);
  });

  it('passos 1 a 4: o banco gera o que a prévia do core calcula; parcelas por ano mapeadas na série e nas contas', async () => {
    const created: CommitmentSeries[] = [];
    for (const input of [ipvaInput, iptuInput, matriculaInput]) {
      const preview = seriesPreview(input, OCT);
      const key = newOperationKey();
      const w = await bruno.createSeries(key, ctx, input);
      expect(w.occurrences.map(planOf)).toEqual(preview.createdNow.map(planned));
      expect(w.changed).toBe(preview.createdNow.length);
      expect(w.series).toMatchObject({
        contextId: ctx,
        kind: 'anual',
        nature: 'conta',
        firstDueMonth: input.firstDueMonth,
        firstNumber: 1,
        lastNumber: null,
        installmentTotal: null,
        partsPerYear: input.partsPerYear,
        currency: 'BRL',
        terms: [
          {
            fromNumber: 1,
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
        createdBy: BRUNO,
        version: 1,
      });
      expect(await bruno.getSeries(w.series.id)).toEqual(w.series);
      for (const c of w.occurrences) {
        expect(await bruno.getCommitment(c.id)).toEqual(c);
        expect(c.series).toEqual({ id: w.series.id, number: c.series!.number, kind: 'anual', nature: 'conta', installmentTotal: null, partsPerYear: input.partsPerYear });
      }
      expect(await bruno.findSeriesOperation(key)).toEqual({ action: 'criar_serie', seriesId: w.series.id });
      // Repetir devolve a mesma conta do ano; outro número de parcelas por ano com a mesma chave é outro pedido.
      expect(await bruno.createSeries(key, ctx, input)).toEqual({ ...w, changed: 0 });
      expect(await err(bruno.createSeries(key, ctx, { ...input, partsPerYear: input.partsPerYear! + 1 }))).toBe('chave_reutilizada');
      created.push(w.series);
    }
    [ipva, iptu, matricula] = created as [CommitmentSeries, CommitmentSeries, CommitmentSeries];
    expect(await bruno.listSeries(ctx)).toEqual(created);

    // IPVA e IPTU sem conta criada; Matrícula 10/12/2026 em Próximos meses, como conta do ano de 2026. Nada muda nos totais.
    expect(created.map((s) => s.openCount)).toEqual([0, 0, 1]);
    const out = await checkedToPay(BRUNO, ctx, '2026-10', OCT);
    expect(out.later.map((c) => [c.description, c.dueOn, occurrenceLabel(c)])).toEqual([
      ['Seguro do carro', '2026-11-10', null],
      ['Matrícula', '2026-12-10', 'Conta do ano de 2026'],
    ]);
    expect(await columns(OCT)).toEqual([650, 3900]);
    // Passo 4: gerar de novo não cria nada.
    expect(await sync(OCT)).toEqual([]);
  });

  it('validação da conta do ano no banco, com o mesmo código e a mesma ordem do core', async () => {
    const invalid: SeriesInput[] = [
      { ...ipvaInput, kind: 'semanal' as SeriesKind },
      { ...ipvaInput, nature: 'financiamento' },
      { ...ipvaInput, firstDueMonth: '2026-08' },
      { ...ipvaInput, firstDueMonth: '2028-10' },
      { ...iptuInput, installmentTotal: 10 },
      { ...iptuInput, partsPerYear: 0 },
      { ...iptuInput, partsPerYear: 13 },
      { ...iptuInput, partsPerYear: null },
      { ...ipvaInput, kind: 'mensal' },
      { ...iptuInput, firstNumber: 0 },
      { ...iptuInput, firstNumber: 11 },
      { ...iptuInput, lastMonth: '2026-11' },
      { ...iptuInput, lastMonth: '2029-10' },
      { ...ipvaInput, lastMonth: '2077-01' },
    ];
    const codes: (string | null)[] = [];
    for (const input of invalid) {
      const code = seriesInputError(input, OCT);
      expect(await err(bruno.createSeries(newOperationKey(), ctx, input))).toBe(code);
      codes.push(code);
    }
    expect(codes).toEqual([
      'tipo_invalido',
      'natureza_invalida',
      'inicio_fora_do_intervalo',
      'inicio_fora_do_intervalo',
      'parcelas_invalidas',
      'parcelas_no_ano_invalidas',
      'parcelas_no_ano_invalidas',
      'parcelas_no_ano_invalidas',
      'parcelas_no_ano_invalidas',
      'parcela_inicial_invalida',
      'parcela_inicial_invalida',
      'fim_invalido',
      'fim_invalido',
      'fim_invalido',
    ]);
    // Limites aceitos: primeiro vencimento até setembro de 2028; último ano em até 50 anos.
    expect(seriesInputError({ ...ipvaInput, firstDueMonth: '2028-09' }, OCT)).toBeNull();
    expect(seriesInputError({ ...ipvaInput, lastMonth: '2076-01' }, OCT)).toBeNull();
    // IPTU até 2029: o último mês vai como o da última parcela de 2029, e o banco grava a parcela 30, como o core.
    const until2029: SeriesInput = { ...iptuInput, description: 'IPTU até 2029', lastMonth: '2029-11' };
    const w = await bruno.createSeries(newOperationKey(), ctx, until2029);
    expect([w.series.lastNumber, seriesPreview(until2029, OCT).lastNumber, w.occurrences.length]).toEqual([30, 30, 0]);
    await bruno.deleteSeries(newOperationKey(), w.series.id, w.series.version, []);
    // As recusas não gravam nada.
    expect((await bruno.listSeries(ctx)).map((s) => s.id)).toEqual([ipva.id, iptu.id, matricula.id]);
  });

  it('passos 5 a 8: em 01/11/2026 entra o IPVA e em 01/12/2026 as 10 parcelas do IPTU, sem mudar Ainda a pagar', async () => {
    // Passo 5: pagar Internet, Condomínio e Seguro do carro em 07/10.
    for (const c of (await bruno.listCommitments(ctx, '2026-10')).filter((x) => x.series === null)) {
      await bruno.payCommitment(newOperationKey(), c.id, c.version, payment(c.amountCents, OCT));
    }
    expect(await columns(OCT)).toEqual([0, 4850]);

    // Passo 6: o IPVA de 2027 entra dois meses antes de vencer, estimado, só em Próximos meses.
    expect(await sync(NOV)).toEqual([['IPVA', 1, '2027-01-20', 240000, true]]);
    expect(await columns(NOV)).toEqual([0, 0]);
    const nov = await checkedToPay(BRUNO, ctx, '2026-11', NOV);
    expect(nov.later.map((c) => [c.description, occurrenceLabel(c), c.amountIsEstimate])).toEqual([
      ['Matrícula', 'Conta do ano de 2026', false],
      ['IPVA', 'Conta do ano de 2027', true],
    ]);
    // Mês que não é o atual: janeiro de 2027 visto em 01/11/2026.
    const jan = await checkedToPay(BRUNO, ctx, '2027-01', NOV);
    expect([jan.dueInMonthCents, jan.overdueBeforeCents, jan.toPayCents, jan.items.length, jan.estimatedCents]).toEqual([
      240000, 0, 240000, 1, 240000,
    ]);

    // Passo 7: as 10 parcelas de 2027 do IPTU, estimadas; Ainda a pagar de dezembro só com a Matrícula.
    expect(await sync(DEC)).toEqual(iptuYear(2027, 1, 180));
    expect(await columns(DEC)).toEqual([1200, 0]);
    const grouped = groupAnnualLater((await checkedToPay(BRUNO, ctx, '2026-12', DEC)).later);
    expect(grouped.map((g) => (g.type === 'conta' ? g.commitment.description : g.group.title))).toEqual(['IPVA', 'IPTU de 2027']);
    expect(grouped[1]).toMatchObject({
      type: 'ano',
      group: { seriesId: iptu.id, count: 10, totalCents: 180000, approximate: true, caption: '10 parcelas, de 10/02 a 10/11/2027 · estimado' },
    });

    // Passo 8: pagar a Matrícula em 10/12.
    const mat = byNumber(await at(DEC10).listSeriesOccurrences(matricula.id), 1);
    await at(DEC10).payCommitment(newOperationKey(), mat.id, mat.version, payment(120000, DEC10));
    expect(await columns(DEC10)).toEqual([0, 1200]);
  });

  it('passos 9 a 12: "Informar o valor de 2027" por RPC, com conjunto conferido, repetição e reconciliação depois de falha de rede', async () => {
    const repo = at(JAN15);
    const plan = affectedByYear(await full(repo, iptu.id), iptu, 1, 'informar', 18990);
    if (!plan.ok) throw new Error(plan.code);
    expect([plan.affected.length, plan.totalCents]).toEqual([10, 189900]);
    // Conjunto diferente do que o banco vê: recusa sem gravar.
    const stale = (affected: AffectedRef[]) => err(repo.informSeriesYear(newOperationKey(), iptu.id, 1, affected, 18990));
    expect(await stale(plan.affected.slice(1))).toBe('versao_desatualizada');
    expect(await stale(plan.affected.map((a) => ({ ...a, version: 2 })))).toBe('versao_desatualizada');
    expect(await stale([])).toBe('versao_desatualizada');
    expect(await full(repo, iptu.id)).toEqual(plan.changing.slice().reverse());

    // Passo 9: n1 a n10 com 189,90, não estimadas e alteradas só neste ano; a versão da série não muda.
    informKey = newOperationKey();
    const w = await repo.informSeriesYear(informKey, iptu.id, 1, plan.affected, 18990);
    expect(w.changed).toBe(10);
    expect(w.series).toEqual(await repo.getSeries(iptu.id));
    expect(w.series.version).toBe(iptu.version);
    expect(w.occurrences.map((c) => [c.series!.number, c.amountCents, c.amountIsEstimate, c.seriesOverride, c.version])).toEqual(
      Array.from({ length: 10 }, (_, i) => [i + 1, 18990, false, true, 2]),
    );
    for (const c of w.occurrences) expect(await repo.getCommitment(c.id)).toEqual(c);
    expect(await repo.findSeriesOperation(informKey)).toEqual({ action: 'informar_ano', seriesId: iptu.id });
    expect(await repo.findCommitmentOperation(informKey)).toBeNull();
    expect(await repo.findOperation(informKey)).toBeNull();
    // Passo 10: repetir com a mesma chave não muda nada; outro valor com a mesma chave é recusado.
    expect(await repo.informSeriesYear(informKey, iptu.id, 1, plan.affected, 18990)).toEqual({ ...w, changed: 0 });
    expect(await err(repo.informSeriesYear(informKey, iptu.id, 1, plan.affected, 19000))).toBe('chave_reutilizada');
    const summary = annualYearSummary(w.series, await repo.listSeriesOccurrences(iptu.id), await repo.listOpenSeriesOccurrences(iptu.id), 0, JAN15);
    expect([summary.open, summary.totalCents, summary.approximate]).toEqual([10, 189900, false]);
    expect(await columns(JAN15)).toEqual([2400, 0]);
    expect((await checkedToPay(BRUNO, ctx, '2027-01', JAN15)).estimatedCents).toBe(240000);

    // Passo 11, com a resposta perdida: o valor chega ao banco e a chave mostra que a operação foi concluída.
    const ipvaPlan = affectedByYear(await full(repo, ipva.id), ipva, 1, 'informar', 251230);
    if (!ipvaPlan.ok) throw new Error(ipvaPlan.code);
    const flaky = new SupabaseRepository(clientFor(BRUNO, JAN15, lostResponse), { id: BRUNO });
    const key = newOperationKey();
    expect(await err(flaky.informSeriesYear(key, ipva.id, 1, ipvaPlan.affected, 251230))).toBe('rede');
    expect(await repo.findSeriesOperation(key)).toEqual({ action: 'informar_ano', seriesId: ipva.id });
    expect(await ana.findSeriesOperation(key)).toBeNull();
    const again = await repo.informSeriesYear(key, ipva.id, 1, ipvaPlan.affected, 251230);
    expect(again.changed).toBe(0);
    expect(again.occurrences.map((c) => [c.series!.number, c.amountCents, c.amountIsEstimate, c.version])).toEqual([[1, 251230, false, 2]]);
    expect(await columns(JAN15)).toEqual([2512.3, 0]);

    // Passo 12: pagar o IPVA em 20/01/2027.
    const n1 = byNumber(await at(JAN20).listSeriesOccurrences(ipva.id), 1);
    await at(JAN20).payCommitment(newOperationKey(), n1.id, n1.version, payment(251230, JAN20));
    expect(await columns(JAN20)).toEqual([0, 2512.3]);
  });

  it('passos 13 a 16: "Paguei o ano todo de uma vez" paga a parcela 1 e tira as outras 9, que não voltam', async () => {
    const repo = at(FEB10);
    const n1 = byNumber(await repo.listSeriesOccurrences(iptu.id), 1);
    const whole = wholeYearPayment(await full(repo, iptu.id), iptu, n1);
    if (!whole) throw new Error('sem cota única');
    expect([whole.others.length, whole.openTotalCents, whole.approximate]).toEqual([9, 189900, false]);
    // Passo 13: cota única com 10% de desconto, 189.900 × 0,9 = 170.910; depois, tirar as outras.
    const paid = await repo.payCommitment(newOperationKey(), n1.id, n1.version, payment(170910, FEB10));
    expect(paid.record).toMatchObject({ amountCents: 170910, commitmentId: n1.id, occurredOn: FEB10 });
    // O pagamento não muda a versão das outras; com a parcela paga no conjunto, o banco recusa.
    const withPaid = [{ id: n1.id, version: n1.version }, ...whole.affectedAfterPayment];
    expect(await err(repo.skipSeriesYear(newOperationKey(), iptu.id, 1, withPaid))).toBe('versao_desatualizada');
    const skipKey = newOperationKey();
    const skip = await repo.skipSeriesYear(skipKey, iptu.id, n1.series!.number, whole.affectedAfterPayment);
    expect(skip.changed).toBe(9);
    expect(skip.series).toMatchObject({ skippedNumbers: [2, 3, 4, 5, 6, 7, 8, 9, 10], paidCount: 1, openCount: 0, version: iptu.version });
    expect(skip.occurrences.map((c) => [c.series!.number, c.status])).toEqual([[1, 'quitado']]);
    expect(await repo.getSeries(iptu.id)).toEqual(skip.series);
    for (const c of whole.others) expect(await repo.getCommitment(c.id)).toBeNull();
    expect(await repo.skipSeriesYear(skipKey, iptu.id, 1, whole.affectedAfterPayment)).toEqual({ ...skip, changed: 0 });
    expect(await repo.findSeriesOperation(skipKey)).toEqual({ action: 'tirar_ano', seriesId: iptu.id });
    expect(await columns(FEB10)).toEqual([0, 1709.1]);
    // Passo 14: gerar não recria as parcelas tiradas.
    expect(await sync(FEB10)).toEqual([]);

    // Passo 15: desfazer o pagamento traz só a parcela 1 de volta (189,90); 2 a 10 continuam fora, mesmo ao gerar.
    const undone = await repo.undoCommitmentPayment(newOperationKey(), n1.id, paid.commitment.version);
    expect(undone.commitment).toMatchObject({ status: 'aberto', amountCents: 18990 });
    expect(await sync(FEB10)).toEqual([]);
    expect((await repo.listSeriesOccurrences(iptu.id)).map((c) => c.series!.number)).toEqual([1]);
    expect(await columns(FEB10)).toEqual([189.9, 0]);
    // Passo 16: pagar de novo.
    await repo.payCommitment(newOperationKey(), n1.id, undone.commitment.version, payment(170910, FEB10));
    expect(await columns(FEB10)).toEqual([0, 1709.1]);
    iptu = (await repo.getSeries(iptu.id))!;
    const summary = annualYearSummary(iptu, await repo.listSeriesOccurrences(iptu.id), await repo.listOpenSeriesOccurrences(iptu.id), 0, FEB10);
    expect([summary.paid, summary.skipped, summary.open, summary.totalCents]).toEqual([1, 9, 0, 170910]);
  });

  it('passo 17: sugestão do IPVA aplicada com update_series_from a partir de 2028; o IPTU, com parcelas tiradas, fica sem sugestão', async () => {
    const repo = at(FEB10);
    ipva = (await repo.getSeries(ipva.id))!;
    const suggestion = suggestedAnnualReference(ipva, await repo.listSeriesOccurrences(ipva.id), FEB10);
    if (!suggestion) throw new Error('sem sugestão');
    expect([suggestion.amountCents, suggestion.fromNumber, suggestion.fromLabel, suggestion.paidYear.label]).toEqual([251230, 2, '2028', '2027']);
    expect(suggestedAnnualReference(iptu, await repo.listSeriesOccurrences(iptu.id), FEB10)).toBeNull();
    // A parcela 2 ainda não existe: conjunto esperado vazio, como o reajuste programado do Ciclo A.
    const plan = affectedByEditFrom(await full(repo, ipva.id), ipva, suggestion.fromNumber);
    if (!plan.ok) throw new Error(plan.code);
    expect(plan.affected).toEqual([]);
    const key = newOperationKey();
    const w = await repo.updateSeriesFrom(key, ipva.id, ipva.version, suggestion.fromNumber, plan.affected, suggestion.edit);
    expect(w.changed).toBe(0);
    expect(w.series).toMatchObject({
      version: 2,
      partsPerYear: 1,
      terms: [
        { fromNumber: 1, amountCents: 240000, amountMode: 'variavel', dueDay: 20 },
        { fromNumber: 2, amountCents: 251230, amountMode: 'variavel', dueDay: 20 },
      ],
    });
    expect(w.occurrences.map((c) => [c.series!.number, c.status, c.amountCents])).toEqual([[1, 'quitado', 251230]]);
    expect(await repo.findSeriesOperation(key)).toEqual({ action: 'alterar_serie', seriesId: ipva.id });
    ipva = w.series;
    expect(await columns(FEB10)).toEqual([0, 1709.1]);
  });

  it('passos 18 a 21: geração em 01/11/2027, 01/12/2027 e 01/11/2028; encerrar o IPVA em 2028', async () => {
    // Passo 18: IPVA de 2028 pela referência nova, estimado; Matrícula de 2027.
    expect(await sync(NOV27)).toEqual([
      ['IPVA', 2, '2028-01-20', 251230, true],
      ['Matrícula', 2, '2027-12-10', 120000, false],
    ]);
    expect(await columns(NOV27)).toEqual([0, 0]);
    // Passo 19: as 10 parcelas de 2028 do IPTU pela referência, que não mudou.
    expect(await sync(DEC27)).toEqual(iptuYear(2028, 11, 180));
    expect(await columns(DEC27)).toEqual([1200, 0]);

    // Passo 20: encerrar o IPVA com a última conta em 2028; nada sai.
    const repo = at(DEC27);
    const last = lastNumberFromEndYear(ipva, 2028);
    const end = affectedByEnd(await full(repo, ipva.id), ipva, last);
    if (!end.ok) throw new Error(end.code);
    expect([last, end.removed]).toEqual([2, []]);
    const ended = await repo.endSeries(newOperationKey(), ipva.id, ipva.version, last, end.affected);
    expect(ended).toMatchObject({ changed: 0, series: { lastNumber: 2, version: 3, openCount: 1, paidCount: 1, partsPerYear: 1 } });
    ipva = ended.series;
    expect(await columns(DEC27)).toEqual([1200, 0]);

    // Passo 21: o IPVA de 2029 não é criado; a Matrícula de 2028 sim.
    expect(await sync(NOV28)).toEqual([['Matrícula', 3, '2028-12-10', 120000, false]]);
    await checkedToPay(BRUNO, ctx, '2028-11', NOV28);
  });

  it('informar e tirar: validação no banco; outra pessoa não lê nem altera', async () => {
    const repo = at(NOV28);
    const before = await full(repo, iptu.id);
    const year2028 = affectedByYear(before, iptu, 11, 'tirar');
    if (!year2028.ok) throw new Error(year2028.code);
    expect(year2028.affected).toHaveLength(10);

    // Outra pessoa não encontra a conta do ano, as parcelas nem a operação.
    expect(await ana.getSeries(iptu.id)).toBeNull();
    expect(await ana.listSeries(ctx)).toEqual([]);
    expect(await ana.listOpenSeriesOccurrences(iptu.id)).toEqual([]);
    expect(await err(ana.informSeriesYear(newOperationKey(), iptu.id, 11, year2028.affected, 19000))).toBe('nao_encontrado');
    expect(await err(ana.skipSeriesYear(newOperationKey(), iptu.id, 11, year2028.affected))).toBe('nao_encontrado');
    expect(await ana.findSeriesOperation(informKey)).toBeNull();
    // Só conta do ano: no gasto fixo de Ana, tipo_invalido.
    const anaCtx = (await ana.getSpace())!.personalContextId;
    const monthly = (await ana.listSeries(anaCtx)).find((s) => s.kind === 'mensal')!;
    expect(affectedByYear([], monthly, 1, 'informar')).toEqual({ ok: false, code: 'tipo_invalido' });
    expect(await err(ana.informSeriesYear(newOperationKey(), monthly.id, 1, [], 1000))).toBe('tipo_invalido');
    expect(await err(ana.skipSeriesYear(newOperationKey(), monthly.id, 1, []))).toBe('tipo_invalido');

    // Número fora da conta do ano (antes da primeira ou depois do término) e valor inválido.
    expect(affectedByYear([], ipva, 3, 'informar')).toEqual({ ok: false, code: 'numero_fora_da_serie' });
    expect(await err(repo.informSeriesYear(newOperationKey(), ipva.id, 3, [], 1000))).toBe('numero_fora_da_serie');
    expect(await err(repo.skipSeriesYear(newOperationKey(), iptu.id, 0, year2028.affected))).toBe('numero_fora_da_serie');
    expect(await err(repo.informSeriesYear(newOperationKey(), iptu.id, 11, year2028.affected, 0))).toBe('valor_invalido');
    expect(await err(repo.informSeriesYear(newOperationKey(), iptu.id, 11, year2028.affected, 1_000_000_000))).toBe('valor_acima_do_limite');
    // Ano sem parcela a mudar: o core não monta o pedido, e o banco recusa o conjunto vazio.
    expect(affectedByYear(before, iptu, 1, 'informar')).toMatchObject({ ok: false, code: 'nada_a_mudar' });
    expect(affectedByYear(before, iptu, 1, 'tirar')).toMatchObject({ ok: false, code: 'nada_a_mudar' });
    expect(await err(repo.informSeriesYear(newOperationKey(), iptu.id, 1, [], 19000))).toBe('versao_desatualizada');
    expect(await err(repo.skipSeriesYear(newOperationKey(), iptu.id, 1, []))).toBe('versao_desatualizada');

    // Gravação direta é recusada; as recusas não gravam nada.
    const db = clientFor(BRUNO);
    expect((await db.from('commitment_series').update({ parts_per_year: 12 }).eq('id', iptu.id)).error).not.toBeNull();
    expect((await clientFor(null).rpc('skip_series_year', {
      p_idempotency_key: newOperationKey(),
      p_series_id: iptu.id,
      p_number: 11,
      p_expected_affected: year2028.affected,
    })).error).not.toBeNull();
    expect(await full(repo, iptu.id)).toEqual(before);
    expect((await repo.getSeries(iptu.id))!.partsPerYear).toBe(10);
  });

  it('ausência longa (Ana): IPTU criado em 07/10/2026 e app aberto só em 15/06/2028 cria 7 parcelas, 2 vencidas', async () => {
    const LONG = '2028-06-15';
    const anaCtx = (await ana.getSpace())!.personalContextId;
    const w = await ana.createSeries(newOperationKey(), anaCtx, { ...iptuInput, description: 'IPTU do apartamento' });
    expect(w.occurrences).toEqual([]);
    const created = (await checkedSync(ANA, anaCtx, LONG)).filter((p) => p.description === 'IPTU do apartamento');
    expect(created.map((p) => [p.number, p.dueOn])).toEqual(
      Array.from({ length: 7 }, (_, i) => [14 + i, `2028-${String(5 + i).padStart(2, '0')}-10`]),
    );
    expect(created.filter((p) => p.dueOn < LONG)).toHaveLength(2);
    const repo = repoFor(ANA, LONG);
    const s = (await repo.getSeries(w.series.id))!;
    const occ = await repo.listSeriesOccurrences(s.id);
    const open = await repo.listOpenSeriesOccurrences(s.id);
    expect(annualYearSummary(s, occ, open, 0, LONG).texts.missing).toBe(
      '2027: as 10 parcelas ficaram sem conta registrada. Se você pagou, anote o gasto em Anotar gasto.',
    );
    expect(annualYearSummary(s, occ, open, 1, LONG).texts.missing).toBe('2028: parcelas 1 a 3 sem conta registrada.');
    await checkedToPay(ANA, anaCtx, '2028-06', LONG);
  });

  it('sugestão de referência (Ana): paga antes do ano começar, só aparece quando o banco aceita; com o ano seguinte informado, some', async () => {
    const space = (await ana.getSpace())!;
    const anaCtx = space.personalContextId;
    const pay = (amountCents: Cents, paidOn: IsoDate): PaymentInput => ({ accountId: space.accounts[0]!.id, amountCents, paidOn, category: null });
    // Matrícula da escola de 10/12, desde 2028, referência R$ 1.200,00 que muda; criada e paga adiantada em 15/10/2028.
    const OCT28 = '2028-10-15';
    const created = await repoFor(ANA, OCT28).createSeries(
      newOperationKey(),
      anaCtx,
      annual('Matrícula da escola', 1200, 1, '2028-12', 10, 'variavel', 'Educação'),
    );
    const id = created.series.id;
    expect(created.occurrences.map((c) => [c.series!.number, c.dueOn])).toEqual([[1, '2028-12-10']]);
    const n1 = created.occurrences[0]!;
    await repoFor(ANA, OCT28).payCommitment(newOperationKey(), n1.id, n1.version, pay(125000, OCT28));
    const edit: SeriesEditInput = { nature: 'conta', description: 'Matrícula da escola', category: 'Educação', amountCents: 125000, amountMode: 'variavel', dueDay: 10 };
    // Antes de dezembro de 2028, o banco recusa "a partir de 2029" (numero_fora_da_serie), e o core não sugere.
    for (const today of [OCT28, '2028-11-30']) {
      const repo = repoFor(ANA, today);
      const s = (await repo.getSeries(id))!;
      expect(suggestedAnnualReference(s, await full(repo, id), today)).toBeNull();
      expect(await err(repo.updateSeriesFrom(newOperationKey(), id, s.version, 2, [], edit))).toBe('numero_fora_da_serie');
    }
    // Em 01/12/2028 a sugestão aparece e o banco aceita.
    const DEC28 = '2028-12-01';
    const dec = repoFor(ANA, DEC28);
    const s = (await dec.getSeries(id))!;
    const suggestion = suggestedAnnualReference(s, await dec.listSeriesOccurrences(id), DEC28);
    if (!suggestion) throw new Error('sem sugestão');
    expect([suggestion.fromNumber, suggestion.edit, suggestion.text]).toEqual([
      2,
      edit,
      'Em 2028 você pagou R$ 1.250,00. Usar esse valor como referência a partir de 2029?',
    ]);
    const plan = affectedByEditFrom(await full(dec, id), s, suggestion.fromNumber);
    if (!plan.ok) throw new Error(plan.code);
    const applied = await dec.updateSeriesFrom(newOperationKey(), id, s.version, suggestion.fromNumber, plan.affected, suggestion.edit);
    expect(applied.series.terms.map((t) => [t.fromNumber, t.amountCents])).toEqual([
      [1, 120000],
      [2, 125000],
    ]);

    // 2029 paga com R$ 1.300,00 (sugestão para 2030 em aberto); em 01/10/2030, 2030 entra e é informada com R$ 1.350,00.
    await repoFor(ANA, '2029-10-01').syncSeriesOccurrences(anaCtx);
    const DEC29 = '2029-12-10';
    const n2 = byNumber(await repoFor(ANA, DEC29).listSeriesOccurrences(id), 2);
    expect([n2.dueOn, n2.amountCents, n2.amountIsEstimate]).toEqual(['2029-12-10', 125000, true]);
    await repoFor(ANA, DEC29).payCommitment(newOperationKey(), n2.id, n2.version, pay(130000, DEC29));
    const OCT30 = '2030-10-01';
    const oct30 = repoFor(ANA, OCT30);
    await oct30.syncSeriesOccurrences(anaCtx);
    let current = (await oct30.getSeries(id))!;
    expect(suggestedAnnualReference(current, await full(oct30, id), OCT30)).toMatchObject({ fromNumber: 3, amountCents: 130000 });
    const year = affectedByYear(await full(oct30, id), current, 3, 'informar', 135000);
    if (!year.ok) throw new Error(year.code);
    await oct30.informSeriesYear(newOperationKey(), id, 3, year.affected, 135000);
    current = (await oct30.getSeries(id))!;
    // Aplicar agora trocaria os R$ 1.350,00 informados pela referência (o banco muda sempre a conta escolhida).
    expect(suggestedAnnualReference(current, await full(oct30, id), OCT30)).toBeNull();
    expect(suggestedAnnualReference(current, await oct30.listSeriesOccurrences(id), OCT30)).toBeNull();
    const stale = affectedByEditFrom(await full(oct30, id), current, 3);
    expect(stale.ok && stale.chosen).toMatchObject({ amountCents: 135000, amountIsEstimate: false, seriesOverride: true });
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
    series_parts_per_year: null,
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
  /** Parcela 3 de um IPTU de 10 parcelas de fevereiro a novembro de 2027. */
  const annualOccurrence = {
    ...occurrence,
    occurrence_number: 3,
    due_on: '2027-04-10',
    series_kind: 'anual',
    series_nature: 'conta',
    series_installment_total: null,
    series_parts_per_year: 10,
  };

  it('ocorrência de série com número, tipo e marcas; conta avulsa sem nenhuma marca de série', async () => {
    expect(await repoWith(occurrence).getCommitment('c1')).toMatchObject({
      series: { id: 's1', number: 13, kind: 'parcelada', nature: 'financiamento', installmentTotal: 48, partsPerYear: null },
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

  it('conta do ano: parcelas por ano mapeadas na conta (rótulo com o ano); tipo e parcelas por ano incoerentes são recusados', async () => {
    const c = (await repoWith(annualOccurrence).getCommitment('c1'))!;
    expect(c.series).toEqual({ id: 's1', number: 3, kind: 'anual', nature: 'conta', installmentTotal: null, partsPerYear: 10 });
    expect(occurrenceLabel(c)).toBe('Parcela 3 de 10 de 2027');
    expect((await create(annualOccurrence)).commitment).toEqual(c);
    const single = (await repoWith({ ...annualOccurrence, occurrence_number: 1, due_on: '2027-01-20', series_parts_per_year: 1 }).getCommitment('c1'))!;
    expect([single.series?.partsPerYear, occurrenceLabel(single)]).toEqual([1, 'Conta do ano de 2027']);
    const bad = [
      { ...annualOccurrence, series_parts_per_year: null },
      { ...annualOccurrence, series_parts_per_year: 0 },
      { ...annualOccurrence, series_parts_per_year: 13 },
      { ...annualOccurrence, series_parts_per_year: 2.5 },
      { ...occurrence, series_parts_per_year: 10 },
      { ...occurrence, series_kind: 'mensal', series_nature: 'conta', series_installment_total: null, series_parts_per_year: 1 },
    ];
    for (const r of bad) {
      expect(await failure(repoWith(r).getCommitment('c1'))).toEqual(['desconhecido', 'serie_inconsistente']);
      expect(await failure(create(r))).toEqual(['desconhecido', 'serie_inconsistente']);
    }
  });

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
    parts_per_year: null,
  };
  /** IPTU de 10 parcelas por ano desde fevereiro de 2027, como a visão series_items e o objeto series das funções o devolvem. */
  const annualSeries = {
    ...series,
    kind: 'anual',
    first_due_month: '2027-02-01',
    last_number: 30,
    terms: [{ ...term, description: 'IPTU', amount_cents: 18000, due_day: 10 }],
    skipped_numbers: [],
    parts_per_year: 10,
  };

  it('série: mês, vigências, números pulados e generating; sem vigência no primeiro número é recusada', async () => {
    expect(await repoWith(series).getSeries('s1')).toEqual({
      id: 's1',
      contextId: 'ctx',
      kind: 'mensal',
      nature: 'conta',
      firstDueMonth: '2026-11',
      firstNumber: 1,
      lastNumber: null,
      installmentTotal: null,
      partsPerYear: null,
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

  it('conta do ano: parcelas por ano mapeadas na série; tipo e parcelas por ano incoerentes são recusados', async () => {
    expect(await repoWith(annualSeries).getSeries('s1')).toMatchObject({ kind: 'anual', firstDueMonth: '2027-02', lastNumber: 30, partsPerYear: 10 });
    const bad = [
      { ...annualSeries, parts_per_year: null },
      { ...annualSeries, parts_per_year: 0 },
      { ...annualSeries, parts_per_year: 13 },
      { ...series, parts_per_year: 1 },
      { ...series, kind: 'parcelada', nature: 'financiamento', installment_total: 48, parts_per_year: 10 },
    ];
    for (const r of bad) expect(await failure(repoWith(r).getSeries('s1'))).toEqual(['desconhecido', 'serie_inconsistente']);
  });

  it('contas do ano por RPC: parcelas por ano só na conta do ano; informar e tirar mandam só {id, version}', async () => {
    const calls: [string, Record<string, unknown>][] = [];
    const db = {
      rpc: async (fn: string, args: Record<string, unknown>) => {
        calls.push([fn, args]);
        return { data: { series: annualSeries, occurrences: [annualOccurrence], changed: 1 }, error: null };
      },
    };
    const repo = new SupabaseRepository(db as unknown as SupabaseClient, { id: 'p1' });
    const monthlyInput: SeriesInput = {
      kind: 'mensal',
      nature: 'conta',
      description: 'Luz',
      category: null,
      amountCents: 18000,
      amountMode: 'variavel',
      dueDay: 12,
      firstDueMonth: '2026-11',
      firstNumber: 1,
      installmentTotal: null,
      partsPerYear: null,
      lastMonth: null,
    };
    const annualInput: SeriesInput = { ...monthlyInput, kind: 'anual', description: 'IPTU', dueDay: 10, firstDueMonth: '2027-02', partsPerYear: 10, lastMonth: '2029-11' };
    // Uma conta inteira serve de conjunto afetado: o repositório manda só {id, version}.
    const occurrence = (await repo.createSeries('chave-0003', 'ctx', annualInput)).occurrences[0]!;
    await repo.createSeries('chave-0004', 'ctx', monthlyInput);
    const w = await repo.informSeriesYear('chave-0005', 's1', 3, [occurrence], 18990);
    await repo.skipSeriesYear('chave-0006', 's1', 3, [occurrence]);
    expect(w).toMatchObject({ series: { id: 's1', partsPerYear: 10 }, occurrences: [{ id: 'c1', series: { partsPerYear: 10 } }], changed: 1 });
    expect(calls.map(([fn]) => fn)).toEqual(['create_series', 'create_series', 'inform_series_year', 'skip_series_year']);
    expect(calls[0]![1]).toMatchObject({ p_kind: 'anual', p_first_due_month: '2027-02-01', p_installment_total: null, p_last_month: '2029-11-01', p_parts_per_year: 10 });
    // Sem parcelas por ano, o pedido é o mesmo do Ciclo A (o banco calcula o mesmo hash).
    expect(calls[1]![1]).not.toHaveProperty('p_parts_per_year');
    expect(Object.keys(calls[1]![1])).toHaveLength(13);
    expect(calls[2]![1]).toEqual({
      p_idempotency_key: 'chave-0005',
      p_series_id: 's1',
      p_number: 3,
      p_expected_affected: [{ id: 'c1', version: 1 }],
      p_amount_cents: 18990,
    });
    expect(calls[3]![1]).toEqual({ p_idempotency_key: 'chave-0006', p_series_id: 's1', p_number: 3, p_expected_affected: [{ id: 'c1', version: 1 }] });
  });
});

describe('API real: Seus últimos meses (Ciclo A4, D-030)', () => {
  // Ana, no fim desta suíte, volta a anotar só em 20/05/2033 (a última anotação dela aqui é de 2030): a montagem da
  // sequência R (spec3 §2.3) com as datas sete anos à frente, mais Academia para "Não houve". Ana ainda tem os gastos
  // fixos e as contas do ano dos ciclos anteriores, então as contagens da revisão são conferidas com o core (paridade)
  // e os números da sequência R nas séries criadas aqui. Bruno é a pessoa de fora. Pessoas e contas fictícias.
  const SETUP = '2033-05-20';
  const R1 = '2033-10-07';
  const OCT15 = '2033-10-15';
  const NOV29 = '2033-11-29';
  const at = (today: IsoDate) => repoFor(ANA, today);
  const bruno = repoFor(BRUNO, R1);
  let ctx = '';
  let account = '';
  let aluguel: CommitmentSeries;
  let luz: CommitmentSeries;
  let carro: CommitmentSeries;
  let academia: CommitmentSeries;

  const monthly = (description: string, reais: number, dueDay: number, amountMode: AmountMode = 'fixo', category = 'Moradia'): SeriesInput => ({
    kind: 'mensal',
    nature: 'conta',
    description,
    category,
    amountCents: cents(reais),
    amountMode,
    dueDay,
    firstDueMonth: '2033-05',
    firstNumber: 1,
    installmentTotal: null,
    partsPerYear: null,
    lastMonth: null,
  });
  const payment = (amountCents: Cents, paidOn: IsoDate, category: string | null = 'Moradia'): PaymentInput => ({ accountId: account, amountCents, paidOn, category });
  const record = (today: IsoDate, kind: RecordKind, description: string, amountCents: Cents, occurredOn: IsoDate) =>
    at(today).createRecord(newOperationKey(), ctx, kind, { accountId: account, amountCents, occurredOn, description, category: null });
  /** Recebido, Pago e Diferença do mês pelo core sobre listRecords. */
  const month = async (m: IsoMonth, today = R1) => {
    const s = summarizeMonth(await at(today).listRecords(ctx, m), ctx, m);
    return [s.receivedCents, s.paidCents, s.differenceCents];
  };
  /** months_overview pela API igual ao core (monthsOverview) sobre os registros de listRecords de cada mês. */
  const overviewMatchesCore = async (from: IsoMonth, to: IsoMonth, today = R1) => {
    const repo = at(today);
    const records: FinancialRecord[] = [];
    for (let m = from; m <= to; m = addMonths(m, 1)) records.push(...(await repo.listRecords(ctx, m)));
    const api = await repo.monthsOverview(ctx, from, to);
    expect(api).toEqual(monthsOverview(records, ctx, from, to));
    return api;
  };
  /** listCommitmentsDueBetween igual às contas de listCommitments de cada mês com vencimento no próprio mês. */
  const dueBetweenMatches = async (from: IsoMonth, to: IsoMonth, today = R1) => {
    const repo = at(today);
    const expected: Commitment[] = [];
    for (let m = from; m <= to; m = addMonths(m, 1)) expected.push(...(await repo.listCommitments(ctx, m)).filter((c) => monthOf(c.dueOn) === m));
    expected.sort((a, b) => a.dueOn.localeCompare(b.dueOn) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    const api = await repo.listCommitmentsDueBetween(ctx, from, to);
    expect(api.map((c) => c.id)).toEqual(expected.map((c) => c.id));
    expect(api).toEqual(expected);
    return api;
  };
  const review = async (today: IsoDate) => {
    const r = await loadReturnReview(at(today), ctx, today);
    return r;
  };
  /** Linhas da revisão de uma série (todas as de meses fechados e do mês atual). */
  const rowsOf = (rv: ReturnReview, s: CommitmentSeries) =>
    [...rv.months.flatMap((m) => m.rows), ...rv.current.rows].filter((r) => r.series?.id === s.id);
  const rowAt = (rv: ReturnReview, s: CommitmentSeries, n: number) => rowsOf(rv, s).find((r) => r.series!.number === n)!;
  /** I1: conta paga se e somente se há gasto vivo vinculado, com o mesmo valor, data e conta. */
  const checkPaid = async (c: Commitment, today = R1) => {
    expect(c.status).toBe('quitado');
    const r = (await at(today).getRecord(c.payment!.recordId))!;
    expect([r.kind, r.commitmentId, r.amountCents, r.occurredOn, r.accountId]).toEqual([
      'despesa',
      c.id,
      c.payment!.amountCents,
      c.payment!.paidOn,
      c.payment!.accountId,
    ]);
  };
  /** "Já paguei" pela revisão: em aberto, paga; sem conta registrada, cria (K1) e paga (K2). */
  const paid = async (row: ReviewRow, amountCents = row.amountCents, paidOn = row.dueOn) => {
    const repo = at(R1);
    const target = row.commitment ?? (await repo.createSeriesOccurrence(newOperationKey(), row.series!.id, row.seriesVersion!, row.series!.number, 'aberta')).commitment;
    const w = await repo.payCommitment(newOperationKey(), target.id, target.version, payment(amountCents, paidOn, row.category));
    await checkPaid(w.commitment);
    return w.commitment;
  };

  beforeAll(async () => {
    const space = (await at(SETUP).getSpace())!;
    ctx = space.personalContextId;
    account = space.accounts[0]!.id;
  });

  it('montagem em 20/05/2033: a primeira anotação depois de anos grava a ausência; gerar e ler não mexem na atividade', async () => {
    const before = await at(SETUP).getReturnReviewState(ctx);
    expect(before.mark).toBeNull();
    const last = before.activity!.lastWriteOn;
    expect(last < '2031-01-01').toBe(true);
    // A revisão de quem não anota há anos começa no corte de 11 meses (sem nenhuma anotação nova ainda).
    const window = returnWindow(before, SETUP)!;
    expect([window.kind, window.anchor, window.fromMonth, window.toMonth, window.cutBefore]).toEqual(['ausencia', last, '2032-06', '2033-04', '2032-06']);
    await checkedSync(ANA, ctx, SETUP);
    expect(await at(SETUP).getReturnReviewState(ctx)).toEqual(before);

    aluguel = (await at(SETUP).createSeries(newOperationKey(), ctx, monthly('Aluguel', 2500, 5))).series;
    // Primeira anotação depois da ausência longa: de `last` a 20/05/2033.
    expect((await at(SETUP).getReturnReviewState(ctx)).activity).toEqual({ lastWriteOn: SETUP, absenceFromOn: last, absenceUntilOn: SETUP });
    luz = (await at(SETUP).createSeries(newOperationKey(), ctx, monthly('Luz', 180, 12, 'variavel'))).series;
    const carroW = await at(SETUP).createSeries(newOperationKey(), ctx, {
      kind: 'parcelada',
      nature: 'financiamento',
      description: 'Financiamento do carro',
      category: 'Transporte',
      amountCents: 85000,
      amountMode: 'fixo',
      dueDay: 10,
      firstDueMonth: '2033-05',
      firstNumber: 8,
      installmentTotal: 48,
      partsPerYear: null,
      lastMonth: null,
    });
    carro = carroW.series;
    academia = (await at(SETUP).createSeries(newOperationKey(), ctx, monthly('Academia', 120, 15, 'fixo', 'Saúde'))).series;
    expect(carroW.occurrences.map((c) => [c.series!.number, c.dueOn])).toEqual([
      [8, '2033-05-10'],
      [9, '2033-06-10'],
    ]);
    const occ = async (s: CommitmentSeries, n: number) => byNumber(await at(SETUP).listSeriesOccurrences(s.id), n);
    const pay = (c: Commitment, amountCents: Cents) => at(SETUP).payCommitment(newOperationKey(), c.id, c.version, payment(amountCents, c.dueOn));
    await pay(await occ(aluguel, 1), 250000);
    await pay(await occ(luz, 1), 16530);
    await pay(await occ(carro, 8), 85000);
    await pay(await occ(academia, 1), 12000);
    await record(SETUP, 'receita', 'Salário', 600000, '2033-05-01');
    await record(SETUP, 'despesa', 'Mercado', 125000, '2033-05-15');
    expect(await month('2033-05', SETUP)).toEqual([600000, 488530, 111470]);
    await overviewMatchesCore('2033-05', '2033-05', SETUP);
    // Nenhuma anotação nova muda as pontas da ausência; ninguém além de Ana lê a atividade dela.
    expect((await at(SETUP).getReturnReviewState(ctx)).activity).toEqual({ lastWriteOn: SETUP, absenceFromOn: last, absenceUntilOn: SETUP });
    expect(await bruno.getReturnReviewState(ctx)).toEqual({ activity: null, mark: null });
  });

  it('R1 em 07/10/2033: revisão "ausência" de maio a setembro, igual ao core; lacunas de julho e agosto; progresso do carro', async () => {
    await checkedSync(ANA, ctx, R1);
    const { state, review: rv } = await review(R1);
    expect(state.activity!.lastWriteOn).toBe(SETUP);
    const w = rv!.window;
    expect([w.kind, w.anchor, w.returnedOn, w.fromMonth, w.toMonth, w.currentMonth, w.cutBefore]).toEqual([
      'ausencia',
      SETUP,
      null,
      '2033-05',
      '2033-09',
      '2033-10',
      null,
    ]);
    expect(returnBannerText(rv!)!.body).toMatch(/^Sua última anotação foi em 20\/05\/2033\. Desde então: /);
    // Paridade: as três leituras da revisão pela API são as do core sobre as listas de sempre.
    const overview = await overviewMatchesCore('2033-05', '2033-09');
    const commitments = await dueBetweenMatches('2033-05', '2033-10');
    const series = await at(R1).listSeries(ctx);
    expect(rv).toEqual(buildReturnReview(w, overview, commitments, series, R1));
    expect(overview.map((o) => [o.month, o.receivedCount, o.receivedCents, o.paidCount, o.paidCents])).toEqual([
      ['2033-05', 1, 600000, 5, 488530],
      ['2033-06', 0, 0, 0, 0],
      ['2033-07', 0, 0, 0, 0],
      ['2033-08', 0, 0, 0, 0],
      ['2033-09', 0, 0, 0, 0],
    ]);

    // Séries da sequência R: junho e setembro em aberto, julho e agosto sem conta registrada, outubro com o Aluguel vencido.
    const states = (s: CommitmentSeries) => rowsOf(rv!, s).map((r) => [r.series!.number, r.state, r.dueOn, r.amountCents, r.amountIsEstimate]);
    expect(states(aluguel)).toEqual([
      [2, 'aberta', '2033-06-05', 250000, false],
      [3, 'sem_conta', '2033-07-05', 250000, false],
      [4, 'sem_conta', '2033-08-05', 250000, false],
      [5, 'aberta', '2033-09-05', 250000, false],
      [6, 'aberta', '2033-10-05', 250000, false],
    ]);
    expect(states(luz)).toEqual([
      [2, 'aberta', '2033-06-12', 18000, true],
      [3, 'sem_conta', '2033-07-12', 18000, true],
      [4, 'sem_conta', '2033-08-12', 18000, true],
      [5, 'aberta', '2033-09-12', 18000, true],
    ]);
    expect(states(carro).map(([n, st, due]) => [n, st, due])).toEqual([
      [9, 'aberta', '2033-06-10'],
      [10, 'sem_conta', '2033-07-10'],
      [11, 'sem_conta', '2033-08-10'],
      [12, 'aberta', '2033-09-10'],
    ]);
    expect(rowAt(rv!, carro, 10).label).toBe('Parcela 10 de 48');
    expect(rowAt(rv!, aluguel, 6).month).toBe('2033-10');
    // seriesGapsInRange sobre listSeries e listCommitmentsDueBetween: as mesmas lacunas da revisão.
    for (const s of [aluguel, luz, carro, academia]) {
      const live = series.find((x) => x.id === s.id)!;
      expect(seriesGapsInRange(live, commitments, '2033-05', '2033-09')).toEqual(rowsOf(rv!, s).filter((r) => r.state === 'sem_conta'));
    }

    // Carro: pagas antes 7, no Clarevo 1, sem conta registrada 2, faltam 38.
    const c = (await at(R1).getSeries(carro.id))!;
    const occ = await at(R1).listSeriesOccurrences(carro.id);
    const open = await at(R1).listOpenSeriesOccurrences(carro.id);
    const progress = installmentProgress(c, occ, open, R1);
    expect([progress.paidBefore, progress.paidInApp, missingMonths(c, occ, R1).length, progress.remaining]).toEqual([7, 1, 2, 38]);
    await checkedToPay(ANA, ctx, '2033-10', R1);
  });

  it('create_series_occurrence: cada lacuna é aceita, com a vigência do número; número que não é lacuna dá ocorrencia_existente', async () => {
    const rv = (await review(R1)).review!;
    const repo = at(R1);
    // Academia: "Não houve" em julho e agosto grava os números 3 e 4 como excluídos só naquele mês.
    for (const n of [3, 4]) {
      const row = rowAt(rv, academia, n);
      const w = await repo.createSeriesOccurrence(newOperationKey(), academia.id, row.seriesVersion!, n, 'nao_houve');
      expect([w.commitment.series!.number, w.commitment.dueOn, w.commitment.status, w.record]).toEqual([n, row.dueOn, 'aberto', null]);
    }
    const ac = (await repo.getSeries(academia.id))!;
    expect(ac.skippedNumbers).toEqual([3, 4]);
    expect(ac.version).toBe(academia.version);
    expect(seriesGapsInRange(ac, await repo.listCommitmentsDueBetween(ctx, '2033-05', '2033-10'), '2033-05', '2033-09')).toEqual([]);

    // "Ainda não paguei" na Luz de agosto: a conta fica em aberto, com a vigência do número (estimada) e a autoria da série.
    const luzAug = rowAt(rv, luz, 4);
    const open = (await repo.createSeriesOccurrence(newOperationKey(), luz.id, luzAug.seriesVersion!, 4, 'aberta')).commitment;
    expect([open.series!.number, open.dueOn, open.amountCents, open.amountIsEstimate, open.description, open.category, open.status, open.version, open.createdBy, open.payment]).toEqual([
      4,
      '2033-08-12',
      18000,
      true,
      'Luz',
      'Moradia',
      'aberto',
      1,
      luz.createdBy,
      null,
    ]);

    // Número que já tem conta (viva, paga, em aberto ou excluída só naquele mês): ocorrencia_existente, com chave nova.
    expect(await err(repo.createSeriesOccurrence(newOperationKey(), academia.id, academia.version, 3, 'aberta'))).toBe('ocorrencia_existente');
    expect(await err(repo.createSeriesOccurrence(newOperationKey(), luz.id, luz.version, 4, 'aberta'))).toBe('ocorrencia_existente');
    expect(await err(repo.createSeriesOccurrence(newOperationKey(), aluguel.id, aluguel.version, 5, 'aberta'))).toBe('ocorrencia_existente');
    expect(await err(repo.createSeriesOccurrence(newOperationKey(), aluguel.id, aluguel.version, 1, 'aberta'))).toBe('ocorrencia_existente');
    // Mês atual e seguinte: mes_fora_da_revisao (antes de conferir se existe); antes do primeiro número: numero_fora_da_serie.
    expect(await err(repo.createSeriesOccurrence(newOperationKey(), aluguel.id, aluguel.version, 6, 'aberta'))).toBe('mes_fora_da_revisao');
    expect(await err(repo.createSeriesOccurrence(newOperationKey(), aluguel.id, aluguel.version, 7, 'aberta'))).toBe('mes_fora_da_revisao');
    expect(await err(repo.createSeriesOccurrence(newOperationKey(), carro.id, carro.version, 7, 'aberta'))).toBe('numero_fora_da_serie');
    expect(await err(repo.createSeriesOccurrence(newOperationKey(), aluguel.id, aluguel.version + 1, 3, 'aberta'))).toBe('versao_desatualizada');
    expect(await err(repo.createSeriesOccurrence(newOperationKey(), aluguel.id, aluguel.version, 3, 'talvez' as OccurrenceMode))).toBe('modo_invalido');
    // Outra pessoa: a série de Ana não existe para Bruno.
    expect(await err(bruno.createSeriesOccurrence(newOperationKey(), aluguel.id, aluguel.version, 3, 'aberta'))).toBe('nao_encontrado');
    expect(await err(bruno.monthsOverview(ctx, '2033-05', '2033-09'))).toBe('sem_permissao');
    expect(await bruno.listCommitmentsDueBetween(ctx, '2033-05', '2033-10')).toEqual([]);
    // Período inválido antes da permissão (como em month_totals).
    expect(await err(repo.monthsOverview(ctx, '2032-09', '2033-09'))).toBe('periodo_invalido');
    expect(await err(repo.monthsOverview(ctx, '2033-09', '2033-05'))).toBe('periodo_invalido');
    expect(await err(bruno.monthsOverview(ctx, '2032-09', '2033-09'))).toBe('periodo_invalido');
  });

  it('reconciliação depois de falha de rede: findCommitmentOperation reconhece criar_ocorrencia; repetir a chave devolve a mesma conta', async () => {
    const rv = (await review(R1)).review!;
    const row = rowAt(rv, carro, 11);
    expect(row.state).toBe('sem_conta');
    const key = newOperationKey();
    const lost = new SupabaseRepository(clientFor(ANA, R1, lostResponse), { id: ANA });
    expect(await err(lost.createSeriesOccurrence(key, carro.id, row.seriesVersion!, 11, 'aberta'))).toBe('rede');
    const repo = at(R1);
    const op = (await repo.findCommitmentOperation(key))!;
    expect([op.action, op.recordId]).toEqual(['criar_ocorrencia', null]);
    expect(await repo.findSeriesOperation(key)).toBeNull();
    expect(await repo.findOperation(key)).toBeNull();
    const created = (await repo.getCommitment(op.commitmentId))!;
    expect([created.series!.number, created.dueOn, created.amountCents, created.status]).toEqual([11, '2033-08-10', 85000, 'aberto']);
    const again = await repo.createSeriesOccurrence(key, carro.id, row.seriesVersion!, 11, 'aberta');
    expect(again.commitment).toEqual(created);
    expect(await err(repo.createSeriesOccurrence(key, carro.id, row.seriesVersion!, 11, 'nao_houve'))).toBe('chave_reutilizada');
    // Depois de pagar, a repetição devolve o estado atual (paga), sem criar outra conta; I1 vale.
    const w = await repo.payCommitment(newOperationKey(), created.id, created.version, payment(85000, created.dueOn, 'Transporte'));
    await checkPaid(w.commitment);
    expect((await repo.createSeriesOccurrence(key, carro.id, row.seriesVersion!, 11, 'aberta')).commitment).toEqual(w.commitment);
  });

  it('R5 · Atualizar agora: mês a mês, como a tela; totais da sequência R e decisão "atualizou"', async () => {
    let rv = (await review(R1)).review!;
    // Junho: lote (Aluguel e carro em aberto), Luz 171,90 e Salário com "Dia" 1.
    await paid(rowAt(rv, aluguel, 2));
    await paid(rowAt(rv, carro, 9));
    await paid(rowAt(rv, luz, 2), 17190);
    await record(R1, 'receita', 'Salário', 600000, '2033-06-01');
    // Julho: lote com criação, Luz 179,90 criada e paga, Salário.
    await paid(rowAt(rv, aluguel, 3));
    await paid(rowAt(rv, carro, 10));
    await paid(rowAt(rv, luz, 3), 17990);
    await record(R1, 'receita', 'Salário', 600000, '2033-07-01');
    // Agosto: lote (carro já pago na reconciliação); Luz "Ainda não paguei" já registrada; recebimentos pulados.
    await paid(rowAt(rv, aluguel, 4));
    // Setembro e este mês.
    await paid(rowAt(rv, aluguel, 5));
    await paid(rowAt(rv, carro, 12));
    await paid(rowAt(rv, luz, 5), 19420);
    await record(R1, 'receita', 'Salário', 600000, '2033-09-01');
    await paid(rowAt(rv, aluguel, 6));

    expect(await month('2033-06')).toEqual([600000, 352190, 247810]);
    expect(await month('2033-07')).toEqual([600000, 352990, 247010]);
    expect(await month('2033-08')).toEqual([0, 335000, -335000]);
    expect(await month('2033-09')).toEqual([600000, 354420, 245580]);
    expect((await month('2033-10'))[1]).toBe(250000);
    await overviewMatchesCore('2033-05', '2033-09');
    await dueBetweenMatches('2033-05', '2033-10');
    expect(emptyMonthCaption(summarizeMonth(await at(R1).listRecords(ctx, '2033-08'), ctx, '2033-08'), '2033-08', '2033-10')).toBe(
      'Nenhum recebimento anotado em agosto.',
    );

    // Carro: pagas antes 7, no Clarevo 5, sem conta 0, faltam 36; parcela 13 em 10/10/2033; última em 10/09/2036.
    const c = (await at(R1).getSeries(carro.id))!;
    const occ = await at(R1).listSeriesOccurrences(carro.id);
    const open = await at(R1).listOpenSeriesOccurrences(carro.id);
    const progress = installmentProgress(c, occ, open, R1);
    expect([c.paidCount, progress.paidBefore, progress.paidInApp, missingMonths(c, occ, R1).length, progress.remaining, progress.lastDueOn]).toEqual([
      5,
      7,
      5,
      0,
      36,
      '2036-09-10',
    ]);
    expect(byNumber(open, 13).dueOn).toBe('2033-10-10');

    // Depois das ações, a revisão é "volta" (a primeira anotação depois da ausência foi hoje), com a mesma âncora.
    const after = await review(R1);
    rv = after.review!;
    expect([rv.window.kind, rv.window.anchor, rv.window.returnedOn]).toEqual(['volta', SETUP, R1]);
    expect(after.state.activity).toEqual({ lastWriteOn: R1, absenceFromOn: SETUP, absenceUntilOn: R1 });
    // Das séries da sequência, continuam para conferir só contas em aberto (Luz de agosto e Academia de junho e
    // setembro); nenhuma lacuna.
    expect([aluguel, luz, carro, academia].flatMap((s) => rowsOf(rv, s)).map((r) => [r.description, r.state, r.dueOn])).toEqual([
      ['Luz', 'aberta', '2033-08-12'],
      ['Academia', 'aberta', '2033-06-15'],
      ['Academia', 'aberta', '2033-09-15'],
    ]);
    await checkedToPay(ANA, ctx, '2033-10', R1);

    // Concluir: decide 'atualizou' com o último mês fechado; a revisão some e a atividade não muda.
    const key = newOperationKey();
    const mark = await at(R1).decideReturnReview(key, ctx, reviewExpectedVersion(after.state), lastClosedMonth(R1), reviewDecision(true));
    expect(mark).toEqual({ reviewedThrough: '2033-09', decision: 'atualizou', decidedOn: R1, version: 1 });
    expect(await at(R1).getReturnReviewState(ctx)).toEqual({ activity: after.state.activity, mark });
    expect((await review(R1)).review).toBeNull();
    // Repetição devolve a marca atual; mesma chave com outro pedido é recusada.
    expect(await at(R1).decideReturnReview(key, ctx, 0, '2033-09', 'atualizou')).toEqual(mark);
    expect(await err(at(R1).decideReturnReview(key, ctx, 0, '2033-09', 'seguiu'))).toBe('chave_reutilizada');
  });

  it('R6 · decisão: versão, mês e decisão conferidos; o mês revisado nunca recua; só a própria pessoa decide e lê', async () => {
    const repo = at(R1);
    expect(await err(repo.decideReturnReview(newOperationKey(), ctx, 0, '2033-09', 'seguiu'))).toBe('versao_desatualizada');
    expect(await err(repo.decideReturnReview(newOperationKey(), ctx, 1, '2033-10', 'seguiu'))).toBe('mes_invalido');
    expect(await err(repo.decideReturnReview(newOperationKey(), ctx, 1, '2032-10', 'seguiu'))).toBe('mes_invalido');
    expect(await err(repo.decideReturnReview(newOperationKey(), ctx, 1, '2033-09', 'talvez' as ReturnDecision))).toBe('decisao_invalida');
    expect(await err(bruno.decideReturnReview(newOperationKey(), ctx, 1, '2033-09', 'seguiu'))).toBe('sem_permissao');
    // Seguir com agosto: reviewed_through continua setembro; a versão sobe.
    const mark = await repo.decideReturnReview(newOperationKey(), ctx, 1, '2033-08', 'seguiu');
    expect(mark).toEqual({ reviewedThrough: '2033-09', decision: 'seguiu', decidedOn: R1, version: 2 });
    expect((await repo.getReturnReviewState(ctx)).mark).toEqual(mark);
    expect(await bruno.getReturnReviewState(ctx)).toEqual({ activity: null, mark: null });
    // A marca de Bruno no próprio espaço é dele (começa na versão 0); a de Ana não aparece para ele.
    const brunoCtx = (await bruno.getSpace())!.personalContextId;
    expect((await bruno.getReturnReviewState(brunoCtx)).mark).toBeNull();
  });

  it('R3 e R4: nova anotação logo depois da decisão não traz a faixa; 45 dias depois, a revisão volta só com outubro', async () => {
    await record(OCT15, 'despesa', 'Mercado', 30000, OCT15);
    const r3 = await review(OCT15);
    expect(r3.state.activity).toEqual({ lastWriteOn: OCT15, absenceFromOn: SETUP, absenceUntilOn: R1 });
    expect(r3.review).toBeNull();
    await checkedSync(ANA, ctx, NOV29);
    const r4 = (await review(NOV29)).review!;
    const w = r4.window;
    expect([w.kind, w.anchor, w.fromMonth, w.toMonth, w.cutBefore]).toEqual(['ausencia', OCT15, '2033-10', '2033-10', null]);
    expect(r4.months.map((m) => m.month)).toEqual(['2033-10']);
    // Academia: os números excluídos só naquele mês nunca voltam, nem com a geração de novembro.
    const academiaRows = await at(NOV29).listCommitmentsDueBetween(ctx, '2033-07', '2033-08');
    expect(academiaRows.filter((c) => c.series?.id === academia.id)).toEqual([]);
    expect((await at(NOV29).getSeries(academia.id))!.skippedNumbers).toEqual([3, 4]);
  });
});

describe('conversor da revisão dos últimos meses', () => {
  // Sem rede: os argumentos das funções do Ciclo A4 e a leitura das linhas (mês AAAA-MM-01 ↔ AAAA-MM).
  const calls: [string, Record<string, unknown>][] = [];
  const mark = { reviewed_through: '2026-09-01', decision: 'seguiu', decided_on: '2026-10-07', version: 1 };
  const fake = (activity: object | null, review: object | null) => {
    const db = {
      from: (table: string) => {
        const query = {
          select: () => query,
          eq: () => query,
          maybeSingle: async () => ({ data: table === 'context_activity' ? activity : review, error: null }),
        };
        return query;
      },
      rpc: async (fn: string, args: Record<string, unknown>) => {
        calls.push([fn, args]);
        if (fn === 'months_overview') return { data: [{ month: '2026-05-01', received_count: 1, received_cents: 600000, paid_count: 4, paid_cents: 476530 }], error: null };
        if (fn === 'decide_return_review') return { data: { person_id: 'p1', context_id: 'ctx', ...mark, created_at: 'x', updated_at: 'x' }, error: null };
        return { data: null, error: { message: 'ocorrencia_existente', code: 'PT409' } };
      },
    };
    return new SupabaseRepository(db as unknown as SupabaseClient, { id: 'p1' });
  };
  const failure = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => (e instanceof RepoError ? [e.code, e.message] : String(e)));

  it('atividade e marca: datas do banco, mês revisado como AAAA-MM; sem linha, null', async () => {
    const activity = { last_write_on: '2026-10-07', absence_from_on: '2026-05-20', absence_until_on: '2026-10-07' };
    expect(await fake(activity, mark).getReturnReviewState('ctx')).toEqual({
      activity: { lastWriteOn: '2026-10-07', absenceFromOn: '2026-05-20', absenceUntilOn: '2026-10-07' },
      mark: { reviewedThrough: '2026-09', decision: 'seguiu', decidedOn: '2026-10-07', version: 1 },
    });
    expect(await fake(null, null).getReturnReviewState('ctx')).toEqual({ activity: null, mark: null });
    // Ausência com uma ponta só, mês revisado fora do dia 1 ou decisão desconhecida: recusados (nunca uma faixa errada).
    expect(await failure(fake({ ...activity, absence_until_on: null }, null).getReturnReviewState('ctx'))).toEqual(['desconhecido', 'atividade_inconsistente']);
    expect(await failure(fake(null, { ...mark, reviewed_through: '2026-09-15' }).getReturnReviewState('ctx'))).toEqual(['desconhecido', 'revisao_inconsistente']);
    expect(await failure(fake(null, { ...mark, decision: 'talvez' }).getReturnReviewState('ctx'))).toEqual(['desconhecido', 'revisao_inconsistente']);
  });

  it('argumentos: meses como AAAA-MM-01; create_series_occurrence com os cinco parâmetros; códigos novos reconhecidos', async () => {
    calls.length = 0;
    const repo = fake(null, null);
    expect(await repo.monthsOverview('ctx', '2026-05', '2026-09')).toEqual([
      { month: '2026-05', receivedCount: 1, receivedCents: 600000, paidCount: 4, paidCents: 476530 },
    ]);
    expect(await repo.decideReturnReview('chave-0007', 'ctx', 0, '2026-09', 'seguiu')).toEqual({
      reviewedThrough: '2026-09',
      decision: 'seguiu',
      decidedOn: '2026-10-07',
      version: 1,
    });
    expect(await failure(repo.createSeriesOccurrence('chave-0008', 's1', 3, 7, 'nao_houve'))).toEqual(['ocorrencia_existente', 'ocorrencia_existente']);
    expect(calls).toEqual([
      ['months_overview', { p_context_id: 'ctx', p_from: '2026-05-01', p_to: '2026-09-01' }],
      ['decide_return_review', { p_idempotency_key: 'chave-0007', p_context_id: 'ctx', p_expected_version: 0, p_reviewed_through: '2026-09-01', p_decision: 'seguiu' }],
      ['create_series_occurrence', { p_idempotency_key: 'chave-0008', p_series_id: 's1', p_expected_version: 3, p_number: 7, p_mode: 'nao_houve' }],
    ]);
  });
});

// ---------------------------------------------------------------------------
// Ciclo B · renda comprometida (D-026)
// ---------------------------------------------------------------------------

/** Linha de month_committed pela API (bigint como número; datas AAAA-MM-DD). */
interface CommittedRow {
  fixed_cents: number;
  annual_cents: number;
  installment_cents: number;
  debt_cents: number;
  other_cents: number;
  committed_cents: number;
  paid_part_cents: number;
  open_part_cents: number;
  estimated_open_cents: number;
  overdue_before_cents: number;
  reference_cents: number | null;
  reference_from: string | null;
  reference_varies: boolean | null;
  outside_cents: number | null;
  committed_permille: number | null;
  debt_permille: number | null;
  fixed_permille: number | null;
  annual_permille: number | null;
  installment_permille: number | null;
  other_permille: number | null;
}

/**
 * Os números de um mês, em quatro grupos: [fixos, contas do ano, parcelamentos, dívidas, outras, comprometido],
 * [pago, em aberto, estimado, vencidas antes], [referência, a partir de, fora dos compromissos] e os milésimos
 * [comprometido, dívidas, fixos, contas do ano, parcelamentos, outras].
 */
const committedShape = (s: CommittedSummary) => [
  [s.fixedCents, s.annualCents, s.installmentCents, s.debtCents, s.otherCents, s.committedCents],
  [s.paidPartCents, s.openPartCents, s.estimatedOpenCents, s.overdueBeforeCents],
  [s.referenceCents, s.referenceFrom, s.outsideCents],
  [s.committedPermille, s.debtPermille, s.fixedPermille, s.annualPermille, s.installmentPermille, s.otherPermille],
];

const NO_PERMILLE = [null, null, null, null, null, null];

describe('API real: renda comprometida (Ciclo B, D-026)', () => {
  // Bruno refaz a demonstração um ano antes dos blocos anteriores (hoje 07/10/2025), num período em que ele não tem nenhum
  // dado: os números da spec (52,5%, 63,8%, 69,0%...) valem em qualquer ano, e os de 2026 em diante dos outros blocos ficam
  // fora do mês, dos próximos meses e das sugestões. Ana é a pessoa de fora. Pessoas e contas fictícias.
  const T0 = '2025-10-07';
  const AUG = '2025-08';
  const SEP = '2025-09';
  const OCT = '2025-10';
  const NOV = '2025-11';
  const at = (today: IsoDate = T0) => repoFor(BRUNO, today);
  const ana = repoFor(ANA, T0);
  let ctx = '';
  let account = '';
  let internet: Commitment;
  let aluguel: CommitmentSeries;
  let refSep: IncomeReference;
  // O que a sequência acrescenta à base e a limpeza final desfaz.
  let conserto: Commitment;
  let gas: Commitment;
  let aluguelNov: Commitment;
  let mercado200: FinancialRecord;
  let cafe: FinancialRecord;

  const record = (kind: RecordKind, description: string, reais: number, occurredOn: IsoDate, category: string | null) =>
    at().createRecord(newOperationKey(), ctx, kind, { accountId: account, amountCents: cents(reais), occurredOn, description, category });
  const pay = (c: Commitment, amountCents: Cents, paidOn: IsoDate) =>
    at().payCommitment(newOperationKey(), c.id, c.version, { accountId: account, amountCents, paidOn, category: 'Moradia' });
  const setRef = (fromMonth: IsoMonth, expectedVersion: number, reais: number, varies = false) =>
    at().setIncomeReference(newOperationKey(), ctx, fromMonth, expectedVersion, cents(reais), varies);
  const totals = async (month: IsoMonth) => {
    const s = summarizeMonth(await at().listRecords(ctx, month), ctx, month);
    return [s.receivedCents, s.paidCents, s.differenceCents];
  };

  /**
   * month_committed pela API é igual ao summarizeCommitted do core sobre as leituras do app (campo a campo, inclusive os
   * milésimos de cada grupo), e a identidade com "Ainda a pagar" vale: comprometido = pagas do mês + em aberto do mês.
   */
  const committed = async (month: IsoMonth, today: IsoDate = T0) => {
    const repo = at(today);
    const list = await repo.listCommitments(ctx, month);
    const s = summarizeCommitted(list, ctx, month, today, await repo.listIncomeReferences(ctx), await repo.listSeries(ctx));
    const { data, error } = await clientFor(BRUNO, today).rpc('month_committed', { p_context_id: ctx, p_month: `${month}-01` }).single();
    expect(error).toBeNull();
    const r = data as CommittedRow;
    const n = (v: number | null) => (v === null ? null : Number(v));
    expect({
      fixed: n(r.fixed_cents),
      annual: n(r.annual_cents),
      installment: n(r.installment_cents),
      debt: n(r.debt_cents),
      other: n(r.other_cents),
      committed: n(r.committed_cents),
      paid: n(r.paid_part_cents),
      open: n(r.open_part_cents),
      estimated: n(r.estimated_open_cents),
      overdueBefore: n(r.overdue_before_cents),
      reference: n(r.reference_cents),
      referenceFrom: r.reference_from === null ? null : r.reference_from.slice(0, 7),
      referenceVaries: r.reference_varies,
      outside: n(r.outside_cents),
      permille: [n(r.committed_permille), n(r.debt_permille), n(r.fixed_permille), n(r.annual_permille), n(r.installment_permille), n(r.other_permille)],
    }).toEqual({
      fixed: s.fixedCents,
      annual: s.annualCents,
      installment: s.installmentCents,
      debt: s.debtCents,
      other: s.otherCents,
      committed: s.committedCents,
      paid: s.paidPartCents,
      open: s.openPartCents,
      estimated: s.estimatedOpenCents,
      overdueBefore: s.overdueBeforeCents,
      reference: s.referenceCents,
      referenceFrom: s.referenceFrom,
      referenceVaries: s.reference?.varies ?? null,
      outside: s.outsideCents,
      permille: [s.committedPermille, s.debtPermille, s.fixedPermille, s.annualPermille, s.installmentPermille, s.otherPermille],
    });
    const toPay = await checkedToPay(BRUNO, ctx, month, today);
    const paidOfMonth = list.filter((c) => monthOf(c.dueOn) === month && c.status === 'quitado').reduce((sum, c) => sum + c.payment!.amountCents, 0);
    expect(s.committedCents).toBe(paidOfMonth + toPay.dueInMonthCents);
    expect(s.paidPartCents).toBe(paidOfMonth);
    expect(s.openPartCents).toBe(toPay.dueInMonthCents);
    expect(s.overdueBeforeCents).toBe(toPay.overdueBeforeCents);
    expect(s.overReference).toBe(s.outsideCents !== null && s.outsideCents < 0);
    return s;
  };
  /** Paridade com o banco e os números esperados do mês (committedShape). */
  const expectMonth = async (month: IsoMonth, shape: unknown[][], today: IsoDate = T0) => {
    const s = await committed(month, today);
    expect(committedShape(s)).toEqual(shape);
    return s;
  };

  beforeAll(async () => {
    const space = (await at().getSpace())!;
    ctx = space.personalContextId;
    account = space.accounts[0]!.id;
    expect(await at().listRecords(ctx, SEP)).toEqual([]);
    expect(await at().listCommitmentsDueBetween(ctx, '2025-07', '2025-12')).toEqual([]);
    expect(await at().listIncomeReferences(ctx)).toEqual([]);
  });

  it('sem referência nem contas: uma linha de zeros e nenhum percentual; a base da demonstração tem a renda sem referência', async () => {
    expect(await at().listIncomeReferences(ctx)).toEqual([]);
    const zero = [[0, 0, 0, 0, 0, 0], [0, 0, 0, 0], [null, null, null], NO_PERMILLE];
    await expectMonth(OCT, zero);

    await record('receita', 'Salário', 6000, '2025-09-01', 'Salário');
    await record('despesa', 'Aluguel', 2500, '2025-09-05', 'Moradia');
    await record('despesa', 'Mercado', 1250, '2025-09-12', 'Mercado');
    await record('receita', 'Salário', 6000, '2025-10-01', 'Salário');
    await record('despesa', 'Mercado', 1400, '2025-10-06', 'Mercado');
    const series = (input: Partial<SeriesInput> & Pick<SeriesInput, 'kind' | 'description' | 'category' | 'amountCents' | 'dueDay' | 'firstDueMonth'>): SeriesInput => ({
      nature: 'conta',
      amountMode: 'fixo',
      firstNumber: 1,
      installmentTotal: null,
      partsPerYear: null,
      lastMonth: null,
      ...input,
    });
    aluguel = (await at().createSeries(newOperationKey(), ctx, series({ kind: 'mensal', description: 'Aluguel', category: 'Moradia', amountCents: 250000, dueDay: 5, firstDueMonth: OCT }))).series;
    await pay(byNumber(await at().listSeriesOccurrences(aluguel.id), 1), 250000, '2025-10-05');
    await at().createSeries(newOperationKey(), ctx, series({ kind: 'mensal', description: 'Luz', category: 'Moradia', amountCents: 18000, amountMode: 'variavel', dueDay: 12, firstDueMonth: NOV }));
    await at().createSeries(
      newOperationKey(),
      ctx,
      series({ kind: 'parcelada', nature: 'financiamento', description: 'Financiamento do carro', category: 'Transporte', amountCents: 85000, dueDay: 10, firstDueMonth: NOV, firstNumber: 13, installmentTotal: 48 }),
    );
    await at().createSeries(newOperationKey(), ctx, series({ kind: 'anual', description: 'IPVA', category: 'Transporte', amountCents: 240000, amountMode: 'variavel', dueDay: 20, firstDueMonth: '2026-01', partsPerYear: 1 }));
    await at().createSeries(newOperationKey(), ctx, series({ kind: 'anual', description: 'IPTU', category: 'Moradia', amountCents: 18000, amountMode: 'variavel', dueDay: 10, firstDueMonth: '2026-02', partsPerYear: 10 }));
    internet = (await at().createCommitment(newOperationKey(), ctx, { description: 'Internet', amountCents: 15000, dueOn: '2025-10-15', category: 'Moradia' })).commitment;
    await at().createCommitment(newOperationKey(), ctx, { description: 'Condomínio', amountCents: 50000, dueOn: '2025-10-20', category: 'Moradia' });
    await at().createCommitment(newOperationKey(), ctx, { description: 'Seguro do carro', amountCents: 30000, dueOn: '2025-11-10', category: 'Transporte' });

    // Base de outubro: Recebido 6.000,00, Pago 3.900,00, Diferença 2.100,00, Ainda a pagar 650,00.
    expect(await totals(OCT)).toEqual([600000, 390000, 210000]);
    const toPay = await checkedToPay(BRUNO, ctx, OCT, T0);
    expect([toPay.toPayCents, toPay.dueInMonthCents, toPay.overdueBeforeCents, toPay.items.length]).toEqual([65000, 65000, 0, 2]);
    // Sem referência: só os valores em reais; a identidade com "Ainda a pagar" vale.
    const s = await expectMonth(OCT, [[250000, 0, 0, 0, 65000, 315000], [250000, 65000, 0, 0], [null, null, null], NO_PERMILLE]);
    expect([s.count, s.items.fixos.length, s.items.outras.length, s.annualShare !== null]).toEqual([3, 1, 2, true]);
  });

  it('referência de R$ 6.000,00 desde setembro: outubro 52,5%, novembro 63,8% com dívidas 14,2% e R$ 180,00 estimados', async () => {
    refSep = await setRef(SEP, 0, 6000);
    expect(refSep).toMatchObject({ contextId: ctx, fromMonth: SEP, amountCents: 600000, varies: false, createdBy: BRUNO, version: 1 });
    expect(await at().listIncomeReferences(ctx)).toEqual([refSep]);
    const oct = await expectMonth(OCT, [[250000, 0, 0, 0, 65000, 315000], [250000, 65000, 0, 0], [600000, SEP, 285000], [525, 0, 417, 0, 0, 108]]);
    expect(formatPermille(oct.committedPermille!, oct.committedCents)).toBe('52,5%');
    const nov = await expectMonth(NOV, [[268000, 0, 85000, 85000, 30000, 383000], [0, 383000, 18000, 0], [600000, SEP, 217000], [638, 142, 447, 0, 142, 50]]);
    expect(formatPermille(nov.committedPermille!, nov.committedCents)).toBe('63,8%');
    // Setembro: o Aluguel anotado como gasto comum não entra. Agosto: nenhuma referência começa até agosto.
    await expectMonth(SEP, [[0, 0, 0, 0, 0, 0], [0, 0, 0, 0], [600000, SEP, 600000], [0, 0, 0, 0, 0, 0]]);
    await expectMonth(AUG, [[0, 0, 0, 0, 0, 0], [0, 0, 0, 0], [null, null, null], NO_PERMILLE]);
    // A referência nunca entra em Recebido, e Pago e Ainda a pagar continuam os da base.
    expect(await totals(OCT)).toEqual([600000, 390000, 210000]);
    expect((await checkedToPay(BRUNO, ctx, OCT, T0)).toPayCents).toBe(65000);
  });

  it('Internet paga com R$ 159,90 (52,7%) e desfeita; Conserto da geladeira (57,5%); Mercado e Gás vencido', async () => {
    const w = await pay(internet, 15990, '2025-10-07');
    await expectMonth(OCT, [[250000, 0, 0, 0, 65990, 315990], [265990, 50000, 0, 0], [600000, SEP, 284010], [527, 0, 417, 0, 0, 110]]);
    expect((await checkedToPay(BRUNO, ctx, OCT, T0)).toPayCents).toBe(50000);
    await at().undoCommitmentPayment(newOperationKey(), w.commitment.id, w.commitment.version);
    await expectMonth(OCT, [[250000, 0, 0, 0, 65000, 315000], [250000, 65000, 0, 0], [600000, SEP, 285000], [525, 0, 417, 0, 0, 108]]);

    conserto = (await at().createCommitment(newOperationKey(), ctx, { description: 'Conserto da geladeira', amountCents: 30000, dueOn: '2025-10-28', category: 'Casa' })).commitment;
    const base = [[250000, 0, 0, 0, 95000, 345000], [250000, 95000, 0, 0], [600000, SEP, 255000], [575, 0, 417, 0, 0, 158]];
    await expectMonth(OCT, base);

    // Gasto comum "Mercado" de R$ 200,00: muda Pago, não o comprometido.
    mercado200 = await record('despesa', 'Mercado', 200, '2025-10-07', 'Mercado');
    await expectMonth(OCT, base);
    expect(await totals(OCT)).toEqual([600000, 410000, 190000]);

    // Gás de R$ 40,00 com vencimento em 28/09: linha à parte em outubro (só no mês de hoje); em setembro, 0,7%.
    gas = (await at().createCommitment(newOperationKey(), ctx, { description: 'Gás', amountCents: 4000, dueOn: '2025-09-28', category: 'Moradia' })).commitment;
    const withGas = [base[0]!, [250000, 95000, 0, 4000], base[2]!, base[3]!];
    const oct = await expectMonth(OCT, withGas);
    expect(oct.overdueBefore.map((c) => c.description)).toEqual(['Gás']);
    await expectMonth(SEP, [[0, 0, 0, 0, 4000, 4000], [0, 4000, 0, 0], [600000, SEP, 596000], [7, 0, 0, 0, 0, 7]]);
    const toPay = await checkedToPay(BRUNO, ctx, OCT, T0);
    expect([toPay.toPayCents, toPay.dueInMonthCents, toPay.overdueBeforeCents, toPay.items.length]).toEqual([99000, 95000, 4000, 4]);
  });

  it('pagar hoje o Aluguel de novembro muda Pago de outubro e nenhum comprometido; previsão dos pagamentos do mês', async () => {
    const forecastBefore = paymentsForecast((await totals(OCT))[1]!, await checkedToPay(BRUNO, ctx, OCT, T0));
    // Pago 4.100,00 + Ainda a pagar 990,00 (inclui o Gás vencido): sem as palavras que o texto da previsão nunca usa.
    expect([forecastBefore!.totalCents, forecastBefore!.estimatedCents]).toEqual([509000, 0]);
    expect(forecastBefore!.text).toBe('Se pagar tudo o que está em aberto, os pagamentos de outubro chegam a R$ 5.090,00.');

    const nov1 = byNumber(await at().listSeriesOccurrences(aluguel.id), 2);
    expect(nov1.dueOn).toBe('2025-11-05');
    aluguelNov = (await pay(nov1, 250000, '2025-10-07')).commitment;
    await expectMonth(OCT, [[250000, 0, 0, 0, 95000, 345000], [250000, 95000, 0, 4000], [600000, SEP, 255000], [575, 0, 417, 0, 0, 158]]);
    await expectMonth(NOV, [[268000, 0, 85000, 85000, 30000, 383000], [250000, 133000, 18000, 0], [600000, SEP, 217000], [638, 142, 447, 0, 142, 50]]);
    expect(await totals(OCT)).toEqual([600000, 660000, -60000]);
  });

  it('referência de R$ 5.000,00 desde outubro: 69,0% e novembro 76,6%; excluir volta à anterior; sem nenhuma, só valores', async () => {
    const refOct = await setRef(OCT, 0, 5000);
    expect((await at().listIncomeReferences(ctx)).map((r) => [r.fromMonth, r.amountCents])).toEqual([[SEP, 600000], [OCT, 500000]]);
    const oct = await expectMonth(OCT, [[250000, 0, 0, 0, 95000, 345000], [250000, 95000, 0, 4000], [500000, OCT, 155000], [690, 0, 500, 0, 0, 190]]);
    expect(formatPermille(oct.committedPermille!, oct.committedCents)).toBe('69,0%');
    await expectMonth(SEP, [[0, 0, 0, 0, 4000, 4000], [0, 4000, 0, 0], [600000, SEP, 596000], [7, 0, 0, 0, 0, 7]]);
    await expectMonth(NOV, [[268000, 0, 85000, 85000, 30000, 383000], [250000, 133000, 18000, 0], [500000, OCT, 117000], [766, 170, 536, 0, 170, 60]]);
    expect(await totals(OCT)).toEqual([600000, 660000, -60000]);

    // Excluir a de outubro: a de setembro volta a valer. A referência excluída sai da leitura.
    const deleted = await at().deleteIncomeReference(newOperationKey(), refOct.id, refOct.version);
    expect([deleted.id, deleted.version]).toEqual([refOct.id, 2]);
    expect(await at().listIncomeReferences(ctx)).toEqual([refSep]);
    await expectMonth(OCT, [[250000, 0, 0, 0, 95000, 345000], [250000, 95000, 0, 4000], [600000, SEP, 255000], [575, 0, 417, 0, 0, 158]]);
    await expectMonth(NOV, [[268000, 0, 85000, 85000, 30000, 383000], [250000, 133000, 18000, 0], [600000, SEP, 217000], [638, 142, 447, 0, 142, 50]]);

    // Excluir também a de setembro: sem percentual e sem "fora dos compromissos"; Pago e Ainda a pagar não mudam.
    await at().deleteIncomeReference(newOperationKey(), refSep.id, refSep.version);
    expect(await at().listIncomeReferences(ctx)).toEqual([]);
    await expectMonth(OCT, [[250000, 0, 0, 0, 95000, 345000], [250000, 95000, 0, 4000], [null, null, null], NO_PERMILLE]);
    await expectMonth(SEP, [[0, 0, 0, 0, 4000, 4000], [0, 4000, 0, 0], [null, null, null], NO_PERMILLE]);
    expect(await totals(OCT)).toEqual([600000, 660000, -60000]);
    expect((await checkedToPay(BRUNO, ctx, OCT, T0)).toPayCents).toBe(99000);
  });

  it('acima de 100% (valor real, fora negativo), exatamente 100% com "minha renda varia" e conta excluída fora', async () => {
    const over = await setRef(OCT, 0, 3000);
    const s115 = await expectMonth(OCT, [[250000, 0, 0, 0, 95000, 345000], [250000, 95000, 0, 4000], [300000, OCT, -45000], [1150, 0, 833, 0, 0, 317]]);
    expect([s115.overReference, formatPermille(s115.committedPermille!, s115.committedCents)]).toEqual([true, '115,0%']);
    const exact = await at().setIncomeReference(newOperationKey(), ctx, OCT, over.version, 345000, true);
    expect([exact.version, exact.varies, exact.amountCents]).toEqual([2, true, 345000]);
    const s100 = await expectMonth(OCT, [[250000, 0, 0, 0, 95000, 345000], [250000, 95000, 0, 4000], [345000, OCT, 0], [1000, 0, 725, 0, 0, 275]]);
    expect([s100.overReference, s100.needsReview, s100.reference?.varies]).toEqual([false, false, true]);
    // Referência "varia" de um mês anterior pede revisão no mês mostrado (nov), sem bloquear o cálculo.
    const nov = await committed(NOV);
    expect([nov.needsReview, nov.referenceFrom, nov.referenceCents]).toEqual([true, OCT, 345000]);
    await at().deleteIncomeReference(newOperationKey(), exact.id, exact.version);

    const extra = (await at().createCommitment(newOperationKey(), ctx, { description: 'Teste', amountCents: 1000, dueOn: '2025-10-25', category: null })).commitment;
    expect((await committed(OCT)).committedCents).toBe(346000);
    await at().deleteCommitment(newOperationKey(), extra.id, extra.version);
    await expectMonth(OCT, [[250000, 0, 0, 0, 95000, 345000], [250000, 95000, 0, 4000], [null, null, null], NO_PERMILLE]);
  });

  it('validação também no banco, com o mesmo código e a mesma ordem do core; limites do intervalo; recusa não gasta a chave', async () => {
    const repo = at();
    const key = newOperationKey();
    // Hoje é 07/10/2025: de outubro de 2023 a outubro de 2026.
    expect(await err(repo.setIncomeReference(key, ctx, '2023-09', 0, 100, false))).toBe('referencia_fora_do_intervalo');
    expect(await err(repo.setIncomeReference(key, ctx, '2026-11', 0, 100, false))).toBe('referencia_fora_do_intervalo');
    expect(await err(repo.setIncomeReference(key, ctx, '2025-10', 0, 0, false))).toBe('valor_invalido');
    expect(await err(repo.setIncomeReference(key, ctx, '2025-10', 0, 1_000_000_000, false))).toBe('valor_acima_do_limite');
    expect(await err(repo.setIncomeReference(key, ctx, '2025-10', 0, 100, null as unknown as boolean))).toBe('tipo_invalido');
    // Versão antes da validação do mês (como em todas as funções de escrita); o detalhe traz a versão atual.
    const first = await setRef(OCT, 0, 1);
    const stale = (await repo.setIncomeReference(newOperationKey(), ctx, OCT, 0, 100, false).catch((e: unknown) => e)) as RepoError;
    expect([stale.code, stale.detail]).toEqual(['versao_desatualizada', 'versao_atual=1']);
    expect(await err(repo.setIncomeReference(newOperationKey(), ctx, OCT, null as unknown as number, 100, false))).toBe('versao_desatualizada');
    expect(await err(repo.setIncomeReference(newOperationKey(), ctx, OCT, 5, 100, false))).toBe('versao_desatualizada');
    expect(await err(repo.deleteIncomeReference(newOperationKey(), first.id, 7))).toBe('versao_desatualizada');
    expect(await err(repo.deleteIncomeReference(newOperationKey(), randomUUID(), 1))).toBe('nao_encontrado');
    await repo.deleteIncomeReference(newOperationKey(), first.id, first.version);
    // Os dois limites são aceitos, e a mesma chave recusada antes ainda vale com argumentos certos (nada foi gravado).
    const low = await repo.setIncomeReference(key, ctx, '2023-10', 0, 100, false);
    expect(low.fromMonth).toBe('2023-10');
    const high = await setRef('2026-10', 0, 1);
    expect(high.fromMonth).toBe('2026-10');
    expect((await repo.listIncomeReferences(ctx)).map((r) => [r.fromMonth, r.amountCents])).toEqual([['2023-10', 100], ['2026-10', 100]]);
    await repo.deleteIncomeReference(newOperationKey(), low.id, low.version);
    await repo.deleteIncomeReference(newOperationKey(), high.id, high.version);
    // Mês fora do dia 1 (o app sempre manda AAAA-MM-01; aqui direto): mes_invalido, também em month_committed.
    const db = clientFor(BRUNO, T0);
    const badDay = await db.rpc('set_income_reference', {
      p_idempotency_key: newOperationKey(),
      p_context_id: ctx,
      p_from_month: '2025-10-15',
      p_expected_version: 0,
      p_amount_cents: 100,
      p_varies: false,
    });
    expect(badDay.error?.message).toBe('mes_invalido');
    expect((await db.rpc('month_committed', { p_context_id: ctx, p_month: '2025-10-15' })).error?.message).toBe('mes_invalido');
    expect(await at().listIncomeReferences(ctx)).toEqual([]);
  });

  it('repetição, chave reutilizada e resultado incerto: repetir a mesma chave reconcilia, sem referência duplicada', async () => {
    const repo = at();
    const key = newOperationKey();
    const a = await repo.setIncomeReference(key, ctx, SEP, 0, 600000, false);
    // Mesma chave e mesmo pedido: a mesma referência. Outro conteúdo, outra ação ou chave de outra operação: chave_reutilizada.
    expect(await repo.setIncomeReference(key, ctx, SEP, 0, 600000, false)).toEqual(a);
    expect(await err(repo.setIncomeReference(key, ctx, SEP, 0, 600001, false))).toBe('chave_reutilizada');
    expect(await err(repo.setIncomeReference(key, ctx, SEP, 0, 600000, true))).toBe('chave_reutilizada');
    expect(await err(repo.deleteIncomeReference(key, a.id, 1))).toBe('chave_reutilizada');
    const recordKey = newOperationKey();
    cafe = await repo.createRecord(recordKey, ctx, 'despesa', { accountId: account, amountCents: 100, occurredOn: '2025-10-07', description: 'Café', category: null });
    expect(await err(repo.setIncomeReference(recordKey, ctx, SEP, 0, 600000, false))).toBe('chave_reutilizada');
    // Depois de alterada, a repetição da primeira chave devolve a linha atual (versão 2), sem gravar de novo.
    const changed = await repo.setIncomeReference(newOperationKey(), ctx, SEP, 1, 650000, false);
    expect(await repo.setIncomeReference(key, ctx, SEP, 0, 600000, false)).toEqual(changed);
    // A alteração conta como mudança da renda de referência no dia em que foi feita (savings.lastIncomeReferenceChange).
    expect(changed.amountChangedAt).not.toBeNull();
    expect(lastIncomeReferenceChange(await repo.listIncomeReferences(ctx))).toBe(changed.amountChangedAt!.slice(0, 10));
    expect(lastIncomeReferenceChange([{ ...changed, amountChangedAt: null }])).toBeNull();

    // A resposta se perde: o app não sabe o resultado. Repetir a mesma chave e o mesmo conteúdo devolve a referência criada.
    const lost = new SupabaseRepository(clientFor(BRUNO, T0, lostResponse), { id: BRUNO });
    const lostKey = newOperationKey();
    expect(await err(lost.setIncomeReference(lostKey, ctx, OCT, 0, 700000, false))).toBe('rede');
    const created = await repo.setIncomeReference(lostKey, ctx, OCT, 0, 700000, false);
    expect((await repo.listIncomeReferences(ctx)).filter((r) => r.fromMonth === OCT)).toEqual([created]);
    expect(created.version).toBe(1);
    // A exclusão perdida também se reconcilia repetindo a chave: devolve a referência já excluída, sem erro.
    const deleteKey = newOperationKey();
    expect(await err(lost.deleteIncomeReference(deleteKey, created.id, 1))).toBe('rede');
    const deleted = await repo.deleteIncomeReference(deleteKey, created.id, 1);
    expect([deleted.id, deleted.version]).toEqual([created.id, 2]);
    // De volta aos R$ 6.000,00 de setembro para os blocos seguintes.
    const restored = await repo.setIncomeReference(newOperationKey(), ctx, SEP, changed.version, 600000, false);
    expect([restored.version, restored.amountCents]).toEqual([3, 600000]);
    expect(await repo.listIncomeReferences(ctx)).toEqual([restored]);
  });

  it('outra pessoa não lê nem altera a referência, nem consulta a renda comprometida; gravação direta é recusada', async () => {
    const mine = (await at().listIncomeReferences(ctx))[0]!;
    expect(await ana.listIncomeReferences(ctx)).toEqual([]);
    expect(await err(ana.setIncomeReference(newOperationKey(), ctx, SEP, 1, 100, false))).toBe('sem_permissao');
    expect(await err(ana.deleteIncomeReference(newOperationKey(), mine.id, mine.version))).toBe('nao_encontrado');
    const db = clientFor(ANA, T0);
    expect((await db.rpc('month_committed', { p_context_id: ctx, p_month: '2025-10-01' }).single()).error?.message).toBe('sem_permissao');
    const direct = await clientFor(BRUNO, T0)
      .from('income_references')
      .insert({ context_id: ctx, from_month: '2025-07-01', amount_cents: 1, varies: false, created_by: BRUNO });
    expect(direct.error).not.toBeNull();
    expect((await clientFor(BRUNO, T0).from('income_references').update({ amount_cents: 1 }).eq('id', mine.id)).error).not.toBeNull();
    expect((await clientFor(BRUNO, T0).from('income_references').delete().eq('id', mine.id)).error).not.toBeNull();
    const anon = await clientFor(null).from('income_references').select('id');
    expect(anon.error !== null || (anon.data ?? []).length === 0).toBe(true);
    expect(await at().listIncomeReferences(ctx)).toEqual([mine]);
    // A referência é lida só pelo Pessoal de quem a criou: Ana não vê a de Bruno, e a de Ana (nenhuma) não aparece para ele.
    expect(await ana.listIncomeReferences((await ana.getSpace())!.personalContextId)).toEqual([]);
  });

  it('Próximos meses: as contas criadas e a previsão das séries; marco da última parcela; sugestão de referência', async () => {
    const repo = at();
    const months = upcomingCommittedMonths(OCT);
    expect(months).toEqual(['2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04']);
    const due = await repo.listCommitmentsDueBetween(ctx, months[0]!, months[5]!);
    const refs = await repo.listIncomeReferences(ctx);
    const series = await repo.listSeries(ctx);
    const projection = projectCommitted(series, due, refs, months, T0);
    // Novembro já tem as contas criadas (o mesmo número de month_committed); dezembro a abril são previsão: 3.530,00 em dezembro
    // (58,8%), 5.930,00 em janeiro com o IPVA (98,8%, contas do ano 40,0%) e 3.710,00 de fevereiro em diante (61,8%).
    expect(projection.months.map((m) => [m.month, m.committedCents, m.committedPermille, m.plannedCents])).toEqual([
      ['2025-11', 383000, 638, 0],
      ['2025-12', 353000, 588, 353000],
      ['2026-01', 593000, 988, 593000],
      ['2026-02', 371000, 618, 371000],
      ['2026-03', 371000, 618, 371000],
      ['2026-04', 371000, 618, 371000],
    ]);
    expect((await committed(NOV)).committedCents).toBe(projection.months[0]!.committedCents);
    expect(projection.months[2]!.annualPermille).toBe(400);
    expect(projection.months[3]!.annualPermille).toBe(30);
    expect(projection.milestones.map((m) => m.text)).toEqual(
      expect.arrayContaining([
        'Janeiro de 2026: IPVA, cerca de R$ 2.400,00.',
        'Fevereiro de 2026: IPTU, 10 parcelas de cerca de R$ 180,00.',
        'Outubro de 2028: última parcela de Financiamento do carro (R$ 850,00).',
      ]),
    );

    // Sugestão: entre os 3 meses fechados anteriores, só setembro tem recebimentos (média de R$ 6.000,00).
    const records = [];
    for (const m of ['2025-07', '2025-08', '2025-09']) records.push(...(await repo.listRecords(ctx, m)));
    expect(suggestReference(records, OCT)).toEqual({ amountCents: 600000, months: [SEP] });
  });

  it('limpeza: desfazer o que a sequência acrescentou volta exatamente à base (52,5% em outubro, 63,8% em novembro)', async () => {
    const repo = at();
    const undone = await repo.undoCommitmentPayment(newOperationKey(), aluguelNov.id, aluguelNov.version);
    expect(undone.commitment.status).toBe('aberto');
    await repo.deleteCommitment(newOperationKey(), conserto.id, conserto.version);
    await repo.deleteCommitment(newOperationKey(), gas.id, gas.version);
    await repo.deleteRecord(newOperationKey(), mercado200.id, mercado200.version);
    await repo.deleteRecord(newOperationKey(), cafe.id, cafe.version);
    expect(await totals(OCT)).toEqual([600000, 390000, 210000]);
    expect((await checkedToPay(BRUNO, ctx, OCT, T0)).toPayCents).toBe(65000);
    await expectMonth(OCT, [[250000, 0, 0, 0, 65000, 315000], [250000, 65000, 0, 0], [600000, SEP, 285000], [525, 0, 417, 0, 0, 108]]);
    await expectMonth(NOV, [[268000, 0, 85000, 85000, 30000, 383000], [0, 383000, 18000, 0], [600000, SEP, 217000], [638, 142, 447, 0, 142, 50]]);
    await expectMonth(SEP, [[0, 0, 0, 0, 0, 0], [0, 0, 0, 0], [600000, SEP, 600000], [0, 0, 0, 0, 0, 0]]);
  });

  it('contas do ano (hoje 05/01/2026): month_committed separa o IPVA e o IPTU, que não são dívida, igual ao core', async () => {
    const JAN5 = '2026-01-05';
    await checkedSync(BRUNO, ctx, JAN5);
    // Janeiro: Aluguel, Luz (estimada), parcela do carro e IPVA (estimado): 5.930,00, 98,8% (contas do ano 40,0%, dívidas 14,2%).
    const jan = await committed('2026-01', JAN5);
    expect([jan.fixedCents, jan.annualCents, jan.installmentCents, jan.debtCents, jan.otherCents, jan.committedCents]).toEqual([268000, 240000, 85000, 85000, 0, 593000]);
    expect([jan.committedPermille, jan.debtPermille, jan.fixedPermille, jan.annualPermille, jan.installmentPermille, jan.otherPermille]).toEqual([988, 142, 447, 400, 142, 0]);
    expect([jan.estimatedOpenCents, jan.outsideCents, jan.overReference]).toEqual([258000, 7000, false]);
    expect(jan.items.anuais.map((c) => [c.description, c.series!.partsPerYear])).toEqual([['IPVA', 1]]);
    // Fevereiro: a 1ª das 10 parcelas do IPTU (3,0%); o IPVA não aparece e nenhuma conta do ano entra em dívidas.
    const feb = await committed('2026-02', JAN5);
    expect([feb.annualCents, feb.debtCents, feb.committedCents, feb.committedPermille, feb.annualPermille]).toEqual([18000, 85000, 371000, 618, 30]);
    expect(feb.items.anuais.map((c) => [c.description, c.series!.partsPerYear])).toEqual([['IPTU', 10]]);
    // A linha informativa das contas do ano (÷ 12) vem das séries, fora do percentual.
    expect(feb.annualShare).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Ciclo C · metas e reserva para imprevistos (D-027)
// ---------------------------------------------------------------------------

describe('API real: metas e reserva para imprevistos (Ciclo C, D-027)', () => {
  // Bruno, na montagem do bloco anterior (hoje 07/10/2025, base de outubro de volta: Recebido 6.000,00, Pago 3.900,00,
  // Diferença 2.100,00, Ainda a pagar 650,00, renda comprometida 52,5%). A sequência de aceite C não pode mudar nenhum desses
  // números em nenhum passo (G3). Ana é a pessoa de fora. Pessoas e contas fictícias.
  const T0 = '2025-10-07';
  const SEP = '2025-09';
  const OCT = '2025-10';
  const NOV = '2025-11';
  const at = (today: IsoDate = T0) => repoFor(BRUNO, today);
  const ana = repoFor(ANA, T0);
  let ctx = '';
  let reserve: Goal;
  /** Chave do aporte da demonstração: uma operação de metas que a pessoa de fora não consegue buscar. */
  let demoKey = '';
  let base: Awaited<ReturnType<typeof money>>;

  const reserveInput = (over: Partial<NewGoalInput> = {}): NewGoalInput => ({
    goalType: 'emergencia',
    name: 'Reserva para imprevistos',
    targetCents: null,
    targetMonth: null,
    plannedMonthlyCents: null,
    essentialBaseCents: 375000,
    essentialMonths: 6,
    essentialBaseSource: 'media_gastos',
    initialCents: 300000,
    initialOn: '2025-10-01',
    ...over,
  });
  const goalInput = (over: Partial<NewGoalInput> = {}): NewGoalInput => ({
    goalType: 'objetivo',
    name: 'Curso',
    targetCents: 120000,
    targetMonth: '2026-03',
    plannedMonthlyCents: 5000,
    essentialBaseCents: null,
    essentialMonths: null,
    essentialBaseSource: null,
    initialCents: 10000,
    initialOn: '2025-10-01',
    ...over,
  });
  const move = (reais: number, occurredOn: IsoDate, note: string | null = null): GoalMovementInput => ({ amountCents: cents(reais), occurredOn, note });

  /** O dinheiro do mês pelas leituras do app e pelas funções do banco: nada disso muda com uma meta (G3). */
  async function money() {
    const repo = at();
    const db = clientFor(BRUNO, T0);
    const rows = async (fn: string, month: IsoMonth) => {
      const { data, error } = await db.rpc(fn, { p_context_id: ctx, p_month: `${month}-01` });
      expect(error).toBeNull();
      return data;
    };
    return {
      records: [await repo.listRecords(ctx, SEP), await repo.listRecords(ctx, OCT)],
      commitments: [await repo.listCommitments(ctx, OCT), await repo.listCommitments(ctx, NOV)],
      refs: await repo.listIncomeReferences(ctx),
      totals: [await rows('month_totals', SEP), await rows('month_totals', OCT)],
      toPay: await rows('month_to_pay', OCT),
      committed: [await rows('month_committed', OCT), await rows('month_committed', NOV)],
    };
  }
  const same = async () => expect(await money()).toEqual(base);

  /** goal_items pela API é o que o core calcula sobre os movimentos lidos (guardado, composição, último movimento). */
  const checkGoal = async (id: string) => {
    const repo = at();
    const goal = (await repo.getGoal(id))!;
    const movements = await repo.listGoalMovements(id);
    const c = goalComposition(movements);
    expect(goalSaved(movements)).toBe(goal.savedCents);
    expect({
      savedCents: goal.savedCents,
      initialCents: goal.initialCents,
      depositsCents: goal.depositsCents,
      withdrawalsCents: goal.withdrawalsCents,
      incomeCents: goal.incomeCents,
      appreciationCents: goal.appreciationCents,
      depreciationCents: goal.depreciationCents,
      lastMovementOn: goal.lastMovementOn,
    }).toEqual(c);
    expect(await repo.listGoals(ctx)).toContainEqual(goal);
    // Do mais recente ao mais antigo.
    expect(movements.map((m) => m.occurredOn)).toEqual([...movements.map((m) => m.occurredOn)].sort().reverse());
    return goal;
  };
  const percent = (g: Goal) => goalProgress(g.savedCents, g.targetCents).percent;
  const tenths = (g: Goal) => coverageTenths(g.savedCents, g.essentialBaseCents);
  const fail = async (p: Promise<unknown>) => (await p.then(() => null, (e: unknown) => e)) as RepoError;

  beforeAll(async () => {
    ctx = (await at().getSpace())!.personalContextId;
    base = await money();
    // A base do bloco anterior: outubro 52,5% com a referência de setembro.
    const oct = base.committed[0] as { committed_cents: number; committed_permille: number; outside_cents: number }[];
    expect([oct[0]!.committed_cents, oct[0]!.committed_permille, oct[0]!.outside_cents].map(Number)).toEqual([315000, 525, 285000]);
  });

  it('conta sem metas; gastos essenciais pelo core sobre as leituras: R$ 3.750,00 em setembro (Moradia e Mercado)', async () => {
    const repo = at();
    expect(await repo.listGoals(ctx)).toEqual([]);
    expect(await repo.listGoalMovementsInMonth(ctx, OCT)).toEqual([]);
    const records: FinancialRecord[] = [];
    for (let i = 1; i <= 6; i += 1) records.push(...(await repo.listRecords(ctx, addMonths(OCT, -i))));
    const annualIds = annualCommitmentIds(
      (await Promise.all((await repo.listSeries(ctx)).filter((s) => s.kind === 'anual').map((s) => repo.listSeriesOccurrences(s.id)))).flat(),
    );
    const committedNow = summarizeCommitted(await repo.listCommitments(ctx, OCT), ctx, OCT, T0, await repo.listIncomeReferences(ctx)).committedCents;
    const estimate = essentialMonthly(records, OCT, committedNow, annualIds);
    expect(estimate).toMatchObject({ source: 'media_gastos', amountCents: 375000, months: [SEP], excludedAnnualCents: 0 });
    expect(emergencyTarget(375000, 6)).toBe(2250000);
    // Sem meses com gastos, as contas do mês; sem elas, digitado.
    expect(essentialMonthly([], OCT, committedNow, annualIds)).toEqual({ source: 'contas_do_mes', amountCents: 315000, month: OCT });
    expect(essentialMonthly([], OCT, null, annualIds)).toEqual({ source: 'informado', amountCents: null });
  });

  it('sequência de aceite C: 13% e 0,8 mês, aporte, resgate retroativo recusado, valorização; o dinheiro do mês não muda', async () => {
    const repo = at();
    // Passo 1: reserva com essenciais de R$ 3.750,00 e 6 meses (alvo R$ 22.500,00) e R$ 3.000,00 já guardados em 01/10.
    const created = await repo.createGoal(newOperationKey(), ctx, reserveInput());
    reserve = created.goal;
    expect(reserve).toMatchObject({
      contextId: ctx,
      goalType: 'emergencia',
      name: 'Reserva para imprevistos',
      targetCents: 2250000,
      targetMonth: null,
      plannedMonthlyCents: null,
      essentialBaseCents: 375000,
      essentialMonths: 6,
      essentialBaseSource: 'media_gastos',
      status: 'ativa',
      createdBy: BRUNO,
      version: 1,
      savedCents: 300000,
      initialCents: 300000,
      depositsCents: 0,
      withdrawalsCents: 0,
      lastMovementOn: '2025-10-01',
    });
    expect(created.movement).toMatchObject({ goalId: reserve.id, contextId: ctx, kind: 'saldo_inicial', amountCents: 300000, occurredOn: '2025-10-01', note: null, version: 1 });
    expect([percent(reserve), tenths(reserve)]).toEqual([13, 8]);
    expect(await checkGoal(reserve.id)).toEqual(reserve);
    await same();

    // Passo 2: aporte de R$ 1.500,00 em 06/10. A versão da meta não sobe com movimento.
    const deposit = await repo.addGoalMovement(newOperationKey(), reserve.id, 'aporte', move(1500, '2025-10-06'));
    expect(deposit.goal).toMatchObject({ savedCents: 450000, depositsCents: 150000, version: 1, lastMovementOn: '2025-10-06' });
    expect(deposit.movement).toMatchObject({ kind: 'aporte', amountCents: 150000, occurredOn: '2025-10-06', createdBy: BRUNO, version: 1 });
    expect([percent(deposit.goal), tenths(deposit.goal)]).toEqual([20, 12]);
    // Com R$ 4.500,00 e aporte em outubro, P0 é novembro: até dezembro de 2026 são 14 meses (R$ 1.285,72 por mês); com R$ 1.000,00
    // por mês, chega em abril de 2027.
    const plan = goalPlan(deposit.goal, await repo.listGoalMovementsInMonth(ctx, OCT), T0);
    expect(plan.firstProjectedMonth).toBe('2025-11');
    expect(monthlyNeeded(plan.progress.missingCents, plan.firstProjectedMonth, '2026-12')).toBe(128572);
    expect(monthReachedWithPlan(plan.progress.missingCents, 100000, plan.firstProjectedMonth)).toBe('2027-04');
    await checkGoal(reserve.id);
    await same();

    // Passo 3: resgate de R$ 3.500,00 com data 02/10: em 02/10 ficaria -R$ 500,00. Recusado, com o dia no detalhe.
    const refusedKey = newOperationKey();
    const before = await repo.listGoalMovements(reserve.id);
    const refused = await fail(repo.addGoalMovement(refusedKey, reserve.id, 'resgate', move(3500, '2025-10-02')));
    expect([refused.code, refused.detail, refused.message]).toEqual(['saldo_da_meta_insuficiente', 'dia=2025-10-02', 'saldo_da_meta_insuficiente']);
    expect(negativeDayFromDetail(refused.detail)).toBe('2025-10-02');
    expect(firstNegativeDay(before, { op: 'add', kind: 'resgate', amountCents: 350000, occurredOn: '2025-10-02' })).toBe('2025-10-02');
    expect(await repo.findGoalOperation(refusedKey)).toBeNull();
    expect(await repo.listGoalMovements(reserve.id)).toEqual(before);
    await same();

    // Passo 4: resgate de R$ 500,00 em 07/10 (com a chave recusada: a recusa não gastou a chave).
    const withdrawal = await repo.addGoalMovement(refusedKey, reserve.id, 'resgate', move(500, '2025-10-07'));
    expect(withdrawal.goal).toMatchObject({ savedCents: 400000, withdrawalsCents: 50000, version: 1 });
    expect([percent(withdrawal.goal), tenths(withdrawal.goal)]).toEqual([17, 10]);
    expect(await repo.findGoalOperation(refusedKey)).toEqual({ action: 'registrar_movimento_meta', goalId: reserve.id, movementId: withdrawal.movement!.id });
    await same();

    // Passo 5: "Atualizar valor guardado" para R$ 4.037,20: valorização de R$ 37,20 (17% e 1,0 mês; R$ 1.318,78 por mês).
    const change = updateSavedValue(withdrawal.goal.savedCents, 403720)!;
    expect(change).toEqual({ kind: 'valorizacao', amountCents: 3720 });
    const appreciation = await repo.addGoalMovement(newOperationKey(), reserve.id, change.kind, { amountCents: change.amountCents, occurredOn: T0, note: null });
    expect(appreciation.goal).toMatchObject({ savedCents: 403720, appreciationCents: 3720, version: 1 });
    expect([percent(appreciation.goal), tenths(appreciation.goal)]).toEqual([17, 10]);
    expect(monthlyNeeded(appreciation.goal.targetCents - appreciation.goal.savedCents, '2025-11', '2026-12')).toBe(131878);
    await same();

    // Passo 6: resgate de R$ 4.100,00 em 07/10: ficaria -R$ 62,80. Recusado.
    const second = await fail(repo.addGoalMovement(newOperationKey(), reserve.id, 'resgate', move(4100, T0)));
    expect([second.code, second.detail]).toEqual(['saldo_da_meta_insuficiente', 'dia=2025-10-07']);

    // Guardado em outubro: aportes menos resgates (sem o já guardado e sem a valorização) = R$ 1.000,00.
    expect(savedInMonth(await repo.listGoalMovementsInMonth(ctx, OCT), OCT)).toBe(100000);
    reserve = await checkGoal(reserve.id);
    expect(reserve.version).toBe(1);
    await same();
  });

  it('repetição, chave reutilizada e resultado incerto: findGoalOperation e repetir a chave reconciliam; nada duplica', async () => {
    const repo = at();
    const lost = new SupabaseRepository(clientFor(BRUNO, T0, lostResponse), { id: BRUNO });
    const course = (await repo.createGoal(newOperationKey(), ctx, goalInput())).goal;
    const key = newOperationKey();
    const a = await repo.addGoalMovement(key, course.id, 'aporte', move(50, '2025-10-05', 'Parte "extra" | bônus'));
    expect(a.movement!.note).toBe('Parte "extra" | bônus');
    expect(await repo.addGoalMovement(key, course.id, 'aporte', move(50, '2025-10-05', 'Parte "extra" | bônus'))).toEqual(a);
    expect(await err(repo.addGoalMovement(key, course.id, 'aporte', move(51, '2025-10-05', 'Parte "extra" | bônus')))).toBe('chave_reutilizada');
    expect(await err(repo.addGoalMovement(key, course.id, 'resgate', move(50, '2025-10-05', 'Parte "extra" | bônus')))).toBe('chave_reutilizada');
    expect(await err(repo.deleteGoalMovement(key, a.movement!.id, 1))).toBe('chave_reutilizada');
    expect((await repo.listGoalMovements(course.id)).filter((m) => m.kind === 'aporte')).toHaveLength(1);
    const op = (await repo.findGoalOperation(key))!;
    expect(op).toEqual({ action: 'registrar_movimento_meta', goalId: course.id, movementId: a.movement!.id });
    // Chave de outra operação (registro, conta a pagar, renda de referência) não vale em metas, e a busca só olha metas.
    const recordKey = newOperationKey();
    const coffee = await repo.createRecord(recordKey, ctx, 'despesa', { accountId: (await repo.getSpace())!.accounts[0]!.id, amountCents: 100, occurredOn: T0, description: 'Café', category: null });
    expect(await err(repo.addGoalMovement(recordKey, course.id, 'aporte', move(1, T0)))).toBe('chave_reutilizada');
    expect(await repo.findGoalOperation(recordKey)).toBeNull();
    await repo.deleteRecord(newOperationKey(), coffee.id, coffee.version);
    // Observação vazia vira nula, e a de 81 caracteres é recusada.
    const blank = await repo.addGoalMovement(newOperationKey(), course.id, 'rendimento', move(1, T0, '   '));
    expect(blank.movement!.note).toBeNull();
    expect(await err(repo.addGoalMovement(newOperationKey(), course.id, 'rendimento', move(1, T0, 'x'.repeat(81))))).toBe('observacao_longa');
    expect((await repo.addGoalMovement(newOperationKey(), course.id, 'rendimento', move(1, T0, 'x'.repeat(80)))).movement!.note).toHaveLength(80);

    // A resposta se perde: a operação existe; repetir a chave devolve o mesmo movimento, sem duplicar.
    const lostKey = newOperationKey();
    expect(await err(lost.addGoalMovement(lostKey, course.id, 'aporte', move(20, '2025-10-06')))).toBe('rede');
    const found = (await repo.findGoalOperation(lostKey))!;
    expect([found.action, found.goalId]).toEqual(['registrar_movimento_meta', course.id]);
    const again = await repo.addGoalMovement(lostKey, course.id, 'aporte', move(20, '2025-10-06'));
    expect(again.movement!.id).toBe(found.movementId);
    expect((await repo.listGoalMovements(course.id)).filter((m) => m.id === found.movementId)).toHaveLength(1);

    // Alterar o movimento: versão do movimento (não a da meta), com a versão atual no detalhe; a repetição devolve o estado atual.
    const updateKey = newOperationKey();
    const updated = await repo.updateGoalMovement(updateKey, found.movementId!, 1, move(25, '2025-10-06', 'Ajuste'));
    expect(updated.movement).toMatchObject({ amountCents: 2500, note: 'Ajuste', version: 2 });
    expect(updated.goal.version).toBe(course.version);
    const stale = await fail(repo.updateGoalMovement(newOperationKey(), found.movementId!, 1, move(26, '2025-10-06')));
    expect([stale.code, stale.detail]).toEqual(['versao_desatualizada', 'versao_atual=2']);
    expect(await repo.updateGoalMovement(updateKey, found.movementId!, 1, move(25, '2025-10-06', 'Ajuste'))).toEqual(updated);
    expect(await err(repo.updateGoalMovement(newOperationKey(), found.movementId!, null as unknown as number, move(25, '2025-10-06')))).toBe('versao_desatualizada');
    // Excluir o movimento: a RLS esconde o excluído, então a busca devolve a ação e o movimento, com a meta em branco.
    const deleteKey = newOperationKey();
    expect(await err(lost.deleteGoalMovement(deleteKey, found.movementId!, 2))).toBe('rede');
    expect(await repo.findGoalOperation(deleteKey)).toEqual({ action: 'excluir_movimento_meta', goalId: '', movementId: found.movementId });
    const deleted = await repo.deleteGoalMovement(deleteKey, found.movementId!, 2);
    expect([deleted.movement!.id, deleted.movement!.version]).toEqual([found.movementId, 3]);
    expect((await repo.listGoalMovements(course.id)).map((m) => m.id)).not.toContain(found.movementId);
    expect(await err(repo.deleteGoalMovement(newOperationKey(), found.movementId!, 3))).toBe('nao_encontrado');
    await checkGoal(course.id);

    // Excluir a meta tira os movimentos junto; a repetição devolve a meta excluída; depois, nao_encontrado em tudo.
    const delKey = newOperationKey();
    const current = (await repo.getGoal(course.id))!;
    const gone = await repo.deleteGoal(delKey, course.id, current.version);
    expect([gone.goal.id, gone.goal.version, gone.goal.savedCents, gone.movement]).toEqual([course.id, current.version + 1, 0, null]);
    expect(await repo.deleteGoal(delKey, course.id, current.version)).toEqual(gone);
    expect(await repo.findGoalOperation(delKey)).toEqual({ action: 'excluir_meta', goalId: course.id, movementId: null });
    expect(await repo.getGoal(course.id)).toBeNull();
    expect(await repo.listGoalMovements(course.id)).toEqual([]);
    expect((await repo.listGoalMovementsInMonth(ctx, OCT)).filter((m) => m.goalId === course.id)).toEqual([]);
    expect(await err(repo.addGoalMovement(newOperationKey(), course.id, 'aporte', move(1, T0)))).toBe('nao_encontrado');
    expect(await err(repo.updateGoal(newOperationKey(), course.id, gone.goal.version, goalInput()))).toBe('nao_encontrado');
    expect(await err(repo.setGoalStatus(newOperationKey(), course.id, gone.goal.version, 'arquivada'))).toBe('nao_encontrado');
    expect(await err(repo.deleteGoal(newOperationKey(), course.id, gone.goal.version))).toBe('nao_encontrado');
    expect((await repo.listGoals(ctx)).map((g) => g.id)).toEqual([reserve.id]);
    await same();
  });

  it('validação também no banco, com o mesmo código e a mesma ordem do core; recusa não grava nada', async () => {
    const repo = at();
    const key = () => newOperationKey();
    const create = (over: Partial<NewGoalInput>) => err(repo.createGoal(key(), ctx, goalInput(over)));
    const reserveWith = (over: Partial<NewGoalInput>) => err(repo.createGoal(key(), ctx, reserveInput(over)));
    expect(await create({ goalType: 'outro' as NewGoalInput['goalType'] })).toBe('tipo_invalido');
    expect(await create({ name: '' })).toBe('nome_da_meta_invalido');
    expect(await create({ name: 'x'.repeat(41) })).toBe('nome_da_meta_invalido');
    expect(await create({ targetCents: 0 })).toBe('valor_invalido');
    expect(await create({ targetCents: 1_000_000_000 })).toBe('alvo_acima_do_limite');
    expect(await create({ essentialMonths: 6 })).toBe('tipo_invalido');
    expect(await create({ targetMonth: '2025-09' })).toBe('prazo_invalido');
    expect(await create({ targetMonth: '2075-11' })).toBe('prazo_invalido');
    expect(await create({ plannedMonthlyCents: 0 })).toBe('plano_invalido');
    expect(await create({ initialCents: -1 })).toBe('saldo_inicial_invalido');
    expect(await create({ initialCents: 100, initialOn: null })).toBe('data_invalida');
    expect(await create({ initialCents: 100, initialOn: '2025-10-08' })).toBe('data_futura');
    expect(await reserveWith({ essentialBaseCents: 0 })).toBe('valor_invalido');
    expect(await reserveWith({ essentialMonths: 25 })).toBe('meses_invalidos');
    expect(await reserveWith({ essentialBaseSource: null })).toBe('origem_invalida');
    expect(await reserveWith({ essentialBaseCents: 999_999_999, essentialMonths: 2 })).toBe('alvo_acima_do_limite');
    expect(await reserveWith({ targetCents: 2250001 })).toBe('alvo_invalido');
    // Já existe uma reserva viva e não arquivada: reserva_ja_existe (depois da validação dos campos).
    expect(await reserveWith({})).toBe('reserva_ja_existe');
    expect(await reserveWith({ name: '' })).toBe('nome_da_meta_invalido');
    // Reserva com o alvo igual ao produto é aceita no formato (aqui só recusada por já existir uma).
    expect(await reserveWith({ targetCents: 2250000 })).toBe('reserva_ja_existe');
    expect((await repo.listGoals(ctx)).map((g) => g.id)).toEqual([reserve.id]);

    const move1 = (kind: GoalMovementKind, input: GoalMovementInput) => err(repo.addGoalMovement(key(), reserve.id, kind, input));
    expect(await move1('saldo_inicial', move(1, T0))).toBe('tipo_invalido');
    expect(await move1('aporte', { amountCents: 0, occurredOn: T0, note: null })).toBe('valor_invalido');
    expect(await move1('aporte', { amountCents: 1_000_000_000, occurredOn: T0, note: null })).toBe('valor_acima_do_limite');
    expect(await move1('aporte', { amountCents: 100, occurredOn: null as unknown as IsoDate, note: null })).toBe('data_invalida');
    expect(await move1('aporte', move(1, '2025-10-08'))).toBe('data_futura');
    // update_goal: versão antes da validação; prazo só é conferido quando muda (a reserva tem prazo vencido? não: nulo).
    const asGoalInput = (g: Goal, over: Partial<GoalInput> = {}): GoalInput => ({
      goalType: g.goalType,
      name: g.name,
      targetCents: g.targetCents,
      targetMonth: g.targetMonth,
      plannedMonthlyCents: g.plannedMonthlyCents,
      essentialBaseCents: g.essentialBaseCents,
      essentialMonths: g.essentialMonths,
      essentialBaseSource: g.essentialBaseSource,
      ...over,
    });
    expect(await err(repo.updateGoal(key(), reserve.id, 9, asGoalInput(reserve, { name: '' })))).toBe('versao_desatualizada');
    expect(await err(repo.updateGoal(key(), reserve.id, reserve.version, asGoalInput(reserve, { name: '' })))).toBe('nome_da_meta_invalido');
    expect(await err(repo.updateGoal(key(), reserve.id, reserve.version, asGoalInput(reserve, { plannedMonthlyCents: 0 })))).toBe('plano_invalido');
    expect(await err(repo.setGoalStatus(key(), reserve.id, reserve.version, 'pausada' as GoalStatus))).toBe('situacao_invalida');
    expect(await err(repo.setGoalStatus(key(), reserve.id, 99, 'concluida'))).toBe('versao_desatualizada');
    expect((await repo.getGoal(reserve.id))!).toEqual(reserve);
    await same();
  });

  it('uma reserva por contexto, inclusive ao reativar; meta arquivada não recebe movimento; concluir e reativar', async () => {
    const repo = at();
    const status = (g: Goal, s: GoalStatus) => repo.setGoalStatus(newOperationKey(), g.id, g.version, s);
    const archived = (await status(reserve, 'arquivada')).goal;
    expect([archived.status, archived.version]).toEqual(['arquivada', 2]);
    // Arquivada: movimento recusado nas três funções; editar a meta continua valendo.
    const mv = (await repo.listGoalMovements(archived.id))[0]!;
    expect(await err(repo.addGoalMovement(newOperationKey(), archived.id, 'aporte', move(1, T0)))).toBe('meta_arquivada');
    expect(await err(repo.updateGoalMovement(newOperationKey(), mv.id, mv.version, move(1, mv.occurredOn)))).toBe('meta_arquivada');
    expect(await err(repo.deleteGoalMovement(newOperationKey(), mv.id, mv.version))).toBe('meta_arquivada');
    // Com a antiga arquivada, uma nova reserva é aceita; reativar a antiga é recusado enquanto a nova existir.
    const second = (await repo.createGoal(newOperationKey(), ctx, reserveInput({ name: 'Reserva nova', initialCents: null, initialOn: null }))).goal;
    expect(second.goalType).toBe('emergencia');
    expect(await err(status(archived, 'ativa'))).toBe('reserva_ja_existe');
    expect(await err(status(archived, 'concluida'))).toBe('reserva_ja_existe');
    // Virar reserva também respeita a vaga.
    const trip = (await repo.createGoal(newOperationKey(), ctx, goalInput({ name: 'Viagem', initialCents: null, initialOn: null }))).goal;
    expect(await err(repo.updateGoal(newOperationKey(), trip.id, trip.version, { ...reserveInput(), targetCents: null, name: 'Viagem' }))).toBe('reserva_ja_existe');
    await repo.deleteGoal(newOperationKey(), trip.id, trip.version);
    // Concluída ainda ocupa a vaga e continua recebendo movimentos (por exemplo, o resgate de quem usou o dinheiro).
    const done = (await status(second, 'concluida')).goal;
    expect(await err(status(archived, 'ativa'))).toBe('reserva_ja_existe');
    const used = await repo.addGoalMovement(newOperationKey(), done.id, 'aporte', move(10, T0));
    expect(used.goal.status).toBe('concluida');
    await repo.deleteGoal(newOperationKey(), done.id, done.version);
    // Excluída libera a vaga: a antiga volta a ser a reserva.
    reserve = (await status(archived, 'ativa')).goal;
    expect([reserve.status, reserve.version]).toEqual(['ativa', 3]);
    expect(organizeGoals(await repo.listGoals(ctx)).reserve?.id).toBe(reserve.id);
    await same();
  });

  it('demonstração do Ciclo C: reserva 15% e 0,9 mês (dezembro de 2028), viagem 20% e R$ 480,00 por mês; guardado, planejado e fora', async () => {
    const repo = at();
    await repo.deleteGoal(newOperationKey(), reserve.id, reserve.version);
    expect(await repo.listGoals(ctx)).toEqual([]);
    reserve = (await repo.createGoal(newOperationKey(), ctx, reserveInput({ plannedMonthlyCents: 50000 }))).goal;
    demoKey = newOperationKey();
    await repo.addGoalMovement(demoKey, reserve.id, 'aporte', move(500, '2025-10-06'));
    const trip = (
      await repo.createGoal(newOperationKey(), ctx, goalInput({ name: 'Viagem de férias', targetCents: 600000, targetMonth: '2026-07', plannedMonthlyCents: 48000, initialCents: 120000 }))
    ).goal;
    reserve = (await repo.getGoal(reserve.id))!;
    const month = await repo.listGoalMovementsInMonth(ctx, OCT);
    expect(month.map((m) => [m.goalId === reserve.id ? 'reserva' : 'viagem', m.kind, m.amountCents]).sort()).toEqual([
      ['reserva', 'aporte', 50000],
      ['reserva', 'saldo_inicial', 300000],
      ['viagem', 'saldo_inicial', 120000],
    ]);
    expect([reserve.savedCents, percent(reserve), tenths(reserve)]).toEqual([350000, 15, 9]);
    expect([trip.savedCents, percent(trip)]).toEqual([120000, 20]);
    const reservePlan = goalPlan(reserve, month, T0);
    const tripPlan = goalPlan(trip, month, T0);
    // Reserva: P0 novembro (houve aporte em outubro), 38 aportes de R$ 500,00 → dezembro de 2028.
    expect([reservePlan.firstProjectedMonth, reservePlan.reachMonth]).toEqual(['2025-11', '2028-12']);
    // Viagem: sem aporte em outubro, P0 outubro; até julho de 2026, 10 meses → R$ 480,00 por mês, chega em julho de 2026.
    expect([tripPlan.firstProjectedMonth, tripPlan.deadline]).toEqual(['2025-10', { month: '2026-07', months: 10, monthlyCents: 48000 }]);
    expect(tripPlan.reachMonth).toBe('2026-07');
    const organized = organizeGoals(await repo.listGoals(ctx));
    expect([organized.reserve?.id, organized.active.map((g) => g.id)]).toEqual([reserve.id, [trip.id]]);

    // Guardado em outubro R$ 500,00, planejado R$ 980,00 por mês e fora dos compromissos depois do planejado R$ 1.870,00,
    // tudo fora do percentual (52,5% e fora R$ 2.850,00 continuam os mesmos).
    const goals = await repo.listGoals(ctx);
    const summary = summarizeCommitted(await repo.listCommitments(ctx, OCT), ctx, OCT, T0, await repo.listIncomeReferences(ctx));
    const lines = committedGoalLines(summary, savedInMonth(month, OCT), plannedForGoals(goals));
    expect([lines.savedInMonthCents, lines.plannedCents, lines.outsideAfterPlannedCents]).toEqual([50000, 98000, 187000]);
    expect(lines.outsideAfterPlanned).toBe('Fora dos compromissos depois do planejado: R$ 1.870,00');
    expect([summary.committedPermille, summary.outsideCents]).toEqual([525, 285000]);
    await same();
  });

  it('outra pessoa não lê nem altera metas, movimentos nem operações; gravação direta é recusada', async () => {
    const repo = at();
    const [reserveNow] = await repo.listGoals(ctx);
    const mv = (await repo.listGoalMovements(reserveNow!.id))[0]!;
    const anaCtx = (await ana.getSpace())!.personalContextId;
    expect(await ana.listGoals(ctx)).toEqual([]);
    expect(await ana.getGoal(reserveNow!.id)).toBeNull();
    expect(await ana.listGoalMovements(reserveNow!.id)).toEqual([]);
    expect(await ana.listGoalMovementsInMonth(ctx, OCT)).toEqual([]);
    expect(await ana.listGoals(anaCtx)).toEqual([]);
    expect(await err(ana.createGoal(newOperationKey(), ctx, goalInput()))).toBe('sem_permissao');
    expect(await err(ana.updateGoal(newOperationKey(), reserveNow!.id, reserveNow!.version, goalInput()))).toBe('nao_encontrado');
    expect(await err(ana.setGoalStatus(newOperationKey(), reserveNow!.id, reserveNow!.version, 'arquivada'))).toBe('nao_encontrado');
    expect(await err(ana.deleteGoal(newOperationKey(), reserveNow!.id, reserveNow!.version))).toBe('nao_encontrado');
    expect(await err(ana.addGoalMovement(newOperationKey(), reserveNow!.id, 'aporte', move(1, T0)))).toBe('nao_encontrado');
    expect(await err(ana.updateGoalMovement(newOperationKey(), mv.id, mv.version, move(1, T0)))).toBe('nao_encontrado');
    expect(await err(ana.deleteGoalMovement(newOperationKey(), mv.id, mv.version))).toBe('nao_encontrado');
    expect((await repo.findGoalOperation(demoKey))!.action).toBe('registrar_movimento_meta');
    expect(await ana.findGoalOperation(demoKey)).toBeNull();
    // Gravação direta nas tabelas e na visão, por quem tem acesso e por quem não tem sessão.
    const db = clientFor(BRUNO, T0);
    expect((await db.from('goals').insert({ context_id: ctx, goal_type: 'objetivo', name: 'x', target_cents: 1, created_by: BRUNO })).error).not.toBeNull();
    expect((await db.from('goals').update({ name: 'x' }).eq('id', reserveNow!.id)).error).not.toBeNull();
    expect((await db.from('goals').delete().eq('id', reserveNow!.id)).error).not.toBeNull();
    expect((await db.from('goal_movements').insert({ goal_id: reserveNow!.id, context_id: ctx, kind: 'aporte', amount_cents: 1, occurred_on: T0, created_by: BRUNO })).error).not.toBeNull();
    expect((await db.from('goal_movements').update({ amount_cents: 1 }).eq('id', mv.id)).error).not.toBeNull();
    for (const table of ['goals', 'goal_movements', 'goal_items']) {
      const anon = await clientFor(null).from(table).select('id');
      expect(anon.error !== null || (anon.data ?? []).length === 0).toBe(true);
      const outsider = await clientFor(ANA, T0).from(table).select('id');
      expect(outsider.error).toBeNull();
      expect(outsider.data).toEqual([]);
    }
    const sent = await clientFor(null).rpc('create_goal', {
      p_idempotency_key: newOperationKey(),
      p_context_id: ctx,
      p_goal_type: 'objetivo',
      p_name: 'x',
      p_target_cents: 1,
      p_target_month: null,
      p_planned_monthly_cents: null,
      p_essential_base_cents: null,
      p_essential_months: null,
      p_essential_base_source: null,
      p_initial_cents: null,
      p_initial_on: null,
    });
    expect(sent.error).not.toBeNull();
    expect((await repo.getGoal(reserveNow!.id))!.withdrawalsCents).toBe(reserveNow!.withdrawalsCents);
  });
});

// ---------------------------------------------------------------------------
// Plano de guardar (D-036)
// ---------------------------------------------------------------------------

describe('API real: plano de guardar (D-036)', () => {
  // Bruno, com as metas da demonstração do bloco anterior (reserva R$ 3.500,00 guardados, viagem R$ 1.200,00), hoje 07/10/2025.
  // As datas de volta são do banco: cada resposta é feita no "hoje" que a tabela do teste indica. A resposta não é anotação
  // e não mexe em nenhum outro dado. Ana é a pessoa de fora. Pessoas e contas fictícias.
  const T0 = '2025-10-07';
  const OCT = '2025-10';
  const at = (today: IsoDate = T0) => repoFor(BRUNO, today);
  const ana = repoFor(ANA, T0);
  let ctx = '';

  const fail = async (p: Promise<unknown>) => (await p.then(() => null, (e: unknown) => e)) as RepoError;
  /** Responde no "hoje" indicado, com a versão atual (0 = ainda não há resposta). */
  const answer = async (today: IsoDate, a: SavingsAnswer, monthlyCents: Cents | null = null) => {
    const repo = at(today);
    const current = await repo.getSavingsCheck(ctx);
    return repo.setSavingsAnswer(newOperationKey(), ctx, current?.version ?? 0, a, monthlyCents);
  };
  const shape = (c: SavingsCheck | null) => c && [c.answer, c.monthlyCents, c.answeredOn, c.askAgainOn, c.version];

  beforeAll(async () => {
    ctx = (await at().getSpace())!.personalContextId;
  });

  it('sem resposta: o card pergunta pela primeira vez e o 4º passo de Primeiros passos não está concluído', async () => {
    expect(await at().getSavingsCheck(ctx)).toBeNull();
    expect(isSavingsStepDone(null)).toBe(false);
    expect(savingsCardState(null, T0, null)).toMatchObject({ kind: 'pergunta', reason: 'primeira' });
    expect(shouldAskSavings(null, T0, null)).toBe(true);
  });

  it('"Responder depois": o banco calcula a data de volta (+ 7 dias); repetição, chave reutilizada e versão', async () => {
    const repo = at();
    const key = newOperationKey();
    const first = await repo.setSavingsAnswer(key, ctx, 0, 'depois');
    expect(first).toMatchObject({ contextId: ctx, answer: 'depois', monthlyCents: null, answeredOn: T0, askAgainOn: '2025-10-14', version: 1 });
    expect(await repo.getSavingsCheck(ctx)).toEqual(first);
    expect(shouldAskSavings(first, '2025-10-13', null)).toBe(false);
    expect(shouldAskSavings(first, '2025-10-14', null)).toBe(true);
    // Mesma chave e mesmo pedido: a mesma resposta, sem gravar de novo; outro conteúdo ou outra operação: chave reutilizada.
    expect(await repo.setSavingsAnswer(key, ctx, 0, 'depois')).toEqual(first);
    expect(await err(repo.setSavingsAnswer(key, ctx, 0, 'agora_nao'))).toBe('chave_reutilizada');
    expect(await err(repo.setSavingsAnswer(key, ctx, 1, 'depois'))).toBe('chave_reutilizada');
    expect(await err(repo.setSavingsAnswer(key, ctx, 0, 'consigo', 30000))).toBe('chave_reutilizada');
    // Versão: 0 só vale sem resposta; nula, negativa e antiga são recusadas, com a versão atual no detalhe.
    const stale = await fail(repo.setSavingsAnswer(newOperationKey(), ctx, 0, 'agora_nao'));
    expect([stale.code, stale.detail]).toEqual(['versao_desatualizada', 'versao_atual=1']);
    expect(await err(repo.setSavingsAnswer(newOperationKey(), ctx, null as unknown as number, 'agora_nao'))).toBe('versao_desatualizada');
    expect(await err(repo.setSavingsAnswer(newOperationKey(), ctx, -1, 'agora_nao'))).toBe('versao_desatualizada');
    expect(await err(repo.setSavingsAnswer(newOperationKey(), ctx, 2, 'agora_nao'))).toBe('versao_desatualizada');
    expect(shape(await repo.getSavingsCheck(ctx))).toEqual(['depois', null, T0, '2025-10-14', 1]);
  });

  it('validação antes da versão, com o mesmo código do core; a recusa não gasta a chave', async () => {
    const repo = at();
    const key = newOperationKey();
    const monthly = (cents: number | null) => err(repo.setSavingsAnswer(key, ctx, 1, 'consigo', cents));
    // Resposta e valor são conferidos antes da versão: com a versão errada (0) o código é o da validação.
    expect(await err(repo.setSavingsAnswer(key, ctx, 0, 'talvez' as SavingsAnswer))).toBe('resposta_invalida');
    expect(await err(repo.setSavingsAnswer(key, ctx, 0, null as unknown as SavingsAnswer))).toBe('resposta_invalida');
    expect(await monthly(null)).toBe('valor_invalido');
    expect(await monthly(99)).toBe('valor_invalido');
    expect(await monthly(1_000_000_000)).toBe('valor_acima_do_limite');
    expect(await err(repo.setSavingsAnswer(key, ctx, 1, 'agora_nao', 100))).toBe('valor_invalido');
    expect(await err(repo.setSavingsAnswer(key, ctx, 1, 'depois', 0))).toBe('valor_invalido');
    for (const [a, v] of [['talvez', null], ['consigo', null], ['consigo', 99], ['consigo', 1_000_000_000], ['agora_nao', 100]] as const) {
      expect(savingsAnswerError(a as SavingsAnswer, v)).toBe(
        a === 'talvez' ? 'resposta_invalida' : v === 1_000_000_000 ? 'valor_acima_do_limite' : 'valor_invalido',
      );
    }
    expect(shape(await repo.getSavingsCheck(ctx))).toEqual(['depois', null, T0, '2025-10-14', 1]);
    // A chave das recusas segue livre: vale com os argumentos certos (limites de R$ 1,00 e R$ 9.999.999,99 aceitos).
    const low = await repo.setSavingsAnswer(key, ctx, 1, 'consigo', 100);
    expect(shape(low)).toEqual(['consigo', 100, T0, null, 2]);
    const high = await repo.setSavingsAnswer(newOperationKey(), ctx, 2, 'consigo', 999_999_999);
    expect(shape(high)).toEqual(['consigo', 999_999_999, T0, null, 3]);
  });

  it('"Sim, consigo" e "Agora não": a resposta nova substitui a anterior (apaga o valor); datas do banco iguais ao core', async () => {
    const repo = at();
    const yes = await answer(T0, 'consigo', 30000);
    expect(shape(yes)).toEqual(['consigo', 30000, T0, null, 4]);
    expect(isSavingsStepDone(yes)).toBe(true);
    expect(savingsCardState(yes, T0, null)).toEqual({ kind: 'plano', monthlyCents: 30000 });
    // "Manter o valor" (renda de referência mudou): "consigo" de novo com o mesmo valor renova o dia e some a pergunta.
    const later = await answer('2025-11-10', 'consigo', 30000);
    expect(shape(later)).toEqual(['consigo', 30000, '2025-11-10', null, 5]);
    expect(savingsCardState(later, '2025-11-10', '2025-11-09').kind).toBe('plano');
    expect(savingsCardState(later, '2025-11-10', '2025-11-11')).toMatchObject({ kind: 'pergunta', reason: 'renda_mudou' });

    // "Agora não" por cima de "consigo" apaga o valor por mês; volta em 30 dias.
    const no = await answer('2025-11-10', 'agora_nao');
    expect(shape(no)).toEqual(['agora_nao', null, '2025-11-10', '2025-12-10', 6]);
    expect(isSavingsStepDone(no)).toBe(true);
    expect(shouldAskSavings(no, '2025-12-09', null)).toBe(false);
    expect(savingsCardState(no, '2025-12-10', null)).toMatchObject({ kind: 'pergunta', reason: 'agora_nao' });
    // O banco e o core calculam as mesmas datas, inclusive na virada de ano e de mês e em ano bissexto.
    for (const [today, a] of [
      ['2025-12-28', 'depois'],
      ['2025-12-20', 'agora_nao'],
      ['2026-02-01', 'agora_nao'],
      ['2025-10-31', 'agora_nao'],
      ['2028-02-01', 'agora_nao'],
      ['2028-02-25', 'depois'],
      ['2025-01-01', 'depois'],
    ] as const) {
      const c = await answer(today, a);
      expect([c.answeredOn, c.askAgainOn]).toEqual([today, savingsAskAgainOn(a, today)]);
      expect(c.monthlyCents).toBeNull();
    }
    expect((await repo.getSavingsCheck(ctx))!.askAgainOn).toBe('2025-01-08');
    expect(await answer(T0, 'agora_nao')).toMatchObject({ askAgainOn: '2025-11-06', version: 14 });
  });

  it('a resposta é só da pessoa e não grava nada além dela: sem anotação, sem meta, sem conta; operação sem alvo', async () => {
    const repo = at();
    const before = await Promise.all([repo.getReturnReviewState(ctx), repo.listGoals(ctx), repo.listGoalMovementsInMonth(ctx, OCT), repo.listRecords(ctx, OCT), repo.listIncomeReferences(ctx)]);
    const key = newOperationKey();
    const current = (await repo.getSavingsCheck(ctx))!;
    const saved = await repo.setSavingsAnswer(key, ctx, current.version, 'consigo', 50000);
    expect(await Promise.all([repo.getReturnReviewState(ctx), repo.listGoals(ctx), repo.listGoalMovementsInMonth(ctx, OCT), repo.listRecords(ctx, OCT), repo.listIncomeReferences(ctx)])).toEqual(before);
    const ops = await clientFor(BRUNO, T0).from('record_operations').select('action, context_id, record_id, commitment_id, target_id').eq('idempotency_key', key);
    expect(ops.data).toEqual([{ action: 'responder_guardar', context_id: ctx, record_id: null, commitment_id: null, target_id: null }]);
    // As operações de metas e de renda não são buscadas como se fossem resposta, e vice-versa.
    expect(await repo.findGoalOperation(key)).toBeNull();
    expect(await repo.findOperation(key)).toBeNull();
    // Outra pessoa não lê a resposta, nem pelo repositório nem direto, e não responde no contexto dele; sem sessão, nada.
    expect(await ana.getSavingsCheck(ctx)).toBeNull();
    expect(await err(ana.setSavingsAnswer(newOperationKey(), ctx, saved.version, 'consigo', 50000))).toBe('sem_permissao');
    expect(await err(ana.setSavingsAnswer(newOperationKey(), randomUUID(), 0, 'depois'))).toBe('sem_permissao');
    const outsider = await clientFor(ANA, T0).from('savings_checks').select('context_id');
    expect(outsider.error).toBeNull();
    expect(outsider.data).toEqual([]);
    const anon = await clientFor(null).from('savings_checks').select('context_id');
    expect(anon.error !== null || (anon.data ?? []).length === 0).toBe(true);
    const db = clientFor(BRUNO, T0);
    expect((await db.from('savings_checks').insert({ person_id: BRUNO, context_id: ctx, answer: 'depois', answered_on: T0, ask_again_on: '2025-10-14' })).error).not.toBeNull();
    expect((await db.from('savings_checks').update({ answer: 'depois' }).eq('context_id', ctx)).error).not.toBeNull();
    expect((await db.from('savings_checks').delete().eq('context_id', ctx)).error).not.toBeNull();
    // Resultado incerto: a resposta se perde; repetir a mesma chave devolve a linha atual, sem gravar de novo.
    const lost = new SupabaseRepository(clientFor(BRUNO, T0, lostResponse), { id: BRUNO });
    const lostKey = newOperationKey();
    const version = (await repo.getSavingsCheck(ctx))!.version;
    expect(await err(lost.setSavingsAnswer(lostKey, ctx, version, 'consigo', 45000))).toBe('rede');
    const landed = await repo.setSavingsAnswer(lostKey, ctx, version, 'consigo', 45000);
    expect(shape(landed)).toEqual(['consigo', 45000, T0, null, version + 1]);
    expect((await repo.getSavingsCheck(ctx))!.version).toBe(version + 1);
  });

  it('o plano com as metas da demonstração: etapas da reserva e das metas iguais ao core; "Usar este plano" e reserva mínima', async () => {
    const repo = at();
    const goals = await repo.listGoals(ctx);
    const movements = await repo.listGoalMovementsInMonth(ctx, OCT);
    const reserve = goals.find((g) => g.goalType === 'emergencia')!;
    const trip = goals.find((g) => g.name === 'Viagem de férias')!;
    expect(reserve.savedCents).toBe(350000);
    const plan = savingsPlan({ monthlyCents: 50000, essentialCents: reserve.essentialBaseCents, goals, movements, today: T0 });
    // Gastos essenciais R$ 3.750,00 e R$ 500,00 por mês, P0 em novembro (houve aporte em outubro): 1 mês falta R$ 250,00;
    // 3 meses faltam R$ 7.750,00; 6 meses faltam R$ 19.000,00 (a mesma data do plano da reserva); a viagem entra depois da 1ª etapa.
    expect(plan.firstProjectedMonth).toBe('2025-11');
    expect(plan.chosenStageId).toBe('reserva-1');
    expect(plan.stages.map((s) => [s.id, s.targetCents, s.missingCents, s.reachMonth])).toEqual([
      ['reserva-1', 375000, 25000, '2025-11'],
      ['reserva-3', 1125000, 775000, '2027-02'],
      ['reserva-6', 2250000, 1900000, '2028-12'],
      [`meta-${trip.id}`, 600000, 480000, '2026-09'],
    ]);
    expect(goalPlan(reserve, movements, T0).reachMonth).toBe('2028-12');

    // "Usar este plano": o banco aceita os campos que o core monta (etapa de 3 meses, valor por mês igual ao informado).
    const input = savingsReserveInput(plan, 'media_gastos', { stageId: 'reserva-3', existing: reserve })!;
    const updated = await repo.updateGoal(newOperationKey(), reserve.id, reserve.version, input);
    expect(updated.goal).toMatchObject({ targetCents: 1125000, essentialBaseCents: 375000, essentialMonths: 3, plannedMonthlyCents: 50000, name: 'Reserva para imprevistos', version: reserve.version + 1 });
    expect(updated.goal.savedCents).toBe(350000);
    // A lista segue a ordem de criação mesmo depois de a reserva ser alterada (a linha alterada não passa para o fim).
    expect((await repo.listGoals(ctx)).map((g) => g.id)).toEqual([reserve.id, trip.id]);

    // "Agora não" → reserva mínima: sem reserva (a antiga é excluída), o banco aceita a mínima de R$ 300,00 com o passo semanal.
    expect(weeklySavingsToMonthly(1000)).toBe(4333);
    await repo.deleteGoal(newOperationKey(), reserve.id, updated.goal.version);
    const minimum = await repo.createGoal(newOperationKey(), ctx, minimumReserveInput(30000, weeklySavingsToMonthly(1000)));
    expect(minimum.goal).toMatchObject({
      goalType: 'emergencia',
      name: 'Reserva para imprevistos',
      targetCents: 30000,
      essentialBaseCents: 30000,
      essentialMonths: 1,
      essentialBaseSource: 'reserva_minima',
      plannedMonthlyCents: 4333,
      savedCents: 0,
      status: 'ativa',
    });
    expect(minimum.movement).toBeNull();
    // Sem o plano da reserva mínima, as etapas voltam a contar o que a nova reserva guarda (nada).
    const none = savingsPlan({ monthlyCents: 4333, essentialCents: 375000, goals: await repo.listGoals(ctx), movements: await repo.listGoalMovementsInMonth(ctx, OCT), today: T0 });
    expect(none.stages[0]).toMatchObject({ id: 'reserva-1', missingCents: 375000, reachMonth: '2032-12' });
  });
});

describe('conversor da renda de referência, das metas e do plano de guardar', () => {
  // Sem rede: os argumentos das funções, a leitura das linhas (mês AAAA-MM-01 ↔ AAAA-MM, bigint) e os códigos de erro.
  const calls: [string, Record<string, unknown>][] = [];
  const ref = { id: 'r1', context_id: 'ctx', from_month: '2026-09-01', amount_cents: 600000, varies: false, created_by: 'p1', version: 1, created_at: 'a', updated_at: 'b', amount_changed_at: null };
  const goal = {
    id: 'g1',
    context_id: 'ctx',
    goal_type: 'emergencia',
    name: 'Reserva para imprevistos',
    target_cents: 2250000,
    target_month: '2029-12-01',
    planned_monthly_cents: 50000,
    essential_base_cents: 375000,
    essential_months: 6,
    essential_base_source: 'media_gastos',
    status: 'ativa',
    created_by: 'p1',
    version: 1,
    created_at: 'a',
    updated_at: 'b',
    saved_cents: 350000,
    initial_cents: 300000,
    deposits_cents: 50000,
    withdrawals_cents: 0,
    income_cents: 0,
    appreciation_cents: 0,
    depreciation_cents: 0,
    last_movement_on: '2026-10-06',
    deleted_at: null,
    deleted_by: null,
  };
  const movement = { id: 'm1', goal_id: 'g1', context_id: 'ctx', kind: 'aporte', amount_cents: 50000, occurred_on: '2026-10-06', note: null, created_by: 'p1', version: 1, created_at: 'a', updated_at: 'b' };
  const check = { person_id: 'p1', context_id: 'ctx', answer: 'consigo', monthly_cents: 30000, answered_on: '2026-10-07', ask_again_on: null, version: 1, created_at: 'a', updated_at: 'b' };
  const goalInput: NewGoalInput = {
    goalType: 'objetivo',
    name: 'Curso',
    targetCents: 120000,
    targetMonth: '2027-03',
    plannedMonthlyCents: 5000,
    essentialBaseCents: null,
    essentialMonths: null,
    essentialBaseSource: null,
    initialCents: 10000,
    initialOn: '2026-10-01',
  };

  const query = (result: { data: unknown; error: unknown }) => {
    const q: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'in', 'is', 'gte', 'lt', 'order', 'range']) q[m] = () => q;
    q.maybeSingle = async () => ({ data: Array.isArray(result.data) ? (result.data[0] ?? null) : result.data, error: result.error });
    q.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => Promise.resolve(result).then(resolve, reject);
    return q;
  };
  const fake = (rpc: Record<string, unknown>, tables: Record<string, { data: unknown; error?: unknown }> = {}, error: unknown = null) => {
    const db = {
      from: (table: string) => query(error ? { data: null, error } : { data: tables[table]?.data ?? null, error: tables[table]?.error ?? null }),
      rpc: async (fn: string, args: Record<string, unknown>) => {
        calls.push([fn, args]);
        return error ? { data: null, error } : { data: rpc[fn] ?? null, error: null };
      },
    };
    return new SupabaseRepository(db as unknown as SupabaseClient, { id: 'p1' });
  };
  const failure = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => (e instanceof RepoError ? [e.code, e.message, e.detail ?? null] : String(e)));

  it('renda de referência: AAAA-MM vira AAAA-MM-01 e volta; linha incoerente é recusada', async () => {
    calls.length = 0;
    const repo = fake({ set_income_reference: ref, delete_income_reference: { ...ref, version: 2, deleted_at: 'c', deleted_by: 'p1' } }, { income_references: { data: [ref] } });
    const expected = { id: 'r1', contextId: 'ctx', fromMonth: '2026-09', amountCents: 600000, varies: false, createdBy: 'p1', version: 1, createdAt: 'a', updatedAt: 'b', amountChangedAt: null };
    expect(await repo.listIncomeReferences('ctx')).toEqual([expected]);
    // O instante da última mudança do valor vem da coluna amount_changed_at.
    const changedRow = { ...ref, version: 2, amount_changed_at: '2026-10-05T12:00:00.000Z' };
    expect(await fake({}, { income_references: { data: [changedRow] } }).listIncomeReferences('ctx')).toEqual([
      { ...expected, version: 2, amountChangedAt: '2026-10-05T12:00:00.000Z' },
    ]);
    expect(await repo.setIncomeReference('chave-0001', 'ctx', '2026-09', 0, 600000, false)).toEqual(expected);
    expect(await repo.deleteIncomeReference('chave-0002', 'r1', 1)).toEqual({ ...expected, version: 2 });
    expect(calls).toEqual([
      ['set_income_reference', { p_idempotency_key: 'chave-0001', p_context_id: 'ctx', p_from_month: '2026-09-01', p_expected_version: 0, p_amount_cents: 600000, p_varies: false }],
      ['delete_income_reference', { p_idempotency_key: 'chave-0002', p_id: 'r1', p_expected_version: 1 }],
    ]);
    for (const bad of [{ ...ref, from_month: '2026-09-15' }, { ...ref, amount_cents: 0 }, { ...ref, amount_cents: 1_000_000_000 }, { ...ref, varies: null }, { ...ref, version: 0 }, { ...ref, amount_cents: 1.5 }]) {
      expect(await failure(fake({ set_income_reference: bad }).setIncomeReference('chave-0003', 'ctx', '2026-09', 0, 600000, false))).toEqual(['desconhecido', expect.stringMatching(/inconsistente$/), null]);
    }
    // bigint como texto (valores grandes) é aceito; texto qualquer, não.
    expect((await fake({ set_income_reference: { ...ref, amount_cents: '600000' } }).setIncomeReference('chave-0004', 'ctx', '2026-09', 0, 600000, false)).amountCents).toBe(600000);
    expect(await failure(fake({ set_income_reference: { ...ref, amount_cents: 'muito' } }).setIncomeReference('chave-0005', 'ctx', '2026-09', 0, 600000, false))).toEqual(['desconhecido', 'valor_inconsistente', null]);
    // Sem retorno, nunca uma referência inventada.
    expect(await failure(fake({}).setIncomeReference('chave-0006', 'ctx', '2026-09', 0, 600000, false))).toEqual(['desconhecido', 'desconhecido', null]);
  });

  it('metas: argumentos de cada função, prazo como AAAA-MM-01, observação nula e leitura da meta e do movimento', async () => {
    calls.length = 0;
    const result = { goal, movement };
    const repo = fake(
      { create_goal: result, update_goal: { goal, movement: null }, set_goal_status: { goal, movement: null }, delete_goal: { goal: { ...goal, deleted_at: 'c', saved_cents: 0, initial_cents: 0, deposits_cents: 0, last_movement_on: null }, movement: null }, add_goal_movement: result, update_goal_movement: result, delete_goal_movement: result },
      { goal_items: { data: [goal] }, goal_movements: { data: [movement] } },
    );
    const goalOut = {
      id: 'g1',
      contextId: 'ctx',
      goalType: 'emergencia',
      name: 'Reserva para imprevistos',
      targetCents: 2250000,
      targetMonth: '2029-12',
      plannedMonthlyCents: 50000,
      essentialBaseCents: 375000,
      essentialMonths: 6,
      essentialBaseSource: 'media_gastos',
      status: 'ativa',
      createdBy: 'p1',
      version: 1,
      createdAt: 'a',
      updatedAt: 'b',
      savedCents: 350000,
      initialCents: 300000,
      depositsCents: 50000,
      withdrawalsCents: 0,
      incomeCents: 0,
      appreciationCents: 0,
      depreciationCents: 0,
      lastMovementOn: '2026-10-06',
    };
    const movementOut = { id: 'm1', goalId: 'g1', contextId: 'ctx', kind: 'aporte', amountCents: 50000, occurredOn: '2026-10-06', note: null, accountId: null, createdBy: 'p1', version: 1, createdAt: 'a', updatedAt: 'b' };
    expect(await repo.listGoals('ctx')).toEqual([goalOut]);
    expect(await repo.getGoal('g1')).toEqual(goalOut);
    expect(await repo.listGoalMovements('g1')).toEqual([movementOut]);
    expect(await repo.listGoalMovementsInMonth('ctx', '2026-10')).toEqual([movementOut]);
    expect(await fake({}, { goal_items: { data: null } }).getGoal('nada')).toBeNull();

    expect(await repo.createGoal('chave-1001', 'ctx', goalInput)).toEqual({ goal: goalOut, movement: movementOut });
    await repo.createGoal('chave-1002', 'ctx', { ...goalInput, targetMonth: null, initialCents: null, initialOn: null });
    await repo.updateGoal('chave-1003', 'g1', 2, goalInput);
    await repo.setGoalStatus('chave-1004', 'g1', 3, 'arquivada');
    const deleted = await repo.deleteGoal('chave-1005', 'g1', 4);
    expect([deleted.goal.savedCents, deleted.goal.lastMovementOn, deleted.movement]).toEqual([0, null, null]);
    await repo.addGoalMovement('chave-1006', 'g1', 'resgate', { amountCents: 100, occurredOn: '2026-10-07', note: 'Conserto' });
    await repo.updateGoalMovement('chave-1007', 'm1', 2, { amountCents: 200, occurredOn: '2026-10-07', note: null });
    await repo.deleteGoalMovement('chave-1008', 'm1', 3);
    const fields = (input: NewGoalInput, month: string | null) => ({
      p_goal_type: input.goalType,
      p_name: input.name,
      p_target_cents: input.targetCents,
      p_target_month: month,
      p_planned_monthly_cents: input.plannedMonthlyCents,
      p_essential_base_cents: null,
      p_essential_months: null,
      p_essential_base_source: null,
    });
    expect(calls.slice(-8)).toEqual([
      ['create_goal', { p_idempotency_key: 'chave-1001', p_context_id: 'ctx', ...fields(goalInput, '2027-03-01'), p_initial_cents: 10000, p_initial_on: '2026-10-01' }],
      ['create_goal', { p_idempotency_key: 'chave-1002', p_context_id: 'ctx', ...fields(goalInput, null), p_initial_cents: null, p_initial_on: null }],
      ['update_goal', { p_idempotency_key: 'chave-1003', p_goal_id: 'g1', p_expected_version: 2, ...fields(goalInput, '2027-03-01') }],
      ['set_goal_status', { p_idempotency_key: 'chave-1004', p_goal_id: 'g1', p_expected_version: 3, p_status: 'arquivada' }],
      ['delete_goal', { p_idempotency_key: 'chave-1005', p_goal_id: 'g1', p_expected_version: 4 }],
      ['add_goal_movement', { p_idempotency_key: 'chave-1006', p_goal_id: 'g1', p_kind: 'resgate', p_amount_cents: 100, p_occurred_on: '2026-10-07', p_note: 'Conserto' }],
      ['update_goal_movement', { p_idempotency_key: 'chave-1007', p_movement_id: 'm1', p_expected_version: 2, p_amount_cents: 200, p_occurred_on: '2026-10-07', p_note: null }],
      ['delete_goal_movement', { p_idempotency_key: 'chave-1008', p_movement_id: 'm1', p_expected_version: 3 }],
    ]);
  });

  it('meta e movimento incoerentes são recusados: nunca mostrar um guardado ou um alvo errado', async () => {
    const bad = (g: object) => failure(fake({ create_goal: { goal: g, movement: null } }).createGoal('chave-2001', 'ctx', goalInput));
    const code = ['desconhecido', 'meta_inconsistente', null];
    expect(await bad({ ...goal, goal_type: 'poupanca' })).toEqual(code);
    expect(await bad({ ...goal, status: 'pausada' })).toEqual(code);
    expect(await bad({ ...goal, target_month: '2029-12-15' })).toEqual(code);
    expect(await bad({ ...goal, target_cents: 2250001 })).toEqual(code);
    expect(await bad({ ...goal, essential_base_source: 'chute' })).toEqual(code);
    expect(await bad({ ...goal, essential_months: null })).toEqual(code);
    expect(await bad({ ...goal, goal_type: 'objetivo' })).toEqual(code);
    expect(await bad({ ...goal, saved_cents: 350001 })).toEqual(code);
    expect(await bad({ ...goal, last_movement_on: '06/10/2026' })).toEqual(code);
    const objective = { ...goal, goal_type: 'objetivo', essential_base_cents: null, essential_months: null, essential_base_source: null };
    expect(await bad(objective)).toBeNull();
    const withMovement = (m: object) => failure(fake({ add_goal_movement: { goal, movement: m } }).addGoalMovement('chave-2002', 'g1', 'aporte', { amountCents: 1, occurredOn: '2026-10-07', note: null }));
    const movementCode = ['desconhecido', 'movimento_inconsistente', null];
    expect(await withMovement({ ...movement, kind: 'doacao' })).toEqual(movementCode);
    expect(await withMovement({ ...movement, amount_cents: 0 })).toEqual(movementCode);
    expect(await withMovement({ ...movement, amount_cents: -5 })).toEqual(movementCode);
    expect(await withMovement({ ...movement, occurred_on: '2026-10-6' })).toEqual(movementCode);
    expect(await withMovement({ ...movement, note: '' })).toEqual(movementCode);
    expect(await withMovement({ ...movement, note: 'x'.repeat(81) })).toEqual(movementCode);
    expect(await withMovement({ ...movement, note: 'x'.repeat(80) })).toBeNull();
    // Retorno sem meta: nunca uma meta inventada.
    expect(await failure(fake({ add_goal_movement: { goal: null, movement } }).addGoalMovement('chave-2003', 'g1', 'aporte', { amountCents: 1, occurredOn: '2026-10-07', note: null }))).toEqual(['desconhecido', 'desconhecido', null]);
  });

  it('findGoalOperation: meta pelo alvo; movimento pela meta do movimento; movimento ou meta ilegível devolve a meta em branco', async () => {
    expect(await fake({}, { record_operations: { data: null } }).findGoalOperation('x')).toBeNull();
    expect(await fake({}, { record_operations: { data: { action: 'criar_meta', target_id: 'g9' } } }).findGoalOperation('x')).toEqual({ action: 'criar_meta', goalId: 'g9', movementId: null });
    expect(await fake({}, { record_operations: { data: { action: 'excluir_meta', target_id: 'g9' } } }).findGoalOperation('x')).toEqual({ action: 'excluir_meta', goalId: 'g9', movementId: null });
    const tables = (row: unknown) => ({ record_operations: { data: { action: 'alterar_movimento_meta', target_id: 'm9' } }, goal_movements: { data: row } });
    expect(await fake({}, tables({ goal_id: 'g1' })).findGoalOperation('x')).toEqual({ action: 'alterar_movimento_meta', goalId: 'g1', movementId: 'm9' });
    expect(await fake({}, tables(null)).findGoalOperation('x')).toEqual({ action: 'alterar_movimento_meta', goalId: '', movementId: 'm9' });
    expect(await failure(fake({}, { record_operations: { data: { action: 'criar_meta', target_id: null } } }).findGoalOperation('x'))).toEqual(['desconhecido', 'operacao_inconsistente', null]);
  });

  it('plano de guardar: argumentos (valor nulo explícito), leitura da linha e linha incoerente recusada', async () => {
    calls.length = 0;
    const repo = fake({ set_savings_answer: check }, { savings_checks: { data: check } });
    const expected = { contextId: 'ctx', answer: 'consigo', monthlyCents: 30000, answeredOn: '2026-10-07', askAgainOn: null, version: 1, createdAt: 'a', updatedAt: 'b' };
    expect(await repo.getSavingsCheck('ctx')).toEqual(expected);
    expect(await fake({}, { savings_checks: { data: null } }).getSavingsCheck('ctx')).toBeNull();
    expect(await repo.setSavingsAnswer('chave-3001', 'ctx', 0, 'consigo', 30000)).toEqual(expected);
    await repo.setSavingsAnswer('chave-3002', 'ctx', 1, 'depois');
    expect(calls).toEqual([
      ['set_savings_answer', { p_idempotency_key: 'chave-3001', p_context_id: 'ctx', p_expected_version: 0, p_answer: 'consigo', p_monthly_cents: 30000 }],
      ['set_savings_answer', { p_idempotency_key: 'chave-3002', p_context_id: 'ctx', p_expected_version: 1, p_answer: 'depois', p_monthly_cents: null }],
    ]);
    const bad = (row: object) => failure(fake({ set_savings_answer: row }).setSavingsAnswer('chave-3003', 'ctx', 0, 'consigo', 30000));
    const code = ['desconhecido', 'guardar_inconsistente', null];
    expect(await bad({ ...check, answer: 'talvez' })).toEqual(code);
    expect(await bad({ ...check, monthly_cents: null })).toEqual(code);
    expect(await bad({ ...check, monthly_cents: 99 })).toEqual(code);
    expect(await bad({ ...check, ask_again_on: '2026-11-06' })).toEqual(code);
    expect(await bad({ ...check, answer: 'agora_nao' })).toEqual(code);
    expect(await bad({ ...check, answer: 'agora_nao', monthly_cents: null, ask_again_on: null })).toEqual(code);
    expect(await bad({ ...check, answer: 'agora_nao', monthly_cents: null, ask_again_on: '2026-10-07' })).toEqual(code);
    expect(await bad({ ...check, answer: 'agora_nao', monthly_cents: null, ask_again_on: '2026-11-06' })).toBeNull();
    expect(await bad({ ...check, answered_on: '7/10/2026' })).toEqual(code);
    expect(await bad({ ...check, version: 0 })).toEqual(code);
  });

  it('listas longas são lidas em páginas de 500, na ordem, até a última (uma lista incompleta nunca aparece como completa)', async () => {
    const rows = Array.from({ length: 1203 }, (_, i) => ({ ...movement, id: `m${String(i).padStart(4, '0')}` }));
    const ranges: [number, number][] = [];
    const db = {
      from: () => {
        const q: Record<string, unknown> = {};
        for (const m of ['select', 'eq', 'is', 'gte', 'lt', 'order']) q[m] = () => q;
        q.range = (from: number, to: number) => {
          ranges.push([from, to]);
          const page = { data: rows.slice(from, to + 1), error: null };
          return { then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => Promise.resolve(page).then(resolve, reject) };
        };
        return q;
      },
    };
    const repo = new SupabaseRepository(db as unknown as SupabaseClient, { id: 'p1' });
    const list = await repo.listGoalMovements('g1');
    expect(list.map((m) => m.id)).toEqual(rows.map((m) => m.id));
    expect(ranges).toEqual([[0, 499], [500, 999], [1000, 1499]]);
    // Uma página exata de 500 pede a seguinte, que vem vazia.
    ranges.length = 0;
    rows.length = 500;
    expect(await repo.listGoalMovementsInMonth('ctx', '2026-10')).toHaveLength(500);
    expect(ranges).toEqual([[0, 499], [500, 999]]);
  });

  it('códigos de erro: cada um volta com o próprio nome (o mais longo vence); só dois detalhes seguem, e nada é registrado em log', async () => {
    const codes = [
      'referencia_fora_do_intervalo',
      'mes_invalido',
      'reserva_ja_existe',
      'nome_da_meta_invalido',
      'alvo_acima_do_limite',
      'alvo_invalido',
      'prazo_invalido',
      'meses_invalidos',
      'origem_invalida',
      'plano_invalido',
      'saldo_inicial_invalido',
      'observacao_longa',
      'situacao_invalida',
      'meta_arquivada',
      'saldo_da_meta_insuficiente',
      'resposta_invalida',
      // Os que já existiam e as metas reaproveitam, inclusive o que termina com outro código.
      'valor_invalido',
      'valor_acima_do_limite',
      'modo_de_valor_invalido',
      'tipo_invalido',
      'data_invalida',
      'data_futura',
      'versao_desatualizada',
      'chave_reutilizada',
      'nao_encontrado',
      'sem_permissao',
    ] as const;
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => undefined));
    try {
      for (const code of codes) {
        // O PostgREST manda o nome em message (às vezes com prefixo) e o texto do Postgres em details.
        for (const message of [code, `ERROR: ${code}`]) {
          const repo = fake({}, {}, { message, code: 'PT409', details: 'Key (id)=(0000)=(segredo) já existe. 12345678' });
          expect(await failure(repo.addGoalMovement('chave-4001', 'g1', 'aporte', { amountCents: 1, occurredOn: '2026-10-07', note: null }))).toEqual([code, code, null]);
          expect(await failure(repo.setSavingsAnswer('chave-4002', 'ctx', 0, 'depois'))).toEqual([code, code, null]);
          expect(await failure(repo.setIncomeReference('chave-4003', 'ctx', '2026-09', 0, 100, false))).toEqual([code, code, null]);
        }
      }
      // Detalhes: só "dia=AAAA-MM-DD" (saldo da meta) e "versao_atual=N" (versão), e só nesses dois códigos.
      const withDetails = (message: string, details: unknown) =>
        failure(fake({}, {}, { message, code: 'PT409', details }).addGoalMovement('chave-4004', 'g1', 'resgate', { amountCents: 1, occurredOn: '2026-10-07', note: null }));
      expect(await withDetails('saldo_da_meta_insuficiente', 'dia=2026-10-02')).toEqual(['saldo_da_meta_insuficiente', 'saldo_da_meta_insuficiente', 'dia=2026-10-02']);
      expect(await withDetails('saldo_da_meta_insuficiente', 'dia=2026-10-02 (valor R$ 3.500,00)')).toEqual(['saldo_da_meta_insuficiente', 'saldo_da_meta_insuficiente', null]);
      expect(await withDetails('saldo_da_meta_insuficiente', 'versao_atual=2')).toEqual(['saldo_da_meta_insuficiente', 'saldo_da_meta_insuficiente', null]);
      expect(await withDetails('versao_desatualizada', 'versao_atual=12')).toEqual(['versao_desatualizada', 'versao_desatualizada', 'versao_atual=12']);
      expect(await withDetails('versao_desatualizada', 'dia=2026-10-02')).toEqual(['versao_desatualizada', 'versao_desatualizada', null]);
      expect(await withDetails('versao_desatualizada', 'versao_atual=2; Key (id)=(1)')).toEqual(['versao_desatualizada', 'versao_desatualizada', null]);
      expect(await withDetails('versao_desatualizada', null)).toEqual(['versao_desatualizada', 'versao_desatualizada', null]);
      expect(await withDetails('sem_permissao', 'versao_atual=2')).toEqual(['sem_permissao', 'sem_permissao', null]);
      // Erro de rede e erro desconhecido não carregam nenhum detalhe.
      expect(await failure(fake({}, {}, { message: 'Failed to fetch' }).listGoals('ctx'))).toEqual(['rede', 'rede', null]);
      expect(await failure(fake({}, {}, { message: 'falha estranha', code: 'XX000', details: 'dia=2026-10-02' }).setSavingsAnswer('chave-4005', 'ctx', 0, 'depois'))).toEqual(['desconhecido', 'falha estranha', null]);
      for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  });
});

// ---------------------------------------------------------------------------
// Ciclo E · cartões de crédito (D-037) e notas fiscais (D-038)
// ---------------------------------------------------------------------------

describe('API real: cartões de crédito e notas fiscais (Ciclo E, D-037 e D-038)', () => {
  // Bruno repete a sequência de aceite cinco anos adiante (hoje 07/10/2031), num período em que nenhum bloco anterior gravou
  // nada. Ana é a pessoa de fora. Cartões, notas e pessoas FICTÍCIOS; as notas vêm da nota de exemplo do core (homologação,
  // domínio inexistente) e o app só manda o RESUMO da chave, nunca a chave de 44 caracteres.
  const T0 = '2031-10-07';
  const AFTER_CLOSING = '2031-11-12';
  const OCT = '2031-10';
  const NOV = '2031-11';
  const DEC = '2031-12';
  const JAN = '2032-01';
  const AUG = '2032-08';
  const bruno = repoFor(BRUNO, T0);
  // O dia seguinte ao fechamento de novembro (03/11): só então a fatura de novembro aceita o pagamento.
  const late = repoFor(BRUNO, AFTER_CLOSING);
  const ana = repoFor(ANA, T0);
  let ctx = '';
  let account = '';
  let card: Card;
  let tenis: CardEntry;
  let notebook: CardEntry;
  let restaurante: CardEntry;
  let anuidade: CardEntry;
  let estorno: CardEntry;

  const nubank: CardInput = { name: 'Nubank', lastDigits: '1234', closingDay: 3, dueDay: 10, limitCents: 500000 };
  const purchase = (description: string, totalCents: Cents, purchasedOn: IsoDate, installments = 1, category: string | null = 'Lazer') => ({
    description,
    category,
    purchasedOn,
    totalCents,
    installments,
  });
  const invoicesOf = (c: Pick<Card, 'id' | 'closingDay' | 'dueDay'> = card, today: IsoDate = T0) => loadInvoices(repoFor(BRUNO, today), c, today);
  const totalsOf = async (c: Card = card) => (await bruno.listInvoiceItems(c.id)).map((i) => [i.month, i.totalCents]);
  const paidOfOctober = async () => summarizeMonth(await bruno.listRecords(ctx, OCT), ctx, OCT).paidCents;
  const code = (p: Promise<unknown>) =>
    p.then(
      () => null,
      (e: unknown) => (e instanceof RepoError ? [e.code, e.detail ?? null] : String(e)),
    );
  /** O resumo da nota de exemplo do mês, e a chave de 44 caracteres que NUNCA pode chegar ao banco. */
  const note = (month: IsoMonth) => {
    const r = readReceiptCode(exampleReceiptQr(month));
    if (!r.ok) throw new Error('nota de exemplo inválida');
    return { digest: r.key.digest, rawKey: r.key.key };
  };

  /** month_committed pela API é igual ao summarizeCommitted do core, inclusive o grupo "Faturas de cartão". */
  const committedCard = async (month: IsoMonth) => {
    const repo = repoFor(BRUNO, T0);
    const s = summarizeCommitted(await repo.listCommitments(ctx, month), ctx, month, T0, await repo.listIncomeReferences(ctx), await repo.listSeries(ctx));
    const { data, error } = await clientFor(BRUNO, T0).rpc('month_committed', { p_context_id: ctx, p_month: `${month}-01` }).single();
    expect(error).toBeNull();
    const r = data as CommittedRow & { card_cents: number; card_permille: number | null };
    expect([Number(r.card_cents), r.card_permille === null ? null : Number(r.card_permille), Number(r.committed_cents), Number(r.other_cents)]).toEqual([
      s.cardCents,
      s.cardPermille,
      s.committedCents,
      s.otherCents,
    ]);
    return s;
  };

  beforeAll(async () => {
    const space = (await bruno.getSpace())!;
    ctx = space.personalContextId;
    account = space.accounts[0]!.id;
  });

  it('cadastrar o cartão guarda só apelido e final; repetir a chave devolve o mesmo cartão', async () => {
    expect(await bruno.listCards(ctx)).toEqual([]);
    const key = newOperationKey();
    const w = await bruno.createCard(key, ctx, nubank);
    card = w.card;
    expect(card).toMatchObject({
      name: 'Nubank',
      lastDigits: '1234',
      closingDay: 3,
      dueDay: 10,
      limitCents: 500000,
      status: 'ativo',
      version: 1,
      usedCents: 0,
      // Hoje (07/10) já passou do fechamento de outubro: a compra de hoje cai na fatura que vence em novembro.
      currentMonth: NOV,
      currentClosingOn: '2031-11-03',
      currentDueOn: '2031-11-10',
    });
    expect([w.entry, w.invoices, w.commitments]).toEqual([null, [], []]);
    expect((await bruno.createCard(key, ctx, nubank)).card.id).toBe(card.id);
    expect(await code(bruno.createCard(key, ctx, { ...nubank, closingDay: 4 }))).toEqual(['chave_reutilizada', null]);
    expect(await bruno.findCardOperation(key)).toEqual({ action: 'criar_cartao', cardId: card.id, entryId: null, commitmentId: null, recordId: null });
    expect(await bruno.findCardOperation(newOperationKey())).toBeNull();
    expect(await bruno.listCards(ctx)).toEqual([card]);
    expect(await bruno.getCard(card.id)).toEqual(card);
    // A tabela nunca guarda mais que o apelido e os 4 últimos dígitos.
    const row = await clientFor(BRUNO).from('cards').select('*').eq('id', card.id).single();
    expect(Object.keys(row.data!).filter((k) => /number|numero|cvv|expir|validade|cpf/i.test(k))).toEqual([]);
  });

  it('validação do cartão também no banco, na ordem das conferências', async () => {
    const make = (patch: Partial<CardInput>) => code(bruno.createCard(newOperationKey(), ctx, { ...nubank, ...patch }));
    expect(await make({ name: '' })).toEqual(['apelido_invalido', null]);
    expect(await make({ name: 'x'.repeat(31) })).toEqual(['apelido_invalido', null]);
    // Número de cartão no apelido, com qualquer separador: o app nunca guarda.
    expect(await make({ name: '4111 1111 1111 1111' })).toEqual(['apelido_invalido', null]);
    expect(await make({ name: '4111-1111-1111-1111' })).toEqual(['apelido_invalido', null]);
    expect(await make({ lastDigits: '12a4' })).toEqual(['final_invalido', null]);
    expect(await make({ lastDigits: '12345' })).toEqual(['final_invalido', null]);
    expect(await make({ closingDay: 0 })).toEqual(['dia_de_fechamento_invalido', null]);
    expect(await make({ dueDay: 32 })).toEqual(['dia_de_vencimento_invalido', null]);
    expect(await make({ limitCents: 50 })).toEqual(['limite_invalido', null]);
    expect(await make({ limitCents: 1_000_000_000 })).toEqual(['limite_invalido', null]);
    // Apelido com dígitos espalhados é aceito; sem final e sem limite também.
    const free = await bruno.createCard(newOperationKey(), ctx, { name: 'Conta 0001 12345678-9', lastDigits: null, closingDay: 31, dueDay: 5, limitCents: null });
    expect([free.card.name, free.card.lastDigits, free.card.limitCents]).toEqual(['Conta 0001 12345678-9', null, null]);
    await bruno.deleteCard(newOperationKey(), free.card.id, free.card.version);
    expect((await bruno.listCards(ctx)).map((c) => c.id)).toEqual([card.id]);
  });

  it('outra pessoa não vê o cartão, não lança nem cria cartão no contexto', async () => {
    expect(await ana.getCard(card.id)).toBeNull();
    expect(await ana.listCards(ctx)).toEqual([]);
    expect(await ana.listCardEntries(card.id)).toEqual([]);
    expect(await ana.listInvoiceItems(card.id)).toEqual([]);
    expect(await ana.listInvoiceCommitments(card.id)).toEqual([]);
    expect(await code(ana.addCardPurchase(newOperationKey(), card.id, purchase('Invasão', 100, T0)))).toEqual(['nao_encontrado', null]);
    expect(await code(ana.updateCard(newOperationKey(), card.id, 1, nubank))).toEqual(['nao_encontrado', null]);
    expect(await code(ana.deleteCard(newOperationKey(), card.id, 1))).toEqual(['nao_encontrado', null]);
    expect(await code(ana.payInvoice(newOperationKey(), card.id, NOV, 1, 100, T0))).toEqual(['nao_encontrado', null]);
    expect(await code(ana.createCard(newOperationKey(), ctx, nubank))).toEqual(['sem_permissao', null]);
    expect(await ana.findCardOperation(newOperationKey())).toBeNull();
    // Gravação direta nas tabelas de cartão é recusada.
    const direct = await clientFor(BRUNO).from('cards').insert({ context_id: ctx, nickname: 'Direto', closing_day: 1, due_day: 2, created_by: BRUNO });
    expect(direct.error).not.toBeNull();
    expect((await clientFor(null).from('card_items').select('id')).data ?? []).toEqual([]);
  });

  it('compras parceladas viram faturas e contas a pagar; compra no cartão não entra em Pago', async () => {
    const t = await bruno.addCardPurchase(newOperationKey(), card.id, purchase('Tênis de corrida', 60000, '2031-10-05', 3));
    tenis = t.entry!;
    expect(tenis).toMatchObject({ kind: 'compra', description: 'Tênis de corrida', category: 'Lazer', amountCents: 60000, installments: 3, invoiceMonth: NOV, purchasedOn: '2031-10-05', receiptKey: null, version: 1 });
    expect(t.invoices.map((i) => [i.month, i.totalCents])).toEqual([[NOV, 20000], [DEC, 20000], [JAN, 20000]]);
    expect(t.commitments.map((c) => [c.invoice!.month, c.amountCents])).toEqual([[NOV, 20000], [DEC, 20000], [JAN, 20000]]);
    notebook = (await bruno.addCardPurchase(newOperationKey(), card.id, purchase('Notebook', 150000, '2031-10-05', 10, 'Educação'))).entry!;
    restaurante = (await bruno.addCardPurchase(newOperationKey(), card.id, purchase('Restaurante', 20000, '2031-10-06'))).entry!;
    expect(notebook.invoiceMonth).toBe(NOV);

    // Novembro 550,00; dezembro e janeiro 350,00; de fevereiro a agosto 150,00 (as dez faturas do Notebook).
    const expected = [[NOV, 55000], [DEC, 35000], [JAN, 35000], ...['2032-02', '2032-03', '2032-04', '2032-05', '2032-06', '2032-07', AUG].map((m) => [m, 15000])];
    expect(await totalsOf()).toEqual(expected);
    const invoices = await invoicesOf();
    expect(invoices.map((i) => [i.month, i.totalCents])).toEqual(expected);
    expect((await bruno.getCard(card.id))!.usedCents).toBe(230000);
    expect(cardLimitUsed(invoices)).toBe(230000);
    expect(await paidOfOctober()).toBe(0);
    expect((await bruno.listCardEntries(card.id)).map((e) => e.id)).toEqual([tenis.id, notebook.id, restaurante.id]);
    expect(await bruno.getCardEntry(notebook.id)).toEqual(notebook);

    // A conta da fatura é uma conta a pagar comum, estimada até o fechamento, e o "Ainda a pagar" a conta uma vez.
    // listCommitments traz também as abertas de outros meses: só a fatura que vence em novembro.
    const nov = (await bruno.listCommitments(ctx, NOV)).filter((c) => c.invoice?.month === NOV);
    expect(nov).toHaveLength(1);
    expect(nov[0]).toMatchObject({
      description: 'Fatura Nubank',
      amountCents: 55000,
      dueOn: '2031-11-10',
      status: 'aberto',
      amountIsEstimate: true,
      category: null,
      series: null,
      invoice: { cardId: card.id, month: NOV, closingOn: '2031-11-03' },
    });
    expect((await bruno.listInvoiceCommitments(card.id)).map((c) => [c.invoice!.month, c.amountCents])).toEqual(expected);
    const toPay = await checkedToPay(BRUNO, ctx, NOV, T0);
    expect([toPay.dueInMonthCents, toPay.estimatedCents]).toEqual([55000, 55000]);
    expect((await committedCard(NOV)).cardCents).toBe(55000);
  });

  it('compra recusada pelo banco: parcelas, data, valor, descrição e categoria', async () => {
    const buy = (patch: Partial<ReturnType<typeof purchase>>) => code(bruno.addCardPurchase(newOperationKey(), card.id, { ...purchase('Teste', 1000, T0), ...patch }));
    expect(await buy({ installments: 49 })).toEqual(['parcelas_invalidas', null]);
    expect(await buy({ installments: 0 })).toEqual(['parcelas_invalidas', null]);
    expect(await buy({ totalCents: 2, installments: 3 })).toEqual(['parcelas_invalidas', null]);
    expect(await buy({ purchasedOn: '2031-10-08' })).toEqual(['data_futura', null]);
    expect(await buy({ purchasedOn: '2027-09-30' })).toEqual(['data_invalida', null]);
    expect(await buy({ totalCents: 0 })).toEqual(['valor_invalido', null]);
    expect(await buy({ totalCents: 1_000_000_000 })).toEqual(['valor_acima_do_limite', null]);
    expect(await buy({ description: '  ' })).toEqual(['descricao_obrigatoria', null]);
    expect(await buy({ description: 'x'.repeat(81) })).toEqual(['descricao_longa', null]);
    expect(await buy({ category: 'x'.repeat(41) })).toEqual(['categoria_invalida', null]);
    expect(await bruno.listCardEntries(card.id)).toHaveLength(3);
  });

  it('encargo e estorno entram na fatura; editar e excluir respeitam versão e tipo', async () => {
    anuidade = (await bruno.addCardCharge(newOperationKey(), card.id, { chargeType: 'anuidade', amountCents: 3000, invoiceMonth: NOV })).entry!;
    expect(anuidade).toMatchObject({ kind: 'encargo', chargeType: 'anuidade', amountCents: 3000, invoiceMonth: NOV, description: null, category: null, purchasedOn: null, installments: 1 });
    const r = await bruno.addCardRefund(newOperationKey(), card.id, { description: 'Devolução da loja', category: 'Lazer', amountCents: 5000, invoiceMonth: NOV });
    estorno = r.entry!;
    expect(estorno).toMatchObject({ kind: 'estorno', description: 'Devolução da loja', category: 'Lazer', amountCents: 5000, invoiceMonth: NOV, sourceMonth: null });
    // 550,00 + 30,00 de anuidade - 50,00 de estorno.
    expect(r.invoices.find((i) => i.month === NOV)).toMatchObject({ totalCents: 53000, purchasesCents: 55000, chargesCents: 3000, refundsCents: 5000, carriedInCents: 0, creditCents: 0 });
    expect((await bruno.listCommitments(ctx, NOV)).find((c) => c.invoice?.month === NOV)!.amountCents).toBe(53000);
    expect((await committedCard(NOV)).cardCents).toBe(53000);

    const bad = (input: Parameters<typeof bruno.addCardCharge>[2]) => code(bruno.addCardCharge(newOperationKey(), card.id, input));
    expect(await bad({ chargeType: 'taxa' as 'juros', amountCents: 100, invoiceMonth: NOV })).toEqual(['tipo_de_encargo_invalido', null]);
    expect(await bad({ chargeType: 'juros', amountCents: 0, invoiceMonth: NOV })).toEqual(['valor_invalido', null]);
    expect(await bad({ chargeType: 'juros', amountCents: 100, invoiceMonth: '2036-01' })).toEqual(['mes_invalido', null]);
    expect(await code(bruno.addCardRefund(newOperationKey(), card.id, { description: '', category: null, amountCents: 100, invoiceMonth: NOV }))).toEqual(['descricao_obrigatoria', null]);

    // Editar o encargo: valor novo inteiro, versão nova; a versão antiga não sobrescreve; tipo errado é recusado.
    const edited = await bruno.updateCardEntry(newOperationKey(), anuidade.id, anuidade.version, { kind: 'encargo', chargeType: 'tarifa', amountCents: 3500, invoiceMonth: NOV });
    expect(edited.entry).toMatchObject({ id: anuidade.id, chargeType: 'tarifa', amountCents: 3500, version: anuidade.version + 1 });
    expect(edited.invoices.find((i) => i.month === NOV)!.totalCents).toBe(53500);
    expect(await code(bruno.updateCardEntry(newOperationKey(), anuidade.id, anuidade.version, { kind: 'encargo', chargeType: 'anuidade', amountCents: 3000, invoiceMonth: NOV }))).toEqual(['versao_desatualizada', expect.stringMatching(/^versao_atual=\d+$/)]);
    expect(await code(bruno.updateCardEntry(newOperationKey(), anuidade.id, edited.entry!.version, { kind: 'estorno', description: 'x', category: null, amountCents: 3500, invoiceMonth: NOV }))).toEqual(['tipo_invalido', null]);
    const back = await bruno.updateCardEntry(newOperationKey(), anuidade.id, edited.entry!.version, { kind: 'encargo', chargeType: 'anuidade', amountCents: 3000, invoiceMonth: NOV });
    anuidade = back.entry!;
    expect(back.invoices.find((i) => i.month === NOV)!.totalCents).toBe(53000);

    // Campo que o tipo não usa: o app nunca o manda, e o banco recusa se vier.
    const raw = await clientFor(BRUNO, T0).rpc('update_card_entry', {
      p_idempotency_key: newOperationKey(),
      p_entry_id: anuidade.id,
      p_expected_version: anuidade.version,
      p_kind: 'encargo',
      p_amount_cents: 3000,
      p_occurred_on: null,
      p_description: 'não se aplica',
      p_category: null,
      p_invoice_month: `${NOV}-01`,
      p_charge_kind: 'anuidade',
    });
    expect(raw.error?.message).toBe('campo_nao_se_aplica');

    // Compra: descrição e categoria mudam com valor, data e parcelas iguais; o total é sempre o novo inteiro.
    const renamed = await bruno.updateCardEntry(newOperationKey(), restaurante.id, restaurante.version, { kind: 'compra', ...purchase('Restaurante japonês', 20000, '2031-10-06') });
    restaurante = renamed.entry!;
    expect(restaurante).toMatchObject({ description: 'Restaurante japonês', amountCents: 20000, version: 2 });
    expect(await totalsOf()).toContainEqual([NOV, 53000]);
  });

  it('pagamento parcial: gasto em Pago, saldo anterior na fatura seguinte, Por categoria e desfazer', async () => {
    const nov = (await bruno.listInvoiceItems(card.id)).find((i) => i.month === NOV)!;
    expect(nov).toMatchObject({ status: 'aberta', totalCents: 53000, toPayCents: 53000, amountIsEstimate: true, paidRecordId: null });
    // Em 07/10 a fatura de novembro ainda está aberta (fecha em 03/11): o banco recusa o pagamento, qualquer que seja o valor.
    expect(await code(bruno.payInvoice(newOperationKey(), card.id, NOV, nov.commitmentVersion!, 30000, T0))).toEqual(['fatura_aberta', null]);
    expect(await code(bruno.payInvoice(newOperationKey(), card.id, NOV, nov.commitmentVersion!, 0, T0))).toEqual(['fatura_aberta', null]);
    expect(await code(bruno.payInvoice(newOperationKey(), card.id, DEC, 1, 100, T0))).toEqual(['versao_desatualizada', expect.stringMatching(/^versao_atual=\d+$/)]);
    expect(await paidOfOctober()).toBe(0);
    // Em 12/11 ela já fechou: o pagamento vale, e a data pode ser anterior ao fechamento (quem pagou antes informa o dia).
    const pay = (patch: Partial<{ version: number; cents: Cents; on: IsoDate; accountId: string | null }> = {}) =>
      late.payInvoice(newOperationKey(), card.id, NOV, patch.version ?? nov.commitmentVersion!, patch.cents ?? 30000, patch.on ?? T0, patch.accountId ?? null);
    expect(await code(pay({ cents: 0 }))).toEqual(['valor_invalido', null]);
    expect(await code(pay({ cents: 53001 }))).toEqual(['valor_acima_da_fatura', null]);
    expect(await code(pay({ on: '2031-11-13' }))).toEqual(['data_futura', null]);
    expect(await code(pay({ on: '2020-01-01' }))).toEqual(['data_invalida', null]);
    expect(await code(pay({ version: nov.commitmentVersion! + 5 }))).toEqual(['versao_desatualizada', expect.stringMatching(/^versao_atual=\d+$/)]);
    expect(await code(pay({ accountId: randomUUID() }))).toEqual(['conta_invalida', null]);
    expect(await code(late.payInvoice(newOperationKey(), card.id, '2031-03', 1, 100, T0))).toEqual(['nao_encontrado', null]);
    expect(await paidOfOctober()).toBe(0);

    const key = newOperationKey();
    const paid = await late.payInvoice(key, card.id, NOV, nov.commitmentVersion!, 30000, T0, account);
    expect(paid.record).toMatchObject({
      kind: 'despesa',
      amountCents: 30000,
      occurredOn: T0,
      description: 'Fatura Nubank (novembro)',
      category: null,
      accountId: account,
      commitmentId: paid.commitment.id,
      invoice: { cardId: card.id, month: NOV },
      receiptKey: null,
    });
    expect(paid.commitment).toMatchObject({ status: 'quitado', payment: { recordId: paid.record.id, amountCents: 30000, paidOn: T0 }, invoice: { cardId: card.id, month: NOV } });
    // 530,00 - 300,00: 230,00 viram o saldo anterior de dezembro, sem juros.
    expect(paid.entry).toMatchObject({ kind: 'saldo_anterior', amountCents: 23000, invoiceMonth: DEC, sourceMonth: NOV, paymentRecordId: paid.record.id, description: null });
    expect(paid.invoices.find((i) => i.month === NOV)).toMatchObject({ status: 'paga_em_parte', paidCents: 30000, paidOn: T0, paidRecordId: paid.record.id, leftOverCents: 23000, toPayCents: 0 });
    expect(paid.invoices.find((i) => i.month === DEC)).toMatchObject({ totalCents: 58000, carriedInCents: 23000, status: 'aberta' });
    expect(paid.commitments.find((c) => c.invoice!.month === DEC)!.amountCents).toBe(58000);
    // Repetir a chave devolve o mesmo pagamento; a operação é achada pela chave.
    expect((await late.payInvoice(key, card.id, NOV, nov.commitmentVersion!, 30000, T0, account)).record.id).toBe(paid.record.id);
    expect(await bruno.findCardOperation(key)).toEqual({ action: 'pagar_fatura', cardId: card.id, entryId: null, commitmentId: paid.commitment.id, recordId: paid.record.id });
    expect(await paidOfOctober()).toBe(30000);
    expect((await committedCard(DEC)).cardCents).toBe(58000);

    // Por categoria: o pagamento se divide pelas categorias da fatura; sem a fatura, cai em "Sem categoria".
    const records = await bruno.listRecords(ctx, OCT);
    const shares = categoryBreakdown(records, await loadInvoicesOfRecords(bruno, records, T0));
    expect(shares.reduce((sum, r) => sum + r.cents, 0)).toBe(30000);
    expect(shares.length).toBeGreaterThan(1);
    expect(categoryBreakdown(records).map((r) => [r.category, r.cents])).toEqual([[null, 30000]]);
    expect(await bruno.getRecord(paid.record.id)).toEqual(paid.record);

    // O gasto de um pagamento de fatura só muda de conta e de data; a conta da fatura só muda pelo cartão.
    expect(await code(bruno.deleteRecord(newOperationKey(), paid.record.id, paid.record.version))).toEqual(['pagamento_de_fatura', null]);
    const same = { accountId: account, amountCents: 30000, occurredOn: T0, description: paid.record.description, category: null };
    expect(await code(bruno.updateRecord(newOperationKey(), paid.record.id, paid.record.version, { ...same, amountCents: 29000 }))).toEqual(['pagamento_de_fatura', null]);
    expect(await code(bruno.updateRecord(newOperationKey(), paid.record.id, paid.record.version, { ...same, description: 'Outra' }))).toEqual(['pagamento_de_fatura', null]);
    const moved = await bruno.updateRecord(newOperationKey(), paid.record.id, paid.record.version, { ...same, occurredOn: '2031-10-06' });
    expect([moved.occurredOn, moved.invoice]).toEqual(['2031-10-06', { cardId: card.id, month: NOV }]);
    const novItem = (await bruno.listInvoiceItems(card.id)).find((i) => i.month === NOV)!;
    expect([novItem.paidOn, novItem.status]).toEqual(['2031-10-06', 'paga_em_parte']);

    // Conta de fatura: nenhuma função de conta a pagar a toca.
    const dec = paid.commitments.find((c) => c.invoice!.month === DEC)!;
    const novCommitment = (await bruno.getCommitment(paid.commitment.id))!;
    const input: CommitmentInput = { amountCents: 1000, dueOn: dec.dueOn, description: 'Outra', category: null };
    expect(await code(bruno.updateCommitment(newOperationKey(), dec.id, dec.version, input))).toEqual(['conta_de_fatura', null]);
    expect(await code(bruno.deleteCommitment(newOperationKey(), dec.id, dec.version))).toEqual(['conta_de_fatura', null]);
    expect(await code(bruno.payCommitment(newOperationKey(), dec.id, dec.version, { accountId: account, amountCents: dec.amountCents, paidOn: T0, category: null }))).toEqual(['conta_de_fatura', null]);
    expect(await code(bruno.undoCommitmentPayment(newOperationKey(), novCommitment.id, novCommitment.version))).toEqual(['conta_de_fatura', null]);
    expect(await code(pay({ version: novCommitment.version }))).toEqual(['compromisso_quitado', null]);

    // Desfazer: apaga o gasto e o saldo anterior e reabre a conta.
    expect(await code(bruno.undoInvoicePayment(newOperationKey(), card.id, NOV, novCommitment.version + 3))).toEqual(['versao_desatualizada', expect.stringMatching(/^versao_atual=\d+$/)]);
    expect(await code(bruno.undoInvoicePayment(newOperationKey(), card.id, DEC, dec.version))).toEqual(['compromisso_aberto', null]);
    const undone = await bruno.undoInvoicePayment(newOperationKey(), card.id, NOV, novCommitment.version);
    expect(undone.record.id).toBe(paid.record.id);
    expect(undone.commitment).toMatchObject({ status: 'aberto', payment: null, amountCents: 53000 });
    expect(undone.entry).toMatchObject({ id: paid.entry!.id, kind: 'saldo_anterior' });
    expect(undone.invoices.find((i) => i.month === NOV)).toMatchObject({ status: 'aberta', totalCents: 53000, paidRecordId: null });
    expect(undone.invoices.find((i) => i.month === DEC)).toMatchObject({ totalCents: 35000, carriedInCents: 0 });
    expect(await bruno.getRecord(paid.record.id)).toBeNull();
    expect(await bruno.getCardEntry(paid.entry!.id)).toBeNull();
    expect(await paidOfOctober()).toBe(0);
    expect((await bruno.getCard(card.id))!.usedCents).toBe(230000 + 3000 - 5000);
    await checkedToPay(BRUNO, ctx, DEC, T0);
  });

  it('a fatura aberta não aceita pagamento; depois do fechamento paga com a data real; a compra de uma fatura paga é recusada', async () => {
    const lost = new SupabaseRepository(clientFor(BRUNO, AFTER_CLOSING, lostResponse), { id: BRUNO });
    const nov = (await bruno.listInvoiceItems(card.id)).find((i) => i.month === NOV)!;
    // Em 07/10 (novembro fecha em 03/11) o pagamento é recusado e nada é gravado; dezembro, que ainda não começou, também.
    expect(await code(bruno.payInvoice(newOperationKey(), card.id, NOV, nov.commitmentVersion!, 53000, T0))).toEqual(['fatura_aberta', null]);
    const decItem = (await bruno.listInvoiceItems(card.id)).find((i) => i.month === DEC)!;
    expect(await code(late.payInvoice(newOperationKey(), card.id, DEC, decItem.commitmentVersion!, 35000, T0))).toEqual(['fatura_aberta', null]);
    expect(await paidOfOctober()).toBe(0);
    expect(cardErrorText('fatura_aberta', { closingOn: nov.closingOn })).toBe(
      'Esta fatura ainda está aberta. Registre o pagamento depois do fechamento, em 03/11/2031. Se você já pagou antes, use a data em que pagou.',
    );
    // Em 12/11 a resposta se perde: o resultado é incerto, e a chave diz se gravou (e repetir não paga duas vezes). A data do
    // pagamento é anterior ao fechamento: o dia em que a pessoa pagou de fato.
    const key = newOperationKey();
    expect(await err(lost.payInvoice(key, card.id, NOV, nov.commitmentVersion!, 53000, T0))).toBe('rede');
    const op = await bruno.findCardOperation(key);
    expect(op).toMatchObject({ action: 'pagar_fatura', cardId: card.id, entryId: null });
    const replay = await late.payInvoice(key, card.id, NOV, nov.commitmentVersion!, 53000, T0);
    expect([replay.record.id, replay.commitment.id]).toEqual([op!.recordId, op!.commitmentId]);
    expect(await paidOfOctober()).toBe(53000);
    expect((await bruno.listInvoiceItems(card.id)).find((i) => i.month === NOV)).toMatchObject({ status: 'paga', paidCents: 53000, leftOverCents: 0 });

    // Sem desvio: a compra vai sempre para a fatura natural. A de 12/11 (depois do fechamento) é de dezembro; a de 07/10 é de
    // novembro, que está paga, e é recusada (o banco já a cobrou ali).
    const faturas = await invoicesOf(card, AFTER_CLOSING);
    expect(purchaseFirstInvoiceMonth(card, AFTER_CLOSING)).toBe(DEC);
    expect(purchaseFirstInvoiceMonth(card, T0)).toBe(NOV);
    expect(purchasePreview(card, T0, 1, paidInvoiceMonths(faturas), AFTER_CLOSING)).toMatchObject({ blocked: true });
    expect(purchasePreview(card, AFTER_CLOSING, 3, paidInvoiceMonths(faturas), AFTER_CLOSING)).toMatchObject({ blocked: false });
    const mercado = await late.addCardPurchase(newOperationKey(), card.id, purchase('Mercado', 10000, AFTER_CLOSING, 1, 'Alimentação'));
    expect(mercado.entry).toMatchObject({ invoiceMonth: DEC, purchasedOn: AFTER_CLOSING });
    expect(await totalsOf()).toContainEqual([DEC, 45000]);
    expect((await bruno.getCard(card.id))!.usedCents).toBe(cardLimitUsed(await invoicesOf()));
    expect(cardLimitUsed(await invoicesOf())).toBe(185000 + 10000 - 10000);
    expect(await code(late.addCardPurchase(newOperationKey(), card.id, purchase('Esquecida de outubro', 5000, T0)))).toEqual(['fatura_paga', null]);

    // Fatura paga não aceita encargo, estorno nem mudança de valor, data ou parcelas; só descrição e categoria.
    expect(await code(bruno.addCardCharge(newOperationKey(), card.id, { chargeType: 'juros', amountCents: 100, invoiceMonth: NOV }))).toEqual(['fatura_paga', null]);
    expect(await code(bruno.addCardRefund(newOperationKey(), card.id, { description: 'x', category: null, amountCents: 100, invoiceMonth: NOV }))).toEqual(['fatura_paga', null]);
    expect(await code(bruno.updateCardEntry(newOperationKey(), tenis.id, tenis.version, { kind: 'compra', ...purchase('Tênis de corrida', 61000, '2031-10-05', 3) }))).toEqual(['fatura_paga', null]);
    expect(await code(bruno.deleteCardEntry(newOperationKey(), tenis.id, tenis.version))).toEqual(['fatura_paga', null]);
    const relabel = await bruno.updateCardEntry(newOperationKey(), tenis.id, tenis.version, { kind: 'compra', ...purchase('Tênis de corrida azul', 60000, '2031-10-05', 3, 'Vestuário') });
    tenis = relabel.entry!;
    expect(tenis).toMatchObject({ description: 'Tênis de corrida azul', category: 'Vestuário', amountCents: 60000, invoiceMonth: NOV });

    // Depois do fechamento de novembro (12/11), uma compra de 20/10 pertence a ela: a fatura já foi paga, e nada é gravado.
    const before = (await bruno.listCardEntries(card.id)).length;
    expect(await code(late.addCardPurchase(newOperationKey(), card.id, purchase('Esquecida', 5000, '2031-10-20')))).toEqual(['fatura_paga', null]);
    expect((await bruno.listCardEntries(card.id)).length).toBe(before);
    // Depois do fechamento a conta paga deixa de ser estimada; as seguintes ainda são.
    const lateItems = await late.listInvoiceItems(card.id);
    expect(lateItems.find((i) => i.month === NOV)).toMatchObject({ status: 'paga', amountIsEstimate: false });
    expect(lateItems.find((i) => i.month === DEC)).toMatchObject({ status: 'aberta', amountIsEstimate: true });

    // Desfazer o pagamento reabre novembro; a compra de dezembro fica até ser excluída.
    const undone = await bruno.undoInvoicePayment(newOperationKey(), card.id, NOV, replay.commitment.version);
    expect([undone.entry, undone.commitment.status]).toEqual([null, 'aberto']);
    expect(await paidOfOctober()).toBe(0);
    const removed = await bruno.deleteCardEntry(newOperationKey(), mercado.entry!.id, mercado.entry!.version);
    expect(removed.entry).toMatchObject({ id: mercado.entry!.id });
    expect(await bruno.getCardEntry(mercado.entry!.id)).toBeNull();
    expect(await totalsOf()).toContainEqual([DEC, 35000]);
  });

  it('crédito maior que a fatura é levado como estorno automático; o automático não se edita', async () => {
    const w = await bruno.createCard(newOperationKey(), ctx, { name: 'Mercado', lastDigits: null, closingDay: 3, dueDay: 10, limitCents: null });
    const other = w.card;
    const geladeira = (await bruno.addCardPurchase(newOperationKey(), other.id, purchase('Geladeira', 45000, '2031-10-05', 3, 'Moradia'))).entry!;
    const refund = await bruno.addCardRefund(newOperationKey(), other.id, { description: 'Devolução', category: 'Moradia', amountCents: 40000, invoiceMonth: NOV });
    // 150,00 - 400,00 = -250,00 em novembro; levados a dezembro: 150,00 - 250,00 = -100,00; janeiro: 150,00 - 100,00 = 50,00.
    expect(await totalsOf(other)).toEqual([[NOV, -25000], [DEC, -10000], [JAN, 5000]]);
    const items = await bruno.listInvoiceItems(other.id);
    expect(items.map((i) => [i.creditCents, i.commitmentId === null])).toEqual([[25000, true], [10000, true], [0, false]]);
    expect((await bruno.listInvoiceCommitments(other.id)).map((c) => [c.invoice!.month, c.amountCents])).toEqual([[JAN, 5000]]);
    expect((await bruno.getCard(other.id))!.usedCents).toBe(5000);
    expect(cardLimitUsed(await invoicesOf(other))).toBe(5000);
    const automatic = (await bruno.listCardEntries(other.id))
      .filter((e) => e.kind === 'estorno' && e.description === null)
      .sort((a, b) => a.invoiceMonth.localeCompare(b.invoiceMonth));
    expect(automatic.map((e) => [e.invoiceMonth, e.sourceMonth, e.amountCents])).toEqual([[DEC, NOV, 25000], [JAN, DEC, 10000]]);
    const auto = automatic[0]!;
    expect(await code(bruno.updateCardEntry(newOperationKey(), auto.id, auto.version, { kind: 'estorno', description: 'x', category: null, amountCents: 1, invoiceMonth: DEC }))).toEqual(['lancamento_automatico', null]);
    expect(await code(bruno.deleteCardEntry(newOperationKey(), auto.id, auto.version))).toEqual(['lancamento_automatico', null]);

    // Sem conta a pagar, não há fatura para pagar.
    expect(await code(bruno.payInvoice(newOperationKey(), other.id, NOV, 1, 100, T0))).toEqual(['nao_encontrado', null]);
    // Arquivado não recebe compra, mas aceita encargo; reativar volta ao normal.
    const archived = await bruno.setCardStatus(newOperationKey(), other.id, other.version, 'arquivado');
    expect(archived.card).toMatchObject({ status: 'arquivado', version: other.version + 1 });
    expect(await code(bruno.addCardPurchase(newOperationKey(), other.id, purchase('Nova', 100, T0)))).toEqual(['cartao_arquivado', null]);
    const fee = await bruno.addCardCharge(newOperationKey(), other.id, { chargeType: 'iof', amountCents: 100, invoiceMonth: JAN });
    expect(await code(bruno.setCardStatus(newOperationKey(), other.id, other.version, 'ativo'))).toEqual(['versao_desatualizada', expect.stringMatching(/^versao_atual=\d+$/)]);
    expect(await code(bruno.setCardStatus(newOperationKey(), other.id, archived.card.version, 'suspenso' as 'ativo'))).toEqual(['situacao_invalida', null]);
    const active = await bruno.setCardStatus(newOperationKey(), other.id, archived.card.version, 'ativo');
    expect(active.card.status).toBe('ativo');

    // Excluir: só sem lançamentos; as contas somem junto com os lançamentos.
    expect(await code(bruno.deleteCard(newOperationKey(), other.id, active.card.version))).toEqual(['cartao_com_lancamentos', null]);
    await bruno.deleteCardEntry(newOperationKey(), fee.entry!.id, fee.entry!.version);
    await bruno.deleteCardEntry(newOperationKey(), refund.entry!.id, refund.entry!.version);
    const last = await bruno.deleteCardEntry(newOperationKey(), geladeira.id, geladeira.version);
    expect(last.invoices).toEqual([]);
    expect(await bruno.listCardEntries(other.id)).toEqual([]);
    expect(await bruno.listInvoiceCommitments(other.id)).toEqual([]);
    expect(await code(bruno.deleteCard(newOperationKey(), other.id, active.card.version))).toBeNull();
    expect(await bruno.getCard(other.id)).toBeNull();
    expect((await bruno.listCards(ctx)).map((c) => c.id)).toEqual([card.id]);
  });

  it('nota fiscal: só o resumo da chave chega ao banco; nota repetida é achada antes de salvar', async () => {
    const a = note('2031-10');
    const b = note('2031-09');
    expect(a.digest).toMatch(/^[0-9a-f]{64}$/);
    expect(a.digest).not.toBe(b.digest);
    expect(await bruno.findReceipt(ctx, a.digest)).toBeNull();
    // Resumo malformado e chave inteira nem chegam ao banco.
    expect(await bruno.findReceipt(ctx, 'abc')).toBeNull();
    expect(await bruno.findReceipt(ctx, a.rawKey)).toBeNull();
    expect(await bruno.findReceipt(ctx, a.digest.toUpperCase())).toBeNull();
    // A chave inteira é recusada pelo banco, em gasto e em compra; receita não leva nota.
    const expense = { accountId: account, amountCents: 8740, occurredOn: T0, description: 'Mercado', category: 'Alimentação' };
    expect(await code(bruno.createRecord(newOperationKey(), ctx, 'despesa', { ...expense, receiptKey: a.rawKey }))).toEqual(['chave_de_nota_invalida', null]);
    expect(await code(bruno.addCardPurchase(newOperationKey(), card.id, { ...purchase('Mercado', 8740, T0), receiptKey: a.rawKey }))).toEqual(['chave_de_nota_invalida', null]);
    expect(await code(bruno.createRecord(newOperationKey(), ctx, 'receita', { ...expense, receiptKey: b.digest }))).toEqual(['chave_de_nota_invalida', null]);

    // Gasto com nota.
    const key = newOperationKey();
    const record = await bruno.createRecord(key, ctx, 'despesa', { ...expense, receiptKey: b.digest });
    expect(record).toMatchObject({ receiptKey: b.digest, invoice: null, commitmentId: null });
    expect((await bruno.createRecord(key, ctx, 'despesa', { ...expense, receiptKey: b.digest })).id).toBe(record.id);
    expect(await bruno.findReceipt(ctx, b.digest)).toEqual({ recordId: record.id, cardEntryId: null, cardId: null });
    expect(await code(bruno.createRecord(newOperationKey(), ctx, 'despesa', { ...expense, receiptKey: b.digest }))).toEqual(['nota_ja_anotada', `registro=${record.id}`]);
    expect(await code(bruno.addCardPurchase(newOperationKey(), card.id, { ...purchase('Mercado', 8740, T0), receiptKey: b.digest }))).toEqual(['nota_ja_anotada', `registro=${record.id}`]);
    // A edição ignora a chave: continua a mesma e a nota continua achada.
    const edited = await bruno.updateRecord(newOperationKey(), record.id, record.version, { ...expense, amountCents: 8800, receiptKey: a.digest });
    expect([edited.amountCents, edited.receiptKey]).toEqual([8800, b.digest]);

    // Compra no cartão com nota (na parcela 1).
    const purchaseKey = newOperationKey();
    const bought = await bruno.addCardPurchase(purchaseKey, card.id, { ...purchase('Farmácia', 9000, T0, 3, 'Saúde'), receiptKey: a.digest });
    const entry = bought.entry!;
    expect(entry).toMatchObject({ kind: 'compra', receiptKey: a.digest, installments: 3 });
    expect((await bruno.addCardPurchase(purchaseKey, card.id, { ...purchase('Farmácia', 9000, T0, 3, 'Saúde'), receiptKey: a.digest })).entry!.id).toBe(entry.id);
    expect(await bruno.findReceipt(ctx, a.digest)).toEqual({ recordId: null, cardEntryId: entry.id, cardId: card.id });
    expect(await bruno.getCardEntry(entry.id)).toEqual(entry);
    expect((await bruno.getCard(card.id))!.id).toBe(card.id);
    expect(await code(bruno.createRecord(newOperationKey(), ctx, 'despesa', { ...expense, receiptKey: a.digest }))).toEqual(['nota_ja_anotada', `compra=${entry.id}`]);
    expect(await code(bruno.addCardPurchase(newOperationKey(), card.id, { ...purchase('Outra vez', 100, T0), receiptKey: a.digest }))).toEqual(['nota_ja_anotada', `compra=${entry.id}`]);
    // Editar a compra não mexe na nota.
    const renamed = await bruno.updateCardEntry(newOperationKey(), entry.id, entry.version, { kind: 'compra', ...purchase('Farmácia do bairro', 9000, T0, 3, 'Saúde') });
    expect(renamed.entry).toMatchObject({ description: 'Farmácia do bairro', receiptKey: a.digest });

    // Quem não lê o contexto não descobre a nota; no banco só há resumos, nunca a chave.
    expect(await ana.findReceipt(ctx, a.digest)).toBeNull();
    expect(await ana.getCardEntry(entry.id)).toBeNull();
    const stored = JSON.stringify([
      (await clientFor(BRUNO).from('financial_records').select('*').eq('context_id', ctx)).data,
      (await clientFor(BRUNO).from('card_entries').select('*').eq('card_id', card.id)).data,
      (await clientFor(BRUNO).from('receipt_items').select('*').eq('context_id', ctx)).data,
    ]);
    expect(stored).toContain(a.digest);
    expect(stored).not.toContain(a.rawKey);
    expect(stored).not.toContain(a.rawKey.slice(6, 20));

    // Excluir libera a nota para ser anotada de novo.
    await bruno.deleteCardEntry(newOperationKey(), entry.id, renamed.entry!.version);
    expect(await bruno.findReceipt(ctx, a.digest)).toBeNull();
    const again = await bruno.createRecord(newOperationKey(), ctx, 'despesa', { ...expense, receiptKey: a.digest });
    expect(await bruno.findReceipt(ctx, a.digest)).toEqual({ recordId: again.id, cardEntryId: null, cardId: null });
    await bruno.deleteRecord(newOperationKey(), again.id, again.version);
    await bruno.deleteRecord(newOperationKey(), record.id, edited.version);
    expect(await bruno.findReceipt(ctx, b.digest)).toBeNull();
  });

  it('compra com a resposta perdida: a chave mostra se foi gravada e repetir não duplica', async () => {
    const lost = new SupabaseRepository(clientFor(BRUNO, T0, lostResponse), { id: BRUNO });
    const before = (await bruno.listCardEntries(card.id)).length;
    const key = newOperationKey();
    const input = purchase('Padaria', 1500, T0, 1, 'Alimentação');
    expect(await err(lost.addCardPurchase(key, card.id, input))).toBe('rede');
    const op = await bruno.findCardOperation(key);
    expect(op).toMatchObject({ action: 'criar_compra_cartao', cardId: card.id, commitmentId: null, recordId: null });
    expect(op!.entryId).not.toBeNull();
    const replay = await bruno.addCardPurchase(key, card.id, input);
    expect(replay.entry!.id).toBe(op!.entryId);
    expect((await bruno.listCardEntries(card.id)).length).toBe(before + 1);
    expect(await code(bruno.addCardPurchase(key, card.id, { ...input, totalCents: 1600 }))).toEqual(['chave_reutilizada', null]);
    // Uma recusa não grava operação: a chave pode ser usada de novo.
    const refusedKey = newOperationKey();
    expect(await code(bruno.addCardPurchase(refusedKey, card.id, { ...input, totalCents: 0 }))).toEqual(['valor_invalido', null]);
    expect(await bruno.findCardOperation(refusedKey)).toBeNull();
    await bruno.deleteCardEntry(newOperationKey(), replay.entry!.id, replay.entry!.version);
  });

  it('limite de cartões ativos, exclusão do cartão e limpeza', async () => {
    const extra: Card[] = [];
    // Até 20 ativos por contexto (já há um).
    for (let n = 1; n <= 19; n++) {
      extra.push((await bruno.createCard(newOperationKey(), ctx, { name: `Lote ${n}`, lastDigits: null, closingDay: 5, dueDay: 12, limitCents: null })).card);
    }
    expect(await code(bruno.createCard(newOperationKey(), ctx, { name: 'Lote 20', lastDigits: null, closingDay: 5, dueDay: 12, limitCents: null }))).toEqual(['limite_de_cartoes', null]);
    // Arquivar um libera a vaga, e reativar com 20 ativos é recusado.
    const first = extra[0]!;
    const archived = await bruno.setCardStatus(newOperationKey(), first.id, first.version, 'arquivado');
    const slot = await bruno.createCard(newOperationKey(), ctx, { name: 'Lote 20', lastDigits: null, closingDay: 5, dueDay: 12, limitCents: null });
    expect(await code(bruno.setCardStatus(newOperationKey(), first.id, archived.card.version, 'ativo'))).toEqual(['limite_de_cartoes', null]);
    expect((await bruno.listCards(ctx)).map((c) => c.name)).toHaveLength(21);
    for (const c of [...extra.slice(1), slot.card]) await bruno.deleteCard(newOperationKey(), c.id, c.version);
    await bruno.deleteCard(newOperationKey(), first.id, archived.card.version);
    expect((await bruno.listCards(ctx)).map((c) => c.id)).toEqual([card.id]);

    // O Nubank: com lançamentos não se exclui; sem eles, sim, e as contas das faturas somem com os lançamentos.
    const fresh = (await bruno.getCard(card.id))!;
    expect(await code(bruno.deleteCard(newOperationKey(), card.id, fresh.version))).toEqual(['cartao_com_lancamentos', null]);
    for (const e of await bruno.listCardEntries(card.id)) await bruno.deleteCardEntry(newOperationKey(), e.id, e.version);
    expect(await bruno.listInvoiceItems(card.id)).toEqual([]);
    expect(await bruno.listInvoiceCommitments(card.id)).toEqual([]);
    const edited = await bruno.updateCard(newOperationKey(), card.id, fresh.version, { ...nubank, name: 'Nubank Ultravioleta', limitCents: 800000 });
    expect(await code(bruno.updateCard(newOperationKey(), card.id, fresh.version, nubank))).toEqual(['versao_desatualizada', expect.stringMatching(/^versao_atual=\d+$/)]);
    expect(edited.card).toMatchObject({ name: 'Nubank Ultravioleta', limitCents: 800000 });
    const deleted = await bruno.deleteCard(newOperationKey(), card.id, edited.card.version);
    expect(deleted.card.id).toBe(card.id);
    expect(await bruno.getCard(card.id)).toBeNull();
    expect(await bruno.listCards(ctx)).toEqual([]);
    expect((await bruno.listCommitments(ctx, NOV)).filter((c) => c.invoice)).toEqual([]);
  });
});

describe('conversor dos cartões e das notas fiscais', () => {
  // Sem rede: os argumentos de cada função, a leitura das linhas (AAAA-MM-01 ↔ AAAA-MM, bigint), a recusa de linha incoerente
  // e os códigos de erro novos.
  const calls: [string, Record<string, unknown>][] = [];
  const DIGEST = 'a'.repeat(64);
  const cardRow = {
    id: 'c1',
    context_id: 'ctx',
    nickname: 'Nubank',
    last_digits: '1234',
    closing_day: 3,
    due_day: 10,
    limit_cents: 500000,
    status: 'ativo',
    created_by: 'p1',
    version: 1,
    created_at: 'a',
    updated_at: 'b',
    used_cents: 230000,
    current_month: '2026-11-01',
    current_closing_on: '2026-11-03',
    current_due_on: '2026-11-10',
    deleted_at: null,
    deleted_by: null,
  };
  const entryRow = {
    id: 'e1',
    context_id: 'ctx',
    card_id: 'c1',
    kind: 'compra',
    description: 'Tênis',
    category: 'Lazer',
    charge_kind: null,
    purchased_on: '2026-10-05',
    amount_cents: 60000,
    installments: 3,
    invoice_month: '2026-11-01',
    source_month: null,
    payment_record_id: null,
    receipt_key: DIGEST,
    created_by: 'p1',
    version: 1,
    created_at: 'a',
    updated_at: 'b',
  };
  const invoiceRow = {
    card_id: 'c1',
    context_id: 'ctx',
    month: '2026-11-01',
    closing_on: '2026-11-03',
    due_on: '2026-11-10',
    status: 'aberta',
    total_cents: 20000,
    purchases_cents: 20000,
    charges_cents: 0,
    carried_in_cents: 0,
    refunds_cents: 0,
    credit_cents: 0,
    entry_count: 1,
    commitment_id: 'm1',
    commitment_version: 1,
    amount_is_estimate: true,
    to_pay_cents: 20000,
    paid_record_id: null,
    paid_cents: null,
    paid_on: null,
    paid_account_id: null,
    left_over_cents: null,
  };
  const commitmentRow = {
    id: 'm1',
    context_id: 'ctx',
    description: 'Fatura Nubank',
    amount_cents: 20000,
    currency: 'BRL',
    due_on: '2026-11-10',
    status: 'aberto',
    category: null,
    created_by: 'p1',
    version: 1,
    created_at: 'a',
    updated_at: 'b',
    paid_record_id: null,
    paid_on: null,
    paid_amount_cents: null,
    paid_account_id: null,
    series_id: null,
    occurrence_number: null,
    series_override: false,
    amount_is_estimate: true,
    series_kind: null,
    series_nature: null,
    series_installment_total: null,
    series_parts_per_year: null,
    card_id: 'c1',
    invoice_month: '2026-11-01',
    card_closing_on: '2026-11-03',
  };
  const recordRow = {
    id: 'r1',
    context_id: 'ctx',
    account_id: 'a1',
    kind: 'despesa',
    status: 'realizado',
    amount_cents: 20000,
    currency: 'BRL',
    occurred_on: '2026-10-07',
    description: 'Fatura Nubank (novembro)',
    category: null,
    commitment_id: 'm1',
    card_id: 'c1',
    invoice_month: '2026-11-01',
    receipt_key: null,
    created_by: 'p1',
    version: 1,
    created_at: 'a',
    updated_at: 'b',
  };
  const write = { card: cardRow, entry: entryRow, entries: [], invoices: [invoiceRow], commitments: [commitmentRow], commitment: null, record: null };
  const payment = { ...write, entry: null, commitment: { ...commitmentRow, status: 'quitado', paid_record_id: 'r1', paid_on: '2026-10-07', paid_amount_cents: 20000, paid_account_id: 'a1' }, record: recordRow };

  const query = (result: { data: unknown; error: unknown }) => {
    const q: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'in', 'is', 'gte', 'lt', 'order', 'range', 'limit']) q[m] = () => q;
    q.maybeSingle = async () => ({ data: Array.isArray(result.data) ? (result.data[0] ?? null) : result.data, error: result.error });
    q.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => Promise.resolve(result).then(resolve, reject);
    return q;
  };
  const fake = (rpc: Record<string, unknown>, tables: Record<string, { data: unknown; error?: unknown }> = {}, error: unknown = null) => {
    const db = {
      from: (table: string) => query(error ? { data: null, error } : { data: tables[table]?.data ?? null, error: tables[table]?.error ?? null }),
      // create_record devolve a linha e a chamada termina em .single(); as outras, jsonb sem .single().
      rpc: (fn: string, args: Record<string, unknown>) => {
        calls.push([fn, args]);
        const result = error ? { data: null, error } : { data: rpc[fn] ?? null, error: null };
        return Object.assign(Promise.resolve(result), { single: async () => result });
      },
    };
    return new SupabaseRepository(db as unknown as SupabaseClient, { id: 'p1' });
  };
  const failure = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => (e instanceof RepoError ? [e.code, e.message, e.detail ?? null] : String(e)));
  const cardOut = {
    id: 'c1',
    contextId: 'ctx',
    name: 'Nubank',
    lastDigits: '1234',
    closingDay: 3,
    dueDay: 10,
    limitCents: 500000,
    status: 'ativo',
    createdBy: 'p1',
    version: 1,
    createdAt: 'a',
    updatedAt: 'b',
    usedCents: 230000,
    currentMonth: '2026-11',
    currentClosingOn: '2026-11-03',
    currentDueOn: '2026-11-10',
  };
  const entryOut = {
    id: 'e1',
    contextId: 'ctx',
    cardId: 'c1',
    kind: 'compra',
    description: 'Tênis',
    category: 'Lazer',
    chargeType: null,
    purchasedOn: '2026-10-05',
    amountCents: 60000,
    installments: 3,
    invoiceMonth: '2026-11',
    sourceMonth: null,
    paymentRecordId: null,
    receiptKey: DIGEST,
    createdBy: 'p1',
    version: 1,
    createdAt: 'a',
    updatedAt: 'b',
  };

  it('leitura: cartão, lançamento, fatura e conta de fatura (mês AAAA-MM-01 vira AAAA-MM, fechamento gravado)', async () => {
    const repo = fake({}, { card_items: { data: [cardRow] }, card_entry_items: { data: [entryRow] }, invoice_items: { data: [invoiceRow] }, commitment_items: { data: [commitmentRow] } });
    expect(await repo.listCards('ctx')).toEqual([cardOut]);
    expect(await repo.getCard('c1')).toEqual(cardOut);
    expect(await repo.getCardEntry('e1')).toEqual(entryOut);
    expect(await repo.listCardEntries('c1')).toEqual([entryOut]);
    const [invoice] = await repo.listInvoiceItems('c1');
    expect(invoice).toMatchObject({ cardId: 'c1', month: '2026-11', closingOn: '2026-11-03', dueOn: '2026-11-10', status: 'aberta', totalCents: 20000, commitmentId: 'm1', commitmentVersion: 1, amountIsEstimate: true, paidCents: null, leftOverCents: null });
    const [account] = await repo.listInvoiceCommitments('c1');
    expect(account).toMatchObject({ id: 'm1', status: 'aberto', amountIsEstimate: true, series: null, invoice: { cardId: 'c1', month: '2026-11', closingOn: '2026-11-03' } });
    expect(await fake({}, { card_items: { data: null } }).getCard('nada')).toBeNull();
    // Conta e gasto comuns: sem fatura e sem nota.
    const plain = await fake({}, { commitment_items: { data: [{ ...commitmentRow, card_id: null, invoice_month: null, card_closing_on: null, amount_is_estimate: false }] } }).getCommitment('m1');
    expect(plain?.invoice).toBeNull();
    const rec = await fake({}, { financial_records: { data: [{ ...recordRow, card_id: null, invoice_month: null, receipt_key: DIGEST }] } }).getRecord('r1');
    expect([rec?.invoice, rec?.receiptKey]).toEqual([null, DIGEST]);
  });

  it('linhas incoerentes são recusadas: nunca mostrar um final, uma chave ou uma fatura errados', async () => {
    const card = (patch: object) => failure(fake({}, { card_items: { data: [{ ...cardRow, ...patch }] } }).getCard('c1'));
    for (const patch of [{ last_digits: '1234567890123456' }, { last_digits: '12' }, { status: 'suspenso' }, { closing_day: 0 }, { due_day: 32 }, { limit_cents: 0 }, { current_month: '2026-11-05' }]) {
      expect(await card(patch)).toEqual(['desconhecido', expect.stringMatching(/inconsistente$/), null]);
    }
    const entry = (patch: object) => failure(fake({}, { card_entry_items: { data: [{ ...entryRow, ...patch }] } }).getCardEntry('e1'));
    // A chave de 44 caracteres nunca é aceita no lugar do resumo.
    for (const patch of [{ receipt_key: '3'.repeat(44) }, { receipt_key: 'A'.repeat(64) }, { kind: 'estorno', receipt_key: DIGEST }, { kind: 'rebate' }, { installments: 49 }, { kind: 'encargo', purchased_on: null, installments: 1, charge_kind: 'taxa', receipt_key: null }, { purchased_on: null }, { invoice_month: '2026-11-15' }]) {
      expect(await entry(patch)).toEqual(['desconhecido', expect.stringMatching(/inconsistente$/), null]);
    }
    expect(await entry({ receipt_key: null })).toBeNull();
    const invoice = (patch: object) => failure(fake({}, { invoice_items: { data: [{ ...invoiceRow, ...patch }] } }).listInvoiceItems('c1'));
    for (const patch of [{ status: 'vencida' }, { commitment_version: null }, { status: 'paga' }, { paid_record_id: 'r1' }, { month: '2026-11-02' }]) {
      expect(await invoice(patch)).toEqual(['desconhecido', expect.stringMatching(/inconsistente$/), null]);
    }
    const record = (patch: object) => failure(fake({}, { financial_records: { data: [{ ...recordRow, ...patch }] } }).getRecord('r1'));
    for (const patch of [{ invoice_month: null }, { card_id: null }, { receipt_key: '3'.repeat(44) }]) {
      expect(await record(patch)).toEqual(['desconhecido', expect.stringMatching(/inconsistente$/), null]);
    }
    const account = (patch: object) => failure(fake({}, { commitment_items: { data: [{ ...commitmentRow, ...patch }] } }).getCommitment('m1'));
    for (const patch of [{ card_closing_on: null }, { invoice_month: null }, { series_id: 's1', occurrence_number: 1, series_kind: 'mensal', series_nature: 'fixo' }]) {
      expect(await account(patch)).toEqual(['desconhecido', expect.stringMatching(/inconsistente$/), null]);
    }
  });

  it('findReceipt: resumo malformado não consulta; gasto, compra e nada; linha incoerente é recusada', async () => {
    const find = (rows: unknown[] | null, digest = DIGEST) => fake({}, { receipt_items: { data: rows } }).findReceipt('ctx', digest);
    expect(await find([{ record_id: 'r1', card_entry_id: null, card_id: null }])).toEqual({ recordId: 'r1', cardEntryId: null, cardId: null });
    expect(await find([{ record_id: null, card_entry_id: 'e1', card_id: 'c1' }])).toEqual({ recordId: null, cardEntryId: 'e1', cardId: 'c1' });
    expect(await find([])).toBeNull();
    expect(await find(null)).toBeNull();
    expect(await find([{ record_id: 'r1', card_entry_id: null, card_id: null }], '3'.repeat(44))).toBeNull();
    expect(await find([{ record_id: 'r1', card_entry_id: null, card_id: null }], 'A'.repeat(64))).toBeNull();
    expect(await failure(find([{ record_id: 'r1', card_entry_id: 'e1', card_id: null }]))).toEqual(['desconhecido', 'nota_inconsistente', null]);
    expect(await failure(find([{ record_id: 'r1', card_entry_id: null, card_id: null }, { record_id: 'r2', card_entry_id: null, card_id: null }]))).toEqual(['desconhecido', 'nota_inconsistente', null]);
  });

  it('argumentos de cada função de cartão; o resumo da nota e a conta de saída só vão quando existem', async () => {
    calls.length = 0;
    const repo = fake({
      create_card: write,
      update_card: write,
      set_card_status: write,
      delete_card: write,
      add_card_purchase: write,
      update_card_entry: write,
      delete_card_entry: write,
      add_card_charge: write,
      add_card_refund: write,
      pay_invoice: payment,
      undo_invoice_payment: payment,
      create_record: recordRow,
    });
    const input = { name: 'Nubank', lastDigits: '1234', closingDay: 3, dueDay: 10, limitCents: 500000 };
    const base = { p_nickname: 'Nubank', p_last_digits: '1234', p_closing_day: 3, p_due_day: 10, p_limit_cents: 500000 };
    expect(await repo.createCard('chave-5001', 'ctx', input)).toEqual({ card: cardOut, entry: entryOut, invoices: [expect.objectContaining({ month: '2026-11' })], commitments: [expect.objectContaining({ id: 'm1' })] });
    await repo.updateCard('chave-5002', 'c1', 2, { ...input, lastDigits: null, limitCents: null });
    await repo.setCardStatus('chave-5003', 'c1', 3, 'arquivado');
    await repo.deleteCard('chave-5004', 'c1', 4);
    const p = { description: 'Tênis', category: 'Lazer', purchasedOn: '2026-10-05', totalCents: 60000, installments: 3 };
    await repo.addCardPurchase('chave-5005', 'c1', p);
    await repo.addCardPurchase('chave-5006', 'c1', { ...p, receiptKey: DIGEST });
    await repo.updateCardEntry('chave-5007', 'e1', 1, { kind: 'compra', ...p, receiptKey: DIGEST });
    await repo.updateCardEntry('chave-5008', 'e2', 1, { kind: 'encargo', chargeType: 'juros', amountCents: 700, invoiceMonth: '2026-12' });
    await repo.updateCardEntry('chave-5009', 'e3', 1, { kind: 'estorno', description: 'Devolução', category: null, amountCents: 900, invoiceMonth: '2026-12' });
    await repo.deleteCardEntry('chave-5010', 'e1', 2);
    await repo.addCardCharge('chave-5011', 'c1', { chargeType: 'anuidade', amountCents: 3000, invoiceMonth: '2026-11' });
    await repo.addCardRefund('chave-5012', 'c1', { description: 'Devolução', category: 'Lazer', amountCents: 5000, invoiceMonth: '2026-11' });
    const paid = await repo.payInvoice('chave-5013', 'c1', '2026-11', 1, 20000, '2026-10-07');
    await repo.payInvoice('chave-5014', 'c1', '2026-11', 1, 20000, '2026-10-07', 'a1');
    await repo.undoInvoicePayment('chave-5015', 'c1', '2026-11', 2);
    await repo.createRecord('chave-5016', 'ctx', 'despesa', { accountId: 'a1', amountCents: 100, occurredOn: '2026-10-07', description: 'Mercado', category: null });
    await repo.createRecord('chave-5017', 'ctx', 'despesa', { accountId: 'a1', amountCents: 100, occurredOn: '2026-10-07', description: 'Mercado', category: null, receiptKey: DIGEST });
    expect(paid.record).toMatchObject({ invoice: { cardId: 'c1', month: '2026-11' }, commitmentId: 'm1', receiptKey: null });
    expect(paid.commitment).toMatchObject({ status: 'quitado', payment: { recordId: 'r1', amountCents: 20000, paidOn: '2026-10-07', accountId: 'a1' } });
    expect(paid.entry).toBeNull();
    const k = (n: number) => ({ p_idempotency_key: `chave-${n}` });
    const pur = { p_purchased_on: '2026-10-05', p_total_cents: 60000, p_installments: 3, p_description: 'Tênis', p_category: 'Lazer' };
    const none = { p_installments: null, p_invoice_month: null, p_charge_kind: null };
    expect(calls).toEqual([
      ['create_card', { ...k(5001), p_context_id: 'ctx', ...base }],
      ['update_card', { ...k(5002), p_card_id: 'c1', p_expected_version: 2, ...base, p_last_digits: null, p_limit_cents: null }],
      ['set_card_status', { ...k(5003), p_card_id: 'c1', p_expected_version: 3, p_status: 'arquivado' }],
      ['delete_card', { ...k(5004), p_card_id: 'c1', p_expected_version: 4 }],
      ['add_card_purchase', { ...k(5005), p_card_id: 'c1', ...pur }],
      ['add_card_purchase', { ...k(5006), p_card_id: 'c1', ...pur, p_receipt_key: DIGEST }],
      // A chave da nota não muda depois de gravada: a edição nunca a manda.
      ['update_card_entry', { ...k(5007), p_entry_id: 'e1', p_expected_version: 1, p_kind: 'compra', p_amount_cents: 60000, p_occurred_on: '2026-10-05', p_description: 'Tênis', p_category: 'Lazer', p_installments: 3, p_invoice_month: null, p_charge_kind: null }],
      ['update_card_entry', { ...k(5008), p_entry_id: 'e2', p_expected_version: 1, p_kind: 'encargo', p_amount_cents: 700, p_occurred_on: null, p_description: null, p_category: null, ...none, p_invoice_month: '2026-12-01', p_charge_kind: 'juros' }],
      ['update_card_entry', { ...k(5009), p_entry_id: 'e3', p_expected_version: 1, p_kind: 'estorno', p_amount_cents: 900, p_occurred_on: null, p_description: 'Devolução', p_category: null, ...none, p_invoice_month: '2026-12-01' }],
      ['delete_card_entry', { ...k(5010), p_entry_id: 'e1', p_expected_version: 2 }],
      ['add_card_charge', { ...k(5011), p_card_id: 'c1', p_invoice_month: '2026-11-01', p_charge_kind: 'anuidade', p_amount_cents: 3000 }],
      ['add_card_refund', { ...k(5012), p_card_id: 'c1', p_invoice_month: '2026-11-01', p_amount_cents: 5000, p_description: 'Devolução', p_category: 'Lazer' }],
      ['pay_invoice', { ...k(5013), p_card_id: 'c1', p_month: '2026-11-01', p_expected_version: 1, p_paid_cents: 20000, p_paid_on: '2026-10-07' }],
      ['pay_invoice', { ...k(5014), p_card_id: 'c1', p_month: '2026-11-01', p_expected_version: 1, p_paid_cents: 20000, p_paid_on: '2026-10-07', p_account_id: 'a1' }],
      ['undo_invoice_payment', { ...k(5015), p_card_id: 'c1', p_month: '2026-11-01', p_expected_version: 2 }],
      ['create_record', { ...k(5016), p_context_id: 'ctx', p_account_id: 'a1', p_kind: 'despesa', p_amount_cents: 100, p_occurred_on: '2026-10-07', p_description: 'Mercado', p_category: null }],
      ['create_record', { ...k(5017), p_context_id: 'ctx', p_account_id: 'a1', p_kind: 'despesa', p_amount_cents: 100, p_occurred_on: '2026-10-07', p_description: 'Mercado', p_category: null, p_receipt_key: DIGEST }],
    ]);
    // Sem cartão ou sem conta/gasto no retorno do pagamento, nunca um resultado inventado.
    expect(await failure(fake({}).createCard('chave-5018', 'ctx', input))).toEqual(['desconhecido', 'desconhecido', null]);
    expect(await failure(fake({ pay_invoice: { ...payment, record: null } }).payInvoice('chave-5019', 'c1', '2026-11', 1, 100, '2026-10-07'))).toEqual(['desconhecido', 'desconhecido', null]);
    expect(await failure(fake({ undo_invoice_payment: { ...payment, commitment: null } }).undoInvoicePayment('chave-5020', 'c1', '2026-11', 1))).toEqual(['desconhecido', 'desconhecido', null]);
  });

  it('operação de cartão: ação, cartão, lançamento, conta e gasto', async () => {
    const op = { action: 'pagar_fatura', target_id: 'c1', entry_id: null, commitment_id: 'm1', record_id: 'r1' };
    expect(await fake({}, { record_operations: { data: [op] } }).findCardOperation('chave-6001')).toEqual({ action: 'pagar_fatura', cardId: 'c1', entryId: null, commitmentId: 'm1', recordId: 'r1' });
    expect(await fake({}, { record_operations: { data: [{ ...op, action: 'criar_compra_cartao', entry_id: 'e1', commitment_id: null, record_id: null }] } }).findCardOperation('chave-6002')).toEqual({
      action: 'criar_compra_cartao',
      cardId: 'c1',
      entryId: 'e1',
      commitmentId: null,
      recordId: null,
    });
    expect(await fake({}, { record_operations: { data: [] } }).findCardOperation('chave-6003')).toBeNull();
    expect(await failure(fake({}, { record_operations: { data: [{ ...op, target_id: null }] } }).findCardOperation('chave-6004'))).toEqual(['desconhecido', 'operacao_inconsistente', null]);
  });

  it('códigos de erro de cartão e de nota: o nome vai adiante, o texto do banco não', async () => {
    const codes = [
      'conta_de_fatura',
      'pagamento_de_fatura',
      'fatura_paga',
      'fatura_seguinte_paga',
      'dias_com_fatura_paga',
      'valor_acima_da_fatura',
      'lancamento_automatico',
      'campo_nao_se_aplica',
      'apelido_invalido',
      'final_invalido',
      'dia_de_fechamento_invalido',
      'dia_de_vencimento_invalido',
      'limite_invalido',
      'limite_de_cartoes',
      'limite_de_lancamentos',
      'cartao_arquivado',
      'cartao_com_lancamentos',
      'tipo_de_encargo_invalido',
      'chave_de_nota_invalida',
      'nota_ja_anotada',
      // Já existentes e usados pelos cartões.
      'compromisso_quitado',
      'compromisso_aberto',
      'mes_invalido',
      'situacao_invalida',
      'tipo_invalido',
      'parcelas_invalidas',
      'conta_invalida',
      'valor_invalido',
      'data_futura',
      'data_invalida',
      'versao_desatualizada',
    ];
    const input = { name: 'Nubank', lastDigits: null, closingDay: 3, dueDay: 10, limitCents: null };
    for (const c of codes) {
      for (const message of [c, `ERROR: ${c}`]) {
        const repo = fake({}, {}, { message, code: 'PT409', details: 'Key (id)=(0000)=(segredo) já existe. 12345678' });
        expect(await failure(repo.createCard('chave-7001', 'ctx', input))).toEqual([c, c, null]);
        expect(await failure(repo.payInvoice('chave-7002', 'c1', '2026-11', 1, 100, '2026-10-07'))).toEqual([c, c, null]);
        expect(await failure(repo.findReceipt('ctx', DIGEST))).toEqual([c, c, null]);
      }
    }
    // O detalhe da nota repetida (gasto ou compra) segue adiante só com a forma certa.
    const id = '3f2b8c1e-9d4a-4c55-8e7a-0b1c2d3e4f50';
    const withDetails = (message: string, details: unknown) => failure(fake({}, {}, { message, code: 'PT409', details }).createCard('chave-7003', 'ctx', input));
    expect(await withDetails('nota_ja_anotada', `registro=${id}`)).toEqual(['nota_ja_anotada', 'nota_ja_anotada', `registro=${id}`]);
    expect(await withDetails('nota_ja_anotada', `compra=${id}`)).toEqual(['nota_ja_anotada', 'nota_ja_anotada', `compra=${id}`]);
    expect(await withDetails('nota_ja_anotada', `compra=${id}; Key (receipt_key)=(${DIGEST})`)).toEqual(['nota_ja_anotada', 'nota_ja_anotada', null]);
    expect(await withDetails('nota_ja_anotada', 'registro=abc')).toEqual(['nota_ja_anotada', 'nota_ja_anotada', null]);
    expect(await withDetails('fatura_paga', `compra=${id}`)).toEqual(['fatura_paga', 'fatura_paga', null]);
    // Defeito de consistência (só escrita direta na tabela) vira erro genérico, sem valores.
    for (const c of ['fatura_inconsistente', 'compra_inconsistente']) {
      expect(await withDetails(c, 'Failing row contains (1, segredo)')).toEqual(['desconhecido', c, null]);
    }
  });
});

// ---------------------------------------------------------------------------
// Ciclo F2 · orçamento por categoria e limite pessoal de comprometimento (D-041)
// ---------------------------------------------------------------------------

describe('API real: orçamento por categoria e limite pessoal (Ciclo F2, D-041)', () => {
  // Bruno repete a montagem quatro anos depois do bloco dos cartões (hoje 07/10/2035), num período em que nenhum bloco anterior
  // gravou nada. Ana é a pessoa de fora. Cartão, gastos e pessoas FICTÍCIOS.
  const T0 = '2035-10-07';
  const AUG = '2035-08';
  const SEP = '2035-09';
  const OCT = '2035-10';
  const NOV = '2035-11';
  const DEC = '2035-12';
  const JAN = '2036-01';
  const MONTHS = [AUG, SEP, OCT, NOV, DEC, JAN];
  const bruno = repoFor(BRUNO, T0);
  const ana = repoFor(ANA, T0);
  let ctx = '';
  let account = '';
  let card: Card;

  const code = (p: Promise<unknown>) =>
    p.then(
      () => null,
      (e: unknown) => (e instanceof RepoError ? [e.code, e.detail ?? null] : String(e)),
    );
  const record = (kind: RecordKind, description: string, reais: number, occurredOn: IsoDate, category: string | null, cents_?: number) =>
    bruno.createRecord(newOperationKey(), ctx, kind, { accountId: account, amountCents: cents_ ?? cents(reais), occurredOn, description, category });
  const setBudget = (category: string, month: IsoMonth, version: number, amountCents: Cents | null) =>
    bruno.setCategoryBudget(newOperationKey(), ctx, category, month, version, amountCents);
  const line = (read: MonthBudgetRead, category: string) => read.lines.find((l) => l.category === category)!;
  const usedBy = async (month: IsoMonth) => Object.fromEntries((await bruno.getMonthBudget(ctx, month)).lines.map((l) => [l.category, l.usedCents]));

  /**
   * month_budget pela API é igual ao readMonthBudget do core sobre as leituras do app (linhas de orçamento, gastos dos meses da
   * janela e lançamentos do cartão): campo a campo, inclusive o id e a versão da linha vigente.
   */
  const checked = async (month: IsoMonth) => {
    const db = await bruno.getMonthBudget(ctx, month);
    const records = (await Promise.all(MONTHS.map((m) => bruno.listRecords(ctx, m)))).flat();
    const entries = card ? await bruno.listCardEntries(card.id) : [];
    const core = readMonthBudget(month, await bruno.listCategoryBudgets(ctx), { records, entries });
    expect(db).toEqual(core);
    expect(db.lines.map((l) => l.category)).toEqual([...BUDGET_CATEGORIES]);
    return db;
  };
  const checkedAll = async () => Object.fromEntries(await Promise.all(MONTHS.map(async (m) => [m, await checked(m)] as const)));

  beforeAll(async () => {
    const space = (await bruno.getSpace())!;
    ctx = space.personalContextId;
    account = space.accounts[0]!.id;
  });

  it('conta sem orçamento nem limite: seis categorias, sem orçamento e sem uso, igual ao core', async () => {
    expect(await bruno.listCategoryBudgets(ctx)).toEqual([]);
    expect(await bruno.listCommitmentLimits(ctx)).toEqual([]);
    const read = await checked(OCT);
    expect(read.lines).toEqual(BUDGET_CATEGORIES.map((category) => ({ category, budgetId: null, budgetVersion: null, budgetFrom: null, budgetCents: null, usedCents: 0 })));
    const s = summarizeBudget(read);
    expect([s.hasAny, s.totalLine, budgetCaption(s), s.without.length]).toEqual([false, null, 'Nenhum orçamento definido', 6]);
  });

  it('o usado do banco é o do core: gastos, parcelas pelo mês da compra, estornos e fatura paga fora', async () => {
    await record('receita', 'Salário', 6000, '2035-10-01', 'Salário');
    await record('despesa', 'Feira', 0, '2035-10-02', 'Mercado', 41230);
    await record('despesa', 'Sem categoria', 50, '2035-10-02', null);
    await record('receita', 'Reembolso do mercado', 500, '2035-10-03', 'Mercado');
    await record('despesa', 'Pão', 10, '2035-09-30', 'Mercado');
    card = (await bruno.createCard(newOperationKey(), ctx, { name: 'Cartão Exemplo', lastDigits: '1234', closingDay: 3, dueDay: 10, limitCents: 500000 })).card;
    const buy = (description: string, category: string | null, purchasedOn: IsoDate, totalCents: Cents, installments: number) =>
      bruno.addCardPurchase(newOperationKey(), card.id, { description, category, purchasedOn, totalCents, installments });
    await buy('Geladeira', 'Mercado', '2035-09-30', 12000, 2);
    await buy('Show', 'Lazer', '2035-10-05', 90000, 3);
    await buy('Jogos', 'Lazer', '2035-10-05', 10001, 3);
    await buy('Sem categoria no cartão', null, '2035-10-06', 5000, 1);
    await bruno.addCardRefund(newOperationKey(), card.id, { description: 'Devolução', category: 'Lazer', amountCents: 4000, invoiceMonth: NOV });
    await bruno.addCardCharge(newOperationKey(), card.id, { chargeType: 'juros', amountCents: 1500, invoiceMonth: NOV });
    await bruno.addCardRefund(newOperationKey(), card.id, { description: 'Estorno grande', category: 'Lazer', amountCents: 50000, invoiceMonth: DEC });
    const all = await checkedAll();
    const used = (m: IsoMonth, c: string) => line(all[m]!, c).usedCents;
    // Os mesmos números da montagem do teste do core e de 80_orcamento.sql.
    expect([used(SEP, 'Mercado'), used(OCT, 'Mercado'), used(NOV, 'Mercado')]).toEqual([7000, 47230, 0]);
    expect([used(OCT, 'Lazer'), used(NOV, 'Lazer'), used(DEC, 'Lazer'), used(JAN, 'Lazer')]).toEqual([33335, 29333, 0, 0]);
    expect([used(AUG, 'Mercado'), used(OCT, 'Moradia'), used(OCT, 'Transporte')]).toEqual([0, 0, 0]);
    // A compra no cartão nunca entra em Pago: só os gastos anotados.
    expect(summarizeMonth(await bruno.listRecords(ctx, OCT), ctx, OCT).paidCents).toBe(46230);

    // O pagamento da fatura de outubro (só depois do fechamento) cria um gasto, e ele nunca conta no orçamento.
    const late = repoFor(BRUNO, '2035-10-20');
    const invoice = (await late.listInvoiceItems(card.id)).find((i) => i.month === OCT)!;
    const paid = await late.payInvoice(newOperationKey(), card.id, OCT, invoice.commitmentVersion!, invoice.totalCents, '2035-10-06');
    expect(paid.record.invoice).toEqual({ cardId: card.id, month: OCT });
    expect(summarizeMonth(await bruno.listRecords(ctx, OCT), ctx, OCT).paidCents).toBe(46230 + invoice.totalCents);
    const after = await checked(OCT);
    expect(line(after, 'Mercado').usedCents).toBe(47230);
    expect(line(after, 'Lazer').usedCents).toBe(33335);
  });

  it('orçamento: criar, alterar com a versão, tirar a partir de um mês e excluir; sempre igual ao core', async () => {
    const mercado = await setBudget('Mercado', SEP, 0, 100000);
    expect(mercado).toMatchObject({ category: 'Mercado', fromMonth: SEP, amountCents: 100000, version: 1, createdBy: BRUNO, contextId: ctx });
    const moradia = await setBudget('Moradia', OCT, 0, 250000);
    const lazer = await setBudget('Lazer', OCT, 0, 30000);
    // Lista na ordem das categorias do app (não a alfabética do banco).
    expect((await bruno.listCategoryBudgets(ctx)).map((b) => b.category)).toEqual(['Moradia', 'Mercado', 'Lazer'].sort((a, b) => BUDGET_CATEGORIES.indexOf(a) - BUDGET_CATEGORIES.indexOf(b)));
    let all = await checkedAll();
    expect([line(all[AUG]!, 'Mercado').budgetCents, line(all[SEP]!, 'Mercado').budgetCents, line(all[OCT]!, 'Mercado').budgetCents]).toEqual([null, 100000, 100000]);
    expect(line(all[OCT]!, 'Lazer')).toMatchObject({ budgetId: lazer.id, budgetVersion: 1, budgetFrom: OCT, budgetCents: 30000, usedCents: 33335 });
    expect(line(all[SEP]!, 'Moradia')).toMatchObject({ budgetId: null, budgetCents: null });
    const oct = summarizeBudget(all[OCT]!);
    expect(oct.rows.map((r) => [r.category, r.amountLine, r.percentText])).toEqual([
      ['Moradia', 'R$ 0,00 de R$ 2.500,00', '0,0%'],
      ['Mercado', 'R$ 472,30 de R$ 1.000,00', '47,2%'],
      ['Lazer', 'R$ 333,35 de R$ 300,00', '111,1%'],
    ]);
    expect(oct.totalLine).toBe('Orçado R$ 3.800,00 · Usado R$ 805,65');

    // Um valor novo a partir de dezembro não reescreve meses anteriores; excluir devolve a linha anterior.
    const dez = await setBudget('Mercado', DEC, 0, 150000);
    all = await checkedAll();
    expect([line(all[NOV]!, 'Mercado').budgetCents, line(all[DEC]!, 'Mercado').budgetCents]).toEqual([100000, 150000]);
    const changed = await bruno.setCategoryBudget(newOperationKey(), ctx, 'Mercado', SEP, 1, 90000);
    expect([changed.id, changed.version, changed.amountCents]).toEqual([mercado.id, 2, 90000]);
    all = await checkedAll();
    expect([line(all[OCT]!, 'Mercado').budgetCents, line(all[DEC]!, 'Mercado').budgetCents]).toEqual([90000, 150000]);
    const gone = await bruno.deleteCategoryBudget(newOperationKey(), dez.id, 1);
    expect(gone).toMatchObject({ id: dez.id, version: 2 });
    all = await checkedAll();
    expect(line(all[DEC]!, 'Mercado')).toMatchObject({ budgetId: mercado.id, budgetVersion: 2, budgetFrom: SEP, budgetCents: 90000 });

    // "Tirar o orçamento a partir de novembro": linha sem valor; outubro continua como era.
    const removed = await setBudget('Lazer', NOV, 0, null);
    expect(removed).toMatchObject({ category: 'Lazer', fromMonth: NOV, amountCents: null, version: 1 });
    all = await checkedAll();
    expect(line(all[OCT]!, 'Lazer').budgetCents).toBe(30000);
    expect(line(all[NOV]!, 'Lazer')).toMatchObject({ budgetId: removed.id, budgetFrom: NOV, budgetCents: null, usedCents: 29333 });
    expect(summarizeBudget(all[NOV]!).without).toContain('Lazer');
    // Voltar atrás: excluir a linha que encerra a vigência.
    await bruno.deleteCategoryBudget(newOperationKey(), removed.id, 1);
    all = await checkedAll();
    expect(line(all[NOV]!, 'Lazer')).toMatchObject({ budgetId: lazer.id, budgetCents: 30000 });
    // Excluída não bloqueia o mês: uma linha nova (versão 0) na mesma categoria e mês.
    expect((await setBudget('Lazer', NOV, 0, 20000)).version).toBe(1);
    expect(moradia.version).toBe(1);
  });

  it('validação também no banco, com o mesmo código e a mesma ordem do core; recusa não gasta a chave', async () => {
    const key = newOperationKey();
    // Hoje é 07/10/2035: de outubro de 2033 a outubro de 2036.
    expect(await code(bruno.setCategoryBudget(key, ctx, 'Salário', OCT, 0, 100000))).toEqual(['categoria_invalida', null]);
    expect(await code(bruno.setCategoryBudget(key, ctx, 'Sem categoria', OCT, 0, 100000))).toEqual(['categoria_invalida', null]);
    expect(await code(bruno.setCategoryBudget(key, ctx, 'Compras', OCT, 0, 100000))).toEqual(['categoria_invalida', null]);
    expect(await code(bruno.setCategoryBudget(key, ctx, 'Transporte', '2033-09', 0, 100000))).toEqual(['vigencia_fora_do_intervalo', null]);
    expect(await code(bruno.setCategoryBudget(key, ctx, 'Transporte', '2036-11', 0, 100000))).toEqual(['vigencia_fora_do_intervalo', null]);
    expect(await code(bruno.setCategoryBudget(key, ctx, 'Transporte', OCT, 0, 99))).toEqual(['valor_invalido', null]);
    expect(await code(bruno.setCategoryBudget(key, ctx, 'Transporte', OCT, 0, 0))).toEqual(['valor_invalido', null]);
    expect(await code(bruno.setCategoryBudget(key, ctx, 'Transporte', OCT, 0, 1_000_000_000))).toEqual(['valor_acima_do_limite', null]);
    // Ordem: intervalo antes do valor; versão antes do intervalo.
    expect(await code(bruno.setCategoryBudget(key, ctx, 'Transporte', '2036-11', 0, 0))).toEqual(['vigencia_fora_do_intervalo', null]);
    expect(await code(bruno.setCategoryBudget(key, ctx, 'Transporte', '2036-11', 3, 0))).toEqual(['versao_desatualizada', 'versao_atual=0']);
    expect(await code(bruno.setCategoryBudget(newOperationKey(), ctx, 'Lazer', OCT, 0, 30000))).toEqual(['versao_desatualizada', 'versao_atual=1']);
    expect(await code(bruno.setCategoryBudget(newOperationKey(), ctx, 'Lazer', OCT, null as unknown as number, 30000))).toEqual(['versao_desatualizada', 'versao_atual=1']);
    expect(await code(bruno.deleteCategoryBudget(newOperationKey(), randomUUID(), 1))).toEqual(['nao_encontrado', null]);
    const lazer = (await bruno.listCategoryBudgets(ctx)).find((b) => b.category === 'Lazer' && b.fromMonth === OCT)!;
    expect(await code(bruno.deleteCategoryBudget(newOperationKey(), lazer.id, 9))).toEqual(['versao_desatualizada', 'versao_atual=1']);
    // Os dois limites do intervalo e os dois do valor são aceitos, e a mesma chave recusada antes ainda vale (nada foi gravado).
    const low = await bruno.setCategoryBudget(key, ctx, 'Transporte', '2033-10', 0, 100);
    const high = await setBudget('Transporte', '2036-10', 0, 999_999_999);
    expect([low.amountCents, high.amountCents]).toEqual([100, 999_999_999]);
    await bruno.deleteCategoryBudget(newOperationKey(), low.id, 1);
    await bruno.deleteCategoryBudget(newOperationKey(), high.id, 1);
    // Mês fora do dia 1 e mês de leitura inválido (o app sempre manda AAAA-MM-01; aqui direto).
    const db = clientFor(BRUNO, T0);
    const badDay = await db.rpc('set_category_budget', {
      p_idempotency_key: newOperationKey(),
      p_context_id: ctx,
      p_category: 'Mercado',
      p_from_month: '2035-10-15',
      p_expected_version: 0,
      p_amount_cents: 100,
    });
    expect(badDay.error?.message).toBe('mes_invalido');
    expect((await db.rpc('month_budget', { p_context_id: ctx, p_month: '2035-10-15' })).error?.message).toBe('mes_invalido');
    expect((await db.rpc('set_commitment_limit', { p_idempotency_key: newOperationKey(), p_context_id: ctx, p_from_month: '2035-10-15', p_expected_version: 0, p_percent: 40 })).error?.message).toBe('mes_invalido');
  });

  it('repetição, chave reutilizada e resultado incerto: repetir a mesma chave reconcilia, sem linha duplicada', async () => {
    const key = newOperationKey();
    const a = await bruno.setCategoryBudget(key, ctx, 'Saúde', OCT, 0, 40000);
    expect(await bruno.setCategoryBudget(key, ctx, 'Saúde', OCT, 0, 40000)).toEqual(a);
    // Outro conteúdo, outra ação ou chave de outra operação: chave_reutilizada.
    expect(await code(bruno.setCategoryBudget(key, ctx, 'Saúde', OCT, 0, 40001))).toEqual(['chave_reutilizada', null]);
    expect(await code(bruno.setCategoryBudget(key, ctx, 'Educação', OCT, 0, 40000))).toEqual(['chave_reutilizada', null]);
    expect(await code(bruno.deleteCategoryBudget(key, a.id, 1))).toEqual(['chave_reutilizada', null]);
    expect(await code(bruno.setCommitmentLimit(key, ctx, OCT, 0, 40))).toEqual(['chave_reutilizada', null]);
    const recordKey = newOperationKey();
    await bruno.createRecord(recordKey, ctx, 'despesa', { accountId: account, amountCents: 100, occurredOn: '2035-10-07', description: 'Café', category: null });
    expect(await code(bruno.setCategoryBudget(recordKey, ctx, 'Saúde', OCT, 0, 40000))).toEqual(['chave_reutilizada', null]);
    // Depois de alterada, a repetição da primeira chave devolve a linha atual (versão 2), sem gravar de novo.
    const changed = await bruno.setCategoryBudget(newOperationKey(), ctx, 'Saúde', OCT, 1, 45000);
    expect(await bruno.setCategoryBudget(key, ctx, 'Saúde', OCT, 0, 40000)).toEqual(changed);

    // A resposta se perde: o app não sabe o resultado. Repetir a mesma chave e o mesmo conteúdo devolve a linha criada.
    const lost = new SupabaseRepository(clientFor(BRUNO, T0, lostResponse), { id: BRUNO });
    const lostKey = newOperationKey();
    expect(await err(lost.setCategoryBudget(lostKey, ctx, 'Educação', OCT, 0, 70000))).toBe('rede');
    const created = await bruno.setCategoryBudget(lostKey, ctx, 'Educação', OCT, 0, 70000);
    expect((await bruno.listCategoryBudgets(ctx)).filter((b) => b.category === 'Educação')).toEqual([created]);
    expect(created.version).toBe(1);
    // A exclusão perdida também se reconcilia repetindo a chave: devolve a linha já excluída, sem erro.
    const deleteKey = newOperationKey();
    expect(await err(lost.deleteCategoryBudget(deleteKey, created.id, 1))).toBe('rede');
    const deleted = await bruno.deleteCategoryBudget(deleteKey, created.id, 1);
    expect([deleted.id, deleted.version]).toEqual([created.id, 2]);
    await bruno.deleteCategoryBudget(newOperationKey(), changed.id, changed.version);
    expect((await bruno.listCategoryBudgets(ctx)).map((b) => b.category)).not.toContain('Educação');
    expect((await bruno.listCategoryBudgets(ctx)).map((b) => b.category)).not.toContain('Saúde');
  });

  it('limite pessoal: criar, alterar, excluir, validação e repetição', async () => {
    const key = newOperationKey();
    const a = await bruno.setCommitmentLimit(key, ctx, OCT, 0, 60);
    expect(a).toMatchObject({ contextId: ctx, fromMonth: OCT, percent: 60, version: 1, createdBy: BRUNO });
    expect(await bruno.setCommitmentLimit(key, ctx, OCT, 0, 60)).toEqual(a);
    expect(await code(bruno.setCommitmentLimit(key, ctx, OCT, 0, 61))).toEqual(['chave_reutilizada', null]);
    expect(await code(bruno.setCommitmentLimit(newOperationKey(), ctx, OCT, 0, 50))).toEqual(['versao_desatualizada', 'versao_atual=1']);
    const v = (percent: number | null, month: IsoMonth = OCT, version = 1) => code(bruno.setCommitmentLimit(newOperationKey(), ctx, month, version, percent));
    expect([await v(9), await v(101), await v(0), await v(-5)]).toEqual(Array(4).fill(['percentual_invalido', null]));
    expect(await v(40, '2033-09', 0)).toEqual(['vigencia_fora_do_intervalo', null]);
    expect(await v(40, '2036-11', 0)).toEqual(['vigencia_fora_do_intervalo', null]);
    expect(await v(9, '2036-11', 0)).toEqual(['vigencia_fora_do_intervalo', null]);
    expect(await v(null, '2036-11', 0)).toEqual(['vigencia_fora_do_intervalo', null]);
    const b = await bruno.setCommitmentLimit(newOperationKey(), ctx, DEC, 0, 40);
    const rows = await bruno.listCommitmentLimits(ctx);
    expect(rows.map((r) => [r.fromMonth, r.percent])).toEqual([[OCT, 60], [DEC, 40]]);
    expect([limitFor(rows, NOV)?.percent, limitFor(rows, DEC)?.percent, limitFor(rows, SEP)]).toEqual([60, 40, null]);
    const changed = await bruno.setCommitmentLimit(newOperationKey(), ctx, OCT, 1, 55);
    expect([changed.id, changed.version, changed.percent]).toEqual([a.id, 2, 55]);
    expect(await bruno.setCommitmentLimit(key, ctx, OCT, 0, 60)).toEqual(changed);
    expect(await code(bruno.deleteCommitmentLimit(newOperationKey(), a.id, 1))).toEqual(['versao_desatualizada', 'versao_atual=2']);
    expect(await code(bruno.deleteCommitmentLimit(newOperationKey(), randomUUID(), 1))).toEqual(['nao_encontrado', null]);
    const lost = new SupabaseRepository(clientFor(BRUNO, T0, lostResponse), { id: BRUNO });
    const deleteKey = newOperationKey();
    expect(await err(lost.deleteCommitmentLimit(deleteKey, b.id, 1))).toBe('rede');
    const gone = await bruno.deleteCommitmentLimit(deleteKey, b.id, 1);
    expect([gone.id, gone.version]).toEqual([b.id, 2]);
    expect((await bruno.listCommitmentLimits(ctx)).map((r) => r.percent)).toEqual([55]);
    // "Tirar o limite a partir de dezembro": percentual nulo grava a linha que encerra a vigência (a leitura devolve null).
    const endKey = newOperationKey();
    const ended = await bruno.setCommitmentLimit(endKey, ctx, DEC, 0, null);
    expect([ended.fromMonth, ended.percent, ended.version]).toEqual([DEC, null, 1]);
    expect(await bruno.setCommitmentLimit(endKey, ctx, DEC, 0, null)).toEqual(ended);
    const withEnd = await bruno.listCommitmentLimits(ctx);
    expect(withEnd.map((r) => [r.fromMonth, r.percent])).toEqual([[OCT, 55], [DEC, null]]);
    expect([limitFor(withEnd, NOV)?.percent, limitFor(withEnd, DEC)?.percent]).toEqual([55, null]);
    expect((await bruno.deleteCommitmentLimit(newOperationKey(), ended.id, 1)).version).toBe(2);
    expect((await bruno.listCommitmentLimits(ctx)).map((r) => r.percent)).toEqual([55]);
    // O core lê o limite sobre a renda comprometida do banco; sem renda de referência, não há situação a mostrar.
    const refs = await bruno.listIncomeReferences(ctx);
    const c = summarizeCommitted(await bruno.listCommitments(ctx, OCT), ctx, OCT, T0, refs, []);
    expect(refs.length > 0).toBe(c.committedPermille !== null);
    expect(limitStatus(OCT, c.committedPermille, c.committedCents, 55, T0)?.line.endsWith(' de 55% que você escolheu') ?? null).toBe(c.committedPermille === null ? null : true);
    expect(limitStatus(OCT, null, 0, 55, T0)).toBeNull();
    await bruno.deleteCommitmentLimit(newOperationKey(), a.id, 2);
    expect(await bruno.listCommitmentLimits(ctx)).toEqual([]);
  });

  it('aviso ao cruzar 80% e 100%: o banco devolve o antes e o depois, e o core monta a frase', async () => {
    const budget = await setBudget('Transporte', OCT, 0, 100000);
    const before = async () => line(await bruno.getMonthBudget(ctx, OCT), 'Transporte');
    const crossing = async (hide: boolean, b: MonthBudgetRead['lines'][number]) =>
      budgetCrossing(b, line(await bruno.getMonthBudget(ctx, OCT), 'Transporte'), OCT, T0, hide);
    // Gasto de R$ 790,00: 79%, ainda abaixo de 80%.
    let b = await before();
    const g1 = await record('despesa', 'Combustível', 790, '2035-10-07', 'Transporte');
    expect(await crossing(false, b)).toBeNull();
    // Mais R$ 20,00: 81% (chegou a 80%).
    b = await before();
    await record('despesa', 'Estacionamento', 20, '2035-10-07', 'Transporte');
    expect(await crossing(false, b)).toBe('Transporte chegou a 81% do orçamento de outubro.');
    // Compra no cartão de R$ 400,00 em 2 vezes: a 1ª parcela, de R$ 200,00, passa em R$ 10,00 (conta no mês da compra).
    b = await before();
    await bruno.addCardPurchase(newOperationKey(), card.id, { description: 'Pneu', category: 'Transporte', purchasedOn: '2035-10-07', totalCents: 40000, installments: 2 });
    expect(await crossing(false, b)).toBe('Transporte passou do orçamento de outubro em R$ 10,00.');
    // O mesmo cruzamento, com os valores ocultos, sem o valor.
    expect(await crossing(true, { ...b })).toBe('Transporte passou do orçamento de outubro.');
    // Editar o gasto de R$ 790,00 para R$ 100,00 volta a ficar abaixo; editar de novo para cima cruza de novo.
    const down = await bruno.updateRecord(newOperationKey(), g1.id, g1.version, { accountId: account, amountCents: 10000, occurredOn: '2035-10-07', description: 'Combustível', category: 'Transporte' });
    b = await before();
    expect(budgetCrossing(b, b, OCT, T0)).toBeNull();
    await bruno.updateRecord(newOperationKey(), down.id, down.version, { accountId: account, amountCents: 90000, occurredOn: '2035-10-07', description: 'Combustível', category: 'Transporte' });
    // A 2ª parcela do pneu cai em novembro: o aviso do mês de outubro não fala dele.
    expect(line(await bruno.getMonthBudget(ctx, NOV), 'Transporte').usedCents).toBe(20000);
    const after = await before();
    expect(after.usedCents).toBe(90000 + 2000 + 20000);
    expect(budget.version).toBe(1);
  });

  it('orçamento e limite não mexem em nenhum total: Recebido, Pago, Diferença, Ainda a pagar e renda comprometida ficam iguais', async () => {
    const snapshot = async () => {
      const rows = await Promise.all([OCT, NOV].map(async (m) => summarizeMonth(await bruno.listRecords(ctx, m), ctx, m)));
      const toPay = await checkedToPay(BRUNO, ctx, OCT, T0);
      const { data, error } = await clientFor(BRUNO, T0).rpc('month_committed', { p_context_id: ctx, p_month: `${OCT}-01` }).single();
      expect(error).toBeNull();
      return JSON.stringify([rows.map((r) => [r.receivedCents, r.paidCents, r.differenceCents]), toPay.toPayCents, data, await bruno.listCommitments(ctx, OCT)]);
    };
    const before = await snapshot();
    const a = await setBudget('Educação', OCT, 0, 50000);
    const l = await bruno.setCommitmentLimit(newOperationKey(), ctx, OCT, 0, 30);
    await setBudget('Educação', NOV, 0, null);
    expect(await snapshot()).toBe(before);
    await bruno.deleteCategoryBudget(newOperationKey(), a.id, 1);
    await bruno.deleteCommitmentLimit(newOperationKey(), l.id, 1);
    expect(await snapshot()).toBe(before);
  });

  it('as quatro ações ficam em record_operations com a linha em target_id', async () => {
    const db = clientFor(BRUNO, T0);
    const { data, error } = await db
      .from('record_operations')
      .select('action, target_id, record_id, commitment_id')
      .in('action', ['definir_orcamento_categoria', 'excluir_orcamento_categoria', 'definir_limite_comprometimento', 'excluir_limite_comprometimento']);
    expect(error).toBeNull();
    const actions = new Set((data ?? []).map((o) => o.action));
    expect([...actions].sort()).toEqual(['definir_limite_comprometimento', 'definir_orcamento_categoria', 'excluir_limite_comprometimento', 'excluir_orcamento_categoria']);
    expect((data ?? []).every((o) => o.target_id !== null && o.record_id === null && o.commitment_id === null)).toBe(true);
  });

  it('outra pessoa não lê nem altera orçamento e limite, nem consulta o usado; gravação direta é recusada', async () => {
    const mine = (await bruno.listCategoryBudgets(ctx))[0]!;
    const limit = await bruno.setCommitmentLimit(newOperationKey(), ctx, OCT, 0, 35);
    expect(await ana.listCategoryBudgets(ctx)).toEqual([]);
    expect(await ana.listCommitmentLimits(ctx)).toEqual([]);
    expect(await err(ana.getMonthBudget(ctx, OCT))).toBe('sem_permissao');
    expect(await err(ana.setCategoryBudget(newOperationKey(), ctx, 'Mercado', OCT, 0, 100))).toBe('sem_permissao');
    expect(await err(ana.setCommitmentLimit(newOperationKey(), ctx, OCT, 0, 40))).toBe('sem_permissao');
    expect(await err(ana.deleteCategoryBudget(newOperationKey(), mine.id, mine.version))).toBe('nao_encontrado');
    expect(await err(ana.deleteCommitmentLimit(newOperationKey(), limit.id, limit.version))).toBe('nao_encontrado');
    const mineDb = clientFor(BRUNO, T0);
    expect((await mineDb.from('category_budgets').insert({ context_id: ctx, category: 'Mercado', from_month: '2035-07-01', amount_cents: 100, created_by: BRUNO })).error).not.toBeNull();
    expect((await mineDb.from('category_budgets').update({ amount_cents: 1 }).eq('id', mine.id)).error).not.toBeNull();
    expect((await mineDb.from('category_budgets').delete().eq('id', mine.id)).error).not.toBeNull();
    expect((await mineDb.from('commitment_limits').insert({ context_id: ctx, from_month: '2035-07-01', percent: 40, created_by: BRUNO })).error).not.toBeNull();
    expect((await mineDb.from('commitment_limits').update({ percent: 50 }).eq('id', limit.id)).error).not.toBeNull();
    expect((await mineDb.from('commitment_limits').delete().eq('id', limit.id)).error).not.toBeNull();
    for (const table of ['category_budgets', 'commitment_limits']) {
      const anon = await clientFor(null).from(table).select('id');
      expect(anon.error !== null || (anon.data ?? []).length === 0).toBe(true);
    }
    expect((await ana.getSpace()) && (await ana.listCategoryBudgets((await ana.getSpace())!.personalContextId))).toEqual([]);
    await bruno.deleteCommitmentLimit(newOperationKey(), limit.id, limit.version);
  });

  it('limpeza: sem orçamento nem limite, e a conta volta a só os gastos', async () => {
    for (const b of await bruno.listCategoryBudgets(ctx)) await bruno.deleteCategoryBudget(newOperationKey(), b.id, b.version);
    for (const l of await bruno.listCommitmentLimits(ctx)) await bruno.deleteCommitmentLimit(newOperationKey(), l.id, l.version);
    expect(await bruno.listCategoryBudgets(ctx)).toEqual([]);
    expect(await bruno.listCommitmentLimits(ctx)).toEqual([]);
    const read = await checked(OCT);
    expect(read.lines.every((l) => l.budgetCents === null)).toBe(true);
    expect(line(read, 'Mercado').usedCents).toBe(47230);
    // Os lançamentos do cartão e o cartão saem para não deixar fatura nos meses de 2035.
    for (const e of await bruno.listCardEntries(card.id)) await bruno.deleteCardEntry(newOperationKey(), e.id, e.version).catch(() => undefined);
  });
});

describe('conversor do orçamento e do limite', () => {
  // Sem rede: os argumentos de cada função, a leitura das linhas (AAAA-MM-01 ↔ AAAA-MM, bigint), a recusa de linha incoerente e
  // os códigos de erro novos.
  const calls: [string, Record<string, unknown>][] = [];
  const budget = { id: 'b1', context_id: 'ctx', category: 'Mercado', from_month: '2026-10-01', amount_cents: 180000, created_by: 'p1', version: 1, created_at: 'a', updated_at: 'b' };
  const limit = { id: 'l1', context_id: 'ctx', from_month: '2026-10-01', percent: 60, created_by: 'p1', version: 1, created_at: 'a', updated_at: 'b' };
  const monthRows = (patch: Record<string, unknown> = {}) =>
    BUDGET_CATEGORIES.map((category, i) => ({
      category,
      budget_id: i === 1 ? 'b1' : null,
      budget_version: i === 1 ? 1 : null,
      budget_from: i === 1 ? '2026-10-01' : null,
      budget_cents: i === 1 ? 180000 : null,
      used_cents: i === 1 ? 140000 : 0,
      ...(i === 1 ? patch : {}),
    }));
  const query = (result: { data: unknown; error: unknown }) => {
    const q: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'is', 'order', 'range']) q[m] = () => q;
    q.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => Promise.resolve(result).then(resolve, reject);
    return q;
  };
  const fake = (rpc: Record<string, unknown>, tables: Record<string, unknown> = {}, error: unknown = null) => {
    const db = {
      from: (table: string) => query(error ? { data: null, error } : { data: tables[table] ?? null, error: null }),
      rpc: async (fn: string, args: Record<string, unknown>) => {
        calls.push([fn, args]);
        return error ? { data: null, error } : { data: rpc[fn] ?? null, error: null };
      },
    };
    return new SupabaseRepository(db as unknown as SupabaseClient, { id: 'p1' });
  };
  const failure = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => (e instanceof RepoError ? [e.code, e.message, e.detail ?? null] : String(e)));
  const expectedBudget = { id: 'b1', contextId: 'ctx', category: 'Mercado', fromMonth: '2026-10', amountCents: 180000, createdBy: 'p1', version: 1, createdAt: 'a', updatedAt: 'b' };

  it('orçamento: AAAA-MM vira AAAA-MM-01 e volta; valor nulo encerra; linha incoerente é recusada', async () => {
    calls.length = 0;
    const repo = fake({ set_category_budget: budget, delete_category_budget: { ...budget, version: 2, deleted_at: 'c', deleted_by: 'p1' } }, { category_budgets: [budget] });
    expect(await repo.listCategoryBudgets('ctx')).toEqual([expectedBudget]);
    expect(await repo.setCategoryBudget('chave-0001', 'ctx', 'Mercado', '2026-10', 0, 180000)).toEqual(expectedBudget);
    expect(await repo.deleteCategoryBudget('chave-0002', 'b1', 1)).toEqual({ ...expectedBudget, version: 2 });
    await fake({ set_category_budget: { ...budget, amount_cents: null } }).setCategoryBudget('chave-0003', 'ctx', 'Mercado', '2026-11', 0, null);
    expect(calls).toEqual([
      ['set_category_budget', { p_idempotency_key: 'chave-0001', p_context_id: 'ctx', p_category: 'Mercado', p_from_month: '2026-10-01', p_expected_version: 0, p_amount_cents: 180000 }],
      ['delete_category_budget', { p_idempotency_key: 'chave-0002', p_id: 'b1', p_expected_version: 1 }],
      ['set_category_budget', { p_idempotency_key: 'chave-0003', p_context_id: 'ctx', p_category: 'Mercado', p_from_month: '2026-11-01', p_expected_version: 0, p_amount_cents: null }],
    ]);
    expect((await fake({ set_category_budget: { ...budget, amount_cents: null } }).setCategoryBudget('chave-0004', 'ctx', 'Mercado', '2026-10', 0, null)).amountCents).toBeNull();
    for (const bad of [{ ...budget, category: 'Salário' }, { ...budget, from_month: '2026-10-15' }, { ...budget, amount_cents: 99 }, { ...budget, amount_cents: 1_000_000_000 }, { ...budget, version: 0 }, { ...budget, amount_cents: 1.5 }]) {
      expect(await failure(fake({ set_category_budget: bad }).setCategoryBudget('chave-0005', 'ctx', 'Mercado', '2026-10', 0, 180000))).toEqual(['desconhecido', expect.stringMatching(/inconsistente$/), null]);
    }
    expect((await fake({ set_category_budget: { ...budget, amount_cents: '180000' } }).setCategoryBudget('chave-0006', 'ctx', 'Mercado', '2026-10', 0, 180000)).amountCents).toBe(180000);
    expect(await failure(fake({}).setCategoryBudget('chave-0007', 'ctx', 'Mercado', '2026-10', 0, 100))).toEqual(['desconhecido', 'desconhecido', null]);
    // Lista na ordem das categorias do app, mesmo se o banco devolve fora dela.
    const lazer = { ...budget, id: 'b2', category: 'Lazer' };
    const moradia = { ...budget, id: 'b3', category: 'Moradia' };
    expect((await fake({}, { category_budgets: [lazer, budget, moradia] }).listCategoryBudgets('ctx')).map((b) => b.category)).toEqual(['Moradia', 'Mercado', 'Lazer']);
  });

  it('limite: argumentos, leitura e linha incoerente recusada', async () => {
    calls.length = 0;
    const expected = { id: 'l1', contextId: 'ctx', fromMonth: '2026-10', percent: 60, createdBy: 'p1', version: 1, createdAt: 'a', updatedAt: 'b' };
    const repo = fake({ set_commitment_limit: limit, delete_commitment_limit: { ...limit, version: 2, deleted_at: 'c', deleted_by: 'p1' } }, { commitment_limits: [limit] });
    expect(await repo.listCommitmentLimits('ctx')).toEqual([expected]);
    expect(await repo.setCommitmentLimit('chave-0010', 'ctx', '2026-10', 0, 60)).toEqual(expected);
    expect(await repo.deleteCommitmentLimit('chave-0011', 'l1', 1)).toEqual({ ...expected, version: 2 });
    expect(calls).toEqual([
      ['set_commitment_limit', { p_idempotency_key: 'chave-0010', p_context_id: 'ctx', p_from_month: '2026-10-01', p_expected_version: 0, p_percent: 60 }],
      ['delete_commitment_limit', { p_idempotency_key: 'chave-0011', p_id: 'l1', p_expected_version: 1 }],
    ]);
    // Percentual nulo é a linha que encerra a vigência: aceito na leitura.
    expect(await fake({ set_commitment_limit: { ...limit, percent: null } }).setCommitmentLimit('chave-0013', 'ctx', '2026-10', 0, null)).toEqual({ ...expected, percent: null });
    expect(calls[calls.length - 1]).toEqual(['set_commitment_limit', { p_idempotency_key: 'chave-0013', p_context_id: 'ctx', p_from_month: '2026-10-01', p_expected_version: 0, p_percent: null }]);
    for (const bad of [{ ...limit, percent: 9 }, { ...limit, percent: 101 }, { ...limit, percent: 30.5 }, { ...limit, from_month: '2026-10-02' }, { ...limit, version: 0 }]) {
      expect(await failure(fake({ set_commitment_limit: bad }).setCommitmentLimit('chave-0012', 'ctx', '2026-10', 0, 60))).toEqual(['desconhecido', expect.stringMatching(/inconsistente$|valor_inconsistente$/), null]);
    }
  });

  it('month_budget: o mês vai como AAAA-MM-01 e as seis linhas voltam em ordem; lista incompleta ou incoerente é recusada', async () => {
    calls.length = 0;
    const repo = fake({ month_budget: monthRows() });
    const read = await repo.getMonthBudget('ctx', '2026-10');
    expect(calls).toEqual([['month_budget', { p_context_id: 'ctx', p_month: '2026-10-01' }]]);
    expect(read.month).toBe('2026-10');
    expect(read.lines.map((l) => l.category)).toEqual([...BUDGET_CATEGORIES]);
    expect(read.lines[1]).toEqual({ category: 'Mercado', budgetId: 'b1', budgetVersion: 1, budgetFrom: '2026-10', budgetCents: 180000, usedCents: 140000 });
    expect(read.lines[0]).toEqual({ category: 'Moradia', budgetId: null, budgetVersion: null, budgetFrom: null, budgetCents: null, usedCents: 0 });
    // Orçamento encerrado: a linha vigente existe (id, versão e mês), mas sem valor.
    expect((await fake({ month_budget: monthRows({ budget_cents: null }) }).getMonthBudget('ctx', '2026-11')).lines[1]).toMatchObject({ budgetId: 'b1', budgetFrom: '2026-10', budgetCents: null });
    // bigint como texto é aceito.
    expect((await fake({ month_budget: monthRows({ used_cents: '140000', budget_cents: '180000' }) }).getMonthBudget('ctx', '2026-10')).lines[1]).toMatchObject({ budgetCents: 180000, usedCents: 140000 });
    const bad = (rows: unknown) => failure(fake({ month_budget: rows }).getMonthBudget('ctx', '2026-10'));
    const incoherent = ['orcamento_inconsistente'];
    expect(await bad(monthRows().slice(1))).toEqual(['desconhecido', incoherent[0], null]);
    expect(await bad([...monthRows().reverse()])).toEqual(['desconhecido', incoherent[0], null]);
    expect(await bad(monthRows({ used_cents: -1 }))).toEqual(['desconhecido', incoherent[0], null]);
    expect(await bad(monthRows({ budget_from: null }))).toEqual(['desconhecido', incoherent[0], null]);
    expect(await bad(monthRows({ budget_version: null }))).toEqual(['desconhecido', incoherent[0], null]);
    expect(await bad(monthRows({ budget_from: '2026-10-15' }))).toEqual(['desconhecido', incoherent[0], null]);
    expect(await bad(monthRows({ budget_cents: 50 }))).toEqual(['desconhecido', incoherent[0], null]);
    expect(await bad(null)).toEqual(['desconhecido', incoherent[0], null]);
  });

  it('códigos de erro novos voltam com o próprio nome, sem detalhe além de versao_atual', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => undefined));
    try {
      for (const code of ['vigencia_fora_do_intervalo', 'percentual_invalido', 'categoria_invalida', 'mes_invalido', 'valor_invalido', 'valor_acima_do_limite'] as const) {
        for (const message of [code, `ERROR: ${code}`]) {
          const repo = fake({}, {}, { message, code: '22023', details: 'Key (id)=(0000)=(segredo) já existe. 12345678' });
          expect(await failure(repo.setCategoryBudget('chave-4001', 'ctx', 'Mercado', '2026-10', 0, 100))).toEqual([code, code, null]);
          expect(await failure(repo.setCommitmentLimit('chave-4002', 'ctx', '2026-10', 0, 40))).toEqual([code, code, null]);
          expect(await failure(repo.getMonthBudget('ctx', '2026-10'))).toEqual([code, code, null]);
        }
      }
      const stale = fake({}, {}, { message: 'versao_desatualizada', code: 'PT409', details: 'versao_atual=7' });
      expect(await failure(stale.setCategoryBudget('chave-4003', 'ctx', 'Mercado', '2026-10', 0, 100))).toEqual(['versao_desatualizada', 'versao_desatualizada', 'versao_atual=7']);
      for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  });
});

describe('API real: contas de origem do dinheiro (Ciclo G1, D-043)', () => {
  // Ana, doze anos depois (hoje 07/10/2036), num período em que nenhum bloco anterior gravou nada. Bruno é a pessoa de fora.
  // Contas, gastos, cartão e metas FICTÍCIOS. A conta só informa a origem: nenhum total muda por causa dela.
  const T0 = '2036-10-07';
  const SEP = '2036-09';
  const OCT = '2036-10';
  const ana = repoFor(ANA, T0);
  const bruno = repoFor(BRUNO, T0);
  let ctx = '';
  let principal = '';
  let wallet: FinancialAccount;

  const code = (p: Promise<unknown>) =>
    p.then(
      () => null,
      (e: unknown) => (e instanceof RepoError ? [e.code, e.detail ?? null] : String(e)),
    );
  const shape = (a: FinancialAccount) => [a.name, a.kind, a.status, a.isDefault ? 'principal' : '-', a.version].join('|');
  const names = async (all = false) => (all ? await ana.listAccounts(ctx) : (await ana.getSpace())!.accounts).map((a) => a.name);
  const create = (name: string, kind: AccountKind = 'banco') => ana.createAccount(newOperationKey(), ctx, { name, kind });
  const goalInput: NewGoalInput = {
    goalType: 'objetivo',
    name: 'Viagem',
    targetCents: 500000,
    targetMonth: null,
    plannedMonthlyCents: null,
    essentialBaseCents: null,
    essentialMonths: null,
    essentialBaseSource: null,
    initialCents: 100000,
    initialOn: '2036-10-01',
  };

  beforeAll(async () => {
    const space = (await ana.getSpace())!;
    ctx = space.personalContextId;
    principal = space.accounts[0]!.id;
  });

  it('conta com a Conta principal só: banco, ativa, principal, sem conta de exemplo', async () => {
    const space = (await ana.getSpace())!;
    expect(space.accounts).toHaveLength(1);
    expect(space.accounts[0]).toMatchObject({ id: principal, kind: 'banco', status: 'ativa', isDefault: true, currency: 'BRL', initialBalanceCents: null });
    expect(await ana.listAccounts(ctx)).toEqual(space.accounts);
    // A pessoa de fora não enxerga nenhuma conta da Ana.
    expect(await bruno.listAccounts(ctx)).toEqual([]);
  });

  it('cria, valida, recusa nome repetido (sem diferenciar maiúsculas) e repete a mesma chave', async () => {
    expect(await code(ana.createAccount(newOperationKey(), ctx, { name: '   ', kind: 'banco' }))).toEqual(['nome_da_conta_invalido', null]);
    expect(await code(ana.createAccount(newOperationKey(), ctx, { name: 'x'.repeat(41), kind: 'banco' }))).toEqual(['nome_da_conta_invalido', null]);
    expect(await code(ana.createAccount(newOperationKey(), ctx, { name: 'Carteira', kind: 'poupanca' as AccountKind }))).toEqual(['tipo_da_conta_invalido', null]);
    expect(await code(ana.createAccount(newOperationKey(), ctx, { name: (await ana.listAccounts(ctx))[0]!.name.toUpperCase(), kind: 'banco' }))).toEqual(['nome_da_conta_repetido', null]);
    expect(await code(bruno.createAccount(newOperationKey(), ctx, { name: 'Invasão', kind: 'banco' }))).toEqual(['sem_permissao', null]);
    const k = newOperationKey();
    wallet = await ana.createAccount(k, ctx, { name: '  Carteira ', kind: 'dinheiro' });
    expect(shape(wallet)).toBe('Carteira|dinheiro|ativa|-|1');
    expect(wallet.contextId).toBe(ctx);
    expect(await ana.createAccount(k, ctx, { name: 'Carteira', kind: 'dinheiro' })).toEqual(wallet);
    expect(await code(ana.createAccount(k, ctx, { name: 'Carteira', kind: 'banco' }))).toEqual(['chave_reutilizada', null]);
    expect(await ana.findAccountOperation(k)).toEqual({ action: 'criar_conta', accountId: wallet.id });
    expect(await bruno.findAccountOperation(k)).toBeNull();
    expect(await names()).toEqual([(await ana.listAccounts(ctx))[0]!.name, 'Carteira']);
    expect((await ana.getSpace())!.accounts.map((a) => a.id)).toEqual([principal, wallet.id]);
  });

  it('altera nome e tipo com a versão; a versão velha traz a atual; o app publicado ainda renomeia direto', async () => {
    expect(await code(ana.updateAccount(newOperationKey(), wallet.id, 5, { name: 'Dinheiro', kind: 'dinheiro' }))).toEqual(['versao_desatualizada', 'versao_atual=1']);
    expect(await code(ana.updateAccount(newOperationKey(), wallet.id, 1, { name: '', kind: 'dinheiro' }))).toEqual(['nome_da_conta_invalido', null]);
    expect(await code(bruno.updateAccount(newOperationKey(), wallet.id, 1, { name: 'Roubada', kind: 'dinheiro' }))).toEqual(['nao_encontrado', null]);
    const k = newOperationKey();
    const updated = await ana.updateAccount(k, wallet.id, 1, { name: 'Dinheiro vivo', kind: 'outra' });
    expect(shape(updated)).toBe('Dinheiro vivo|outra|ativa|-|2');
    expect(await ana.updateAccount(k, wallet.id, 1, { name: 'Dinheiro vivo', kind: 'outra' })).toEqual(updated);
    // Renomeação direta (update (name)), como o app publicado faz: vale, soma 1 à versão e recusa nome repetido.
    await ana.renameAccount(wallet.id, 'Carteira');
    wallet = (await ana.listAccounts(ctx)).find((a) => a.id === wallet.id)!;
    expect(wallet).toMatchObject({ name: 'Carteira', kind: 'outra', version: 3 });
    expect(await code(ana.renameAccount(wallet.id, (await ana.listAccounts(ctx))[0]!.name.toLowerCase()))).toEqual(['nome_da_conta_repetido', null]);
    expect(await code(ana.renameAccount(wallet.id, ''))).toEqual(['nome_da_conta_invalido', null]);
    await ana.updateAccount(newOperationKey(), wallet.id, 3, { name: 'Carteira', kind: 'dinheiro' });
    wallet = (await ana.listAccounts(ctx)).find((a) => a.id === wallet.id)!;
  });

  it('um resultado incerto se reconcilia: a resposta se perde, a conta foi gravada e a mesma chave devolve a mesma conta', async () => {
    const flaky = new SupabaseRepository(clientFor(ANA, T0, lostResponse), { id: ANA });
    const k = newOperationKey();
    expect(await code(flaky.createAccount(k, ctx, { name: 'Cofre', kind: 'outra' }))).toEqual(['rede', null]);
    const saved = await ana.findAccountOperation(k);
    expect(saved?.action).toBe('criar_conta');
    const again = await ana.createAccount(k, ctx, { name: 'Cofre', kind: 'outra' });
    expect(again.id).toBe(saved!.accountId);
    expect((await ana.listAccounts(ctx)).filter((a) => a.name === 'Cofre')).toHaveLength(1);
    await ana.deleteAccount(newOperationKey(), again.id, again.version);
  });

  it('a principal: troca, a anterior sobe +1, arquivada recusada; arquivar a principal exige escolher outra', async () => {
    const before = (await ana.listAccounts(ctx)).find((a) => a.id === principal)!;
    const k = newOperationKey();
    const next = await ana.setDefaultAccount(k, wallet.id, wallet.version);
    expect(next).toMatchObject({ isDefault: true, version: wallet.version + 1 });
    expect(await ana.setDefaultAccount(k, wallet.id, wallet.version)).toEqual(next);
    const all = await ana.listAccounts(ctx);
    expect(all.filter((a) => a.isDefault).map((a) => a.id)).toEqual([wallet.id]);
    expect(all.find((a) => a.id === principal)!.version).toBe(before.version + 1);
    expect((await ana.getSpace())!.accounts.map((a) => a.id)).toEqual([wallet.id, principal]);
    expect(await code(ana.setAccountStatus(newOperationKey(), wallet.id, next.version, 'arquivada'))).toEqual(['conta_principal', null]);
    expect(await code(ana.setAccountStatus(newOperationKey(), wallet.id, next.version, 'arquivada', wallet.id))).toEqual(['conta_invalida', null]);
    // Volta: a Conta principal fica como principal e a Carteira, comum.
    const back = await ana.setDefaultAccount(newOperationKey(), principal, before.version + 1);
    expect(back).toMatchObject({ id: principal, isDefault: true });
    wallet = (await ana.listAccounts(ctx)).find((a) => a.id === wallet.id)!;
    expect(wallet.isDefault).toBe(false);
    expect(await code(ana.setAccountStatus(newOperationKey(), wallet.id, wallet.version, 'ativa', principal))).toEqual(['campo_nao_se_aplica', null]);
  });

  it('gastos, pagamentos e faturas saem da conta escolhida; a arquivada não recebe lançamento novo, mas o antigo se edita', async () => {
    const old = await create('Conta velha');
    const rec = (accountId: string, reais: number, description = 'Troco', occurredOn = '2036-10-06'): RecordInput => ({
      accountId,
      amountCents: cents(reais),
      occurredOn,
      description,
      category: null,
    });
    await ana.createRecord(newOperationKey(), ctx, 'receita', rec(principal, 6000, 'Salário', '2036-10-01'));
    const feira = await ana.createRecord(newOperationKey(), ctx, 'despesa', { ...rec(wallet.id, 90, 'Feira'), category: 'Mercado' });
    expect(feira.accountId).toBe(wallet.id);
    const troco = await ana.createRecord(newOperationKey(), ctx, 'despesa', rec(old.id, 7));
    const archivedOld = await ana.setAccountStatus(newOperationKey(), old.id, old.version, 'arquivada');
    expect(archivedOld).toMatchObject({ status: 'arquivada', isDefault: false, version: old.version + 1 });
    expect((await ana.getSpace())!.accounts.map((a) => a.id)).not.toContain(old.id);
    expect((await ana.listAccounts(ctx)).map((a) => a.id)).toContain(old.id);
    // A lista põe as ativas antes das arquivadas, com a principal no topo (e a arquivada por último).
    const listedAll = await ana.listAccounts(ctx);
    expect(listedAll.map((a) => a.status)).toEqual([...listedAll.map((a) => a.status)].sort((x, y) => (x === y ? 0 : x === 'ativa' ? -1 : 1)));
    expect(listedAll[0]).toMatchObject({ id: principal, isDefault: true, status: 'ativa' });
    expect(listedAll[listedAll.length - 1]).toMatchObject({ id: old.id, status: 'arquivada' });
    expect(listedAll.filter((a) => a.status === 'ativa').map((a) => a.id)).toEqual((await ana.getSpace())!.accounts.map((a) => a.id));
    expect(await code(ana.createRecord(newOperationKey(), ctx, 'despesa', rec(old.id, 3)))).toEqual(['conta_invalida', null]);
    expect(await code(bruno.createRecord(newOperationKey(), ctx, 'despesa', rec(old.id, 3)))).toEqual(['sem_permissao', null]);
    // Editar mantendo a conta arquivada vale; trocar para outra arquivada, não.
    const edited = await ana.updateRecord(newOperationKey(), troco.id, troco.version, rec(old.id, 8, 'Troco do pão'));
    expect([edited.accountId, edited.amountCents]).toEqual([old.id, 800]);
    const moved = await ana.updateRecord(newOperationKey(), troco.id, edited.version, rec(wallet.id, 8, 'Troco do pão'));
    expect(moved.accountId).toBe(wallet.id);
    expect(await code(ana.updateRecord(newOperationKey(), troco.id, moved.version, rec(old.id, 8, 'Troco do pão')))).toEqual(['conta_invalida', null]);
    // Conta a pagar paga numa conta escolhida.
    const bill = await ana.createCommitment(newOperationKey(), ctx, { description: 'Internet', amountCents: 15000, dueOn: '2036-10-15', category: 'Moradia' });
    expect(await code(ana.payCommitment(newOperationKey(), bill.commitment.id, 1, { accountId: old.id, amountCents: 15000, paidOn: T0, category: 'Moradia' }))).toEqual(['conta_invalida', null]);
    const paid = await ana.payCommitment(newOperationKey(), bill.commitment.id, 1, { accountId: wallet.id, amountCents: 15000, paidOn: T0, category: 'Moradia' });
    expect(paid.record.accountId).toBe(wallet.id);
    expect((await ana.getCommitment(bill.commitment.id))!.payment?.accountId).toBe(wallet.id);
    // Fatura paga numa conta escolhida.
    const card = (await ana.createCard(newOperationKey(), ctx, { name: 'Cartão Exemplo', lastDigits: '1234', closingDay: 3, dueDay: 10, limitCents: 500000 })).card;
    await ana.addCardPurchase(newOperationKey(), card.id, { description: 'Livro', category: 'Educação', purchasedOn: '2036-09-20', totalCents: 20000, installments: 1 });
    const invoice = (await ana.listInvoiceItems(card.id)).find((i) => i.month === OCT)!;
    expect(await code(ana.payInvoice(newOperationKey(), card.id, OCT, invoice.commitmentVersion!, 20000, T0, old.id))).toEqual(['conta_invalida', null]);
    const payment = await ana.payInvoice(newOperationKey(), card.id, OCT, invoice.commitmentVersion!, 20000, T0, wallet.id);
    expect(payment.record.accountId).toBe(wallet.id);
    expect((await ana.listInvoiceItems(card.id)).find((i) => i.month === OCT)!.paidAccountId).toBe(wallet.id);
    // Totais do mês: a soma de todas as contas, sem separar por conta.
    const s = summarizeMonth(await ana.listRecords(ctx, OCT), ctx, OCT);
    expect([s.receivedCents, s.paidCents]).toEqual([600000, 9000 + 800 + 15000 + 20000]);
    // Sem a conta (nula), a principal do contexto e não a mais antiga (A9): primeiro a Conta principal, depois a Carteira quando ela
    // passa a principal; e a primeira entrada devolve a principal, mesmo com a mais antiga arquivada.
    const water = await ana.createCommitment(newOperationKey(), ctx, { description: 'Água', amountCents: 5000, dueOn: '2036-10-16', category: 'Moradia' });
    expect((await ana.payCommitment(newOperationKey(), water.commitment.id, 1, { accountId: null, amountCents: 5000, paidOn: T0, category: 'Moradia' })).record.accountId).toBe(principal);
    const versionOf = async (id: string) => (await ana.listAccounts(ctx)).find((a) => a.id === id)!.version;
    await ana.setDefaultAccount(newOperationKey(), wallet.id, await versionOf(wallet.id));
    const gas = await ana.createCommitment(newOperationKey(), ctx, { description: 'Gás', amountCents: 6000, dueOn: '2036-10-17', category: 'Moradia' });
    expect((await ana.payCommitment(newOperationKey(), gas.commitment.id, 1, { accountId: null, amountCents: 6000, paidOn: T0, category: 'Moradia' })).record.accountId).toBe(wallet.id);
    const invoiceOf = async () => (await ana.listInvoiceItems(card.id)).find((i) => i.month === OCT)!.commitmentVersion!;
    await ana.undoInvoicePayment(newOperationKey(), card.id, OCT, await invoiceOf());
    expect((await ana.payInvoice(newOperationKey(), card.id, OCT, await invoiceOf(), 20000, T0)).record.accountId).toBe(wallet.id);
    await ana.setAccountStatus(newOperationKey(), principal, await versionOf(principal), 'arquivada');
    const eps = await clientFor(ANA, T0).rpc('ensure_personal_space', { p_account_name: 'Outro nome', p_time_zone: null });
    expect(eps.error).toBeNull();
    expect((eps.data as { account: { id: string } }).account.id).toBe(wallet.id);
    await ana.setAccountStatus(newOperationKey(), principal, await versionOf(principal), 'ativa');
    await ana.setDefaultAccount(newOperationKey(), principal, await versionOf(principal));
    wallet = (await ana.listAccounts(ctx)).find((a) => a.id === wallet.id)!;
    expect(wallet.isDefault).toBe(false);
    // Excluir: a conta com lançamentos pede para arquivar; a sem lançamentos sai.
    expect(await code(ana.deleteAccount(newOperationKey(), wallet.id, wallet.version))).toEqual(['conta_com_lancamentos', null]);
    // A conta antiga ficou sem lançamentos (o gasto dela passou para a Carteira): excluída, some da leitura e libera o nome.
    const goneOld = await ana.deleteAccount(newOperationKey(), old.id, archivedOld.version);
    expect(goneOld).toMatchObject({ status: 'arquivada', isDefault: false });
    expect((await ana.listAccounts(ctx)).map((a) => a.id)).not.toContain(old.id);
    const empty = await create('Sem uso');
    const gone = await ana.deleteAccount(newOperationKey(), empty.id, empty.version);
    expect(gone).toMatchObject({ status: 'arquivada', isDefault: false });
    expect((await ana.listAccounts(ctx)).map((a) => a.id)).not.toContain(empty.id);
    expect(await code(ana.deleteAccount(newOperationKey(), principal, 99))).toEqual(['versao_desatualizada', expect.stringMatching(/^versao_atual=/)]);
    expect(await code(ana.deleteAccount(newOperationKey(), principal, (await ana.listAccounts(ctx)).find((a) => a.id === principal)!.version))).toEqual(['conta_principal', null]);
    expect(await code(ana.updateAccount(newOperationKey(), empty.id, gone.version, { name: 'Volta', kind: 'banco' }))).toEqual(['nao_encontrado', null]);
  });

  it('aporte e resgate de meta com a conta: só informativa, só nesses tipos, e o cliente antigo continua funcionando', async () => {
    const goal = await ana.createGoal(newOperationKey(), ctx, goalInput);
    const gid = goal.goal.id;
    const before = summarizeMonth(await ana.listRecords(ctx, OCT), ctx, OCT);
    const move = (kind: GoalMovementKind, accountId?: string | null, reais = 10): GoalMovementInput => ({ amountCents: cents(reais), occurredOn: T0, note: null, accountId });
    const k = newOperationKey();
    const a = await ana.addGoalMovement(k, gid, 'aporte', move('aporte', wallet.id));
    expect(a.movement).toMatchObject({ kind: 'aporte', accountId: wallet.id, version: 1 });
    expect(a.goal.savedCents).toBe(101000);
    expect(await ana.addGoalMovement(k, gid, 'aporte', move('aporte', wallet.id))).toEqual(a);
    expect(await code(ana.addGoalMovement(k, gid, 'aporte', move('aporte', principal)))).toEqual(['chave_reutilizada', null]);
    const r = await ana.addGoalMovement(newOperationKey(), gid, 'resgate', move('resgate', principal, 5));
    expect(r.movement!.accountId).toBe(principal);
    for (const kind of ['rendimento', 'valorizacao', 'desvalorizacao'] as const) {
      expect(await code(ana.addGoalMovement(newOperationKey(), gid, kind, move(kind, principal)))).toEqual(['campo_nao_se_aplica', null]);
    }
    const spare = await create('Reserva do mês');
    const archived = await ana.setAccountStatus(newOperationKey(), spare.id, spare.version, 'arquivada');
    expect(await code(ana.addGoalMovement(newOperationKey(), gid, 'aporte', move('aporte', archived.id)))).toEqual(['conta_invalida', null]);
    expect(await code(ana.addGoalMovement(newOperationKey(), gid, 'aporte', move('aporte', '00000000-0000-0000-0000-000000000001')))).toEqual(['conta_invalida', null]);
    // Alterar: trocar, tirar a conta (nulo) e manter a que o movimento já tem, mesmo arquivada.
    const swapped = await ana.updateGoalMovement(newOperationKey(), a.movement!.id, 1, move('aporte', principal));
    expect(swapped.movement).toMatchObject({ accountId: principal, version: 2 });
    // Cliente antigo corrigindo o valor (por nome, sem p_account_id): a conta do movimento é mantida, e não apagada.
    const oldUpdate = await clientFor(ANA, T0).rpc('update_goal_movement', {
      p_idempotency_key: newOperationKey(),
      p_movement_id: a.movement!.id,
      p_expected_version: 2,
      p_amount_cents: 1100,
      p_occurred_on: T0,
      p_note: null,
    });
    expect(oldUpdate.error).toBeNull();
    expect((oldUpdate.data as { movement: { account_id: string | null; version: number; amount_cents: number } }).movement).toMatchObject({ account_id: principal, version: 3, amount_cents: 1100 });
    // O repositório novo, sem accountId no pedido, também mantém; com null informado, tira.
    const keptByRepo = await ana.updateGoalMovement(newOperationKey(), a.movement!.id, 3, { amountCents: cents(10), occurredOn: T0, note: null });
    expect(keptByRepo.movement).toMatchObject({ accountId: principal, version: 4 });
    const cleared = await ana.updateGoalMovement(newOperationKey(), a.movement!.id, 4, move('aporte', null));
    expect(cleared.movement).toMatchObject({ accountId: null, version: 5 });
    expect(await code(ana.updateGoalMovement(newOperationKey(), a.movement!.id, 5, move('aporte', archived.id)))).toEqual(['conta_invalida', null]);
    const listed = await ana.listGoalMovements(gid);
    expect(listed.find((m) => m.id === r.movement!.id)!.accountId).toBe(principal);
    expect(listed.find((m) => m.id === a.movement!.id)!.accountId).toBeNull();
    expect(listed.find((m) => m.kind === 'saldo_inicial')!.accountId).toBeNull();
    // Cliente antigo (anterior à 0010): chamada por nome, sem p_account_id, com o hash de antes.
    const old = await clientFor(ANA, T0).rpc('add_goal_movement', {
      p_idempotency_key: newOperationKey(),
      p_goal_id: gid,
      p_kind: 'aporte',
      p_amount_cents: 700,
      p_occurred_on: T0,
      p_note: null,
    });
    expect(old.error).toBeNull();
    expect((old.data as { movement: { account_id: string | null } }).movement.account_id).toBeNull();
    // A conta com movimento de meta vivo não se exclui.
    const used = await create('Só para meta');
    await ana.addGoalMovement(newOperationKey(), gid, 'aporte', move('aporte', used.id));
    expect(await code(ana.deleteAccount(newOperationKey(), used.id, used.version))).toEqual(['conta_com_lancamentos', null]);
    // Só informativo: nenhum gasto, e os totais de outubro são os de antes.
    expect(summarizeMonth(await ana.listRecords(ctx, OCT), ctx, OCT)).toEqual(before);
    expect((await ana.listRecords(ctx, OCT)).some((x) => x.description === 'Viagem')).toBe(false);
  });

  it('limite de 10 contas ativas; arquivar libera uma vaga; a última ativa nunca se arquiva', async () => {
    let active = (await ana.listAccounts(ctx)).filter((a) => a.status === 'ativa');
    for (let i = 0; active.length < 10; i++) {
      await create(`Extra ${i}`);
      active = (await ana.listAccounts(ctx)).filter((a) => a.status === 'ativa');
    }
    expect(await code(create('Extra demais'))).toEqual(['limite_de_contas', null]);
    const extra = active.find((a) => a.name.startsWith('Extra'))!;
    const archived = await ana.setAccountStatus(newOperationKey(), extra.id, extra.version, 'arquivada');
    await create('Cabe agora');
    expect(await code(ana.setAccountStatus(newOperationKey(), extra.id, archived.version, 'ativa'))).toEqual(['limite_de_contas', null]);
    // Mesma situação: sem mudança.
    expect((await ana.setAccountStatus(newOperationKey(), extra.id, archived.version, 'arquivada')).version).toBe(archived.version);
    // Limpeza: exclui as extras (sem lançamentos).
    for (const a of (await ana.listAccounts(ctx)).filter((x) => /^(Extra|Cabe|Reserva do mês)/.test(x.name))) await ana.deleteAccount(newOperationKey(), a.id, a.version);
    const left = (await ana.listAccounts(ctx)).filter((a) => a.status === 'ativa');
    expect(left.map((a) => a.name).sort()).toEqual(['Carteira', (await ana.listAccounts(ctx)).find((a) => a.id === principal)!.name, 'Só para meta'].sort());
    // Arquivar tudo menos a principal; a última ativa (a principal) nunca se arquiva.
    for (const a of left.filter((x) => x.id !== principal)) await ana.setAccountStatus(newOperationKey(), a.id, a.version, 'arquivada');
    const only = (await ana.getSpace())!.accounts;
    expect(only.map((a) => a.id)).toEqual([principal]);
    expect(await code(ana.setAccountStatus(newOperationKey(), principal, only[0]!.version, 'arquivada'))).toEqual(['ultima_conta_ativa', null]);
  });

  it('escrita direta: sem inserir, excluir ou mudar outra coluna; a pessoa de fora não renomeia nem lê', async () => {
    const db = clientFor(ANA, T0);
    const ins = await db.from('financial_accounts').insert({ context_id: ctx, name: 'Direta', created_by: ANA });
    expect(ins.error?.code).toBe('42501');
    const del = await db.from('financial_accounts').delete().eq('id', principal);
    expect(del.error?.code).toBe('42501');
    for (const patch of [{ status: 'arquivada' }, { is_default: false }, { kind: 'outra' }, { version: 99 }, { deleted_at: new Date().toISOString() }]) {
      const upd = await db.from('financial_accounts').update(patch).eq('id', principal);
      expect(upd.error?.code, JSON.stringify(patch)).toBe('42501');
    }
    const outsider = clientFor(BRUNO, T0);
    const rename = await outsider.from('financial_accounts').update({ name: 'Invasão' }, { count: 'exact' }).eq('id', principal);
    expect(rename.error).toBeNull();
    expect(rename.count).toBe(0);
    expect((await outsider.from('financial_accounts').select('id').eq('id', principal)).data).toEqual([]);
    const anon = await clientFor(null).from('financial_accounts').select('id');
    expect(anon.error?.code).toBe('42501');
    const call = await clientFor(null).rpc('create_account', { p_idempotency_key: newOperationKey(), p_context_id: ctx, p_name: 'Anônima', p_kind: 'banco' });
    expect(call.error?.code).toBe('42501');
  });
});

describe('conversor das contas de origem', () => {
  // Sem rede: os argumentos de cada função, a leitura das linhas, a recusa de linha incoerente e os códigos de erro novos.
  const calls: [string, Record<string, unknown>][] = [];
  const row = { id: 'a1', context_id: 'ctx', name: 'Carteira', currency: 'BRL', status: 'ativa', initial_balance_cents: null, kind: 'dinheiro', is_default: false, version: 1 };
  const expected = { id: 'a1', contextId: 'ctx', name: 'Carteira', currency: 'BRL', initialBalanceCents: null, kind: 'dinheiro', status: 'ativa', isDefault: false, version: 1 };
  const query = (result: { data: unknown; error: unknown }) => {
    const q: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'is', 'in', 'order', 'range', 'maybeSingle', 'update']) q[m] = () => q;
    q.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => Promise.resolve(result).then(resolve, reject);
    return q;
  };
  const fake = (rpc: Record<string, unknown>, tables: Record<string, unknown> = {}, error: unknown = null) => {
    const db = {
      from: (table: string) => query(error ? { data: null, error } : { data: tables[table] ?? null, error: null }),
      rpc: async (fn: string, args: Record<string, unknown>) => {
        calls.push([fn, args]);
        return error ? { data: null, error } : { data: rpc[fn] ?? null, error: null };
      },
    };
    return new SupabaseRepository(db as unknown as SupabaseClient, { id: 'p1' });
  };
  const failure = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => (e instanceof RepoError ? [e.code, e.message, e.detail ?? null] : String(e)));

  it('argumentos das cinco funções e leitura da conta', async () => {
    calls.length = 0;
    const repo = fake({
      create_account: row,
      update_account: { ...row, version: 2 },
      set_default_account: { ...row, is_default: true, version: 2 },
      set_account_status: { ...row, status: 'arquivada', version: 2 },
      delete_account: { ...row, status: 'arquivada', version: 2, deleted_at: 'x', deleted_by: 'p1' },
    }, { financial_accounts: [row, { ...row, id: 'a2', name: 'Antiga', status: 'arquivada' }] });
    expect(await repo.createAccount('chave-0001', 'ctx', { name: 'Carteira', kind: 'dinheiro' })).toEqual(expected);
    expect(await repo.updateAccount('chave-0002', 'a1', 1, { name: 'Dinheiro', kind: 'outra' })).toEqual({ ...expected, version: 2 });
    expect(await repo.setDefaultAccount('chave-0003', 'a1', 1)).toEqual({ ...expected, isDefault: true, version: 2 });
    expect(await repo.setAccountStatus('chave-0004', 'a1', 1, 'arquivada')).toEqual({ ...expected, status: 'arquivada', version: 2 });
    expect((await repo.deleteAccount('chave-0005', 'a1', 1)).status).toBe('arquivada');
    await repo.setAccountStatus('chave-0006', 'a1', 2, 'arquivada', 'a2');
    expect(calls).toEqual([
      ['create_account', { p_idempotency_key: 'chave-0001', p_context_id: 'ctx', p_name: 'Carteira', p_kind: 'dinheiro' }],
      ['update_account', { p_idempotency_key: 'chave-0002', p_account_id: 'a1', p_expected_version: 1, p_name: 'Dinheiro', p_kind: 'outra' }],
      ['set_default_account', { p_idempotency_key: 'chave-0003', p_account_id: 'a1', p_expected_version: 1 }],
      ['set_account_status', { p_idempotency_key: 'chave-0004', p_account_id: 'a1', p_expected_version: 1, p_status: 'arquivada', p_new_default_id: null }],
      ['delete_account', { p_idempotency_key: 'chave-0005', p_account_id: 'a1', p_expected_version: 1 }],
      ['set_account_status', { p_idempotency_key: 'chave-0006', p_account_id: 'a1', p_expected_version: 2, p_status: 'arquivada', p_new_default_id: 'a2' }],
    ]);
    expect((await repo.listAccounts('ctx')).map((a) => a.name)).toEqual(['Carteira', 'Antiga']);
    // bigint como texto no saldo inicial.
    expect((await fake({ create_account: { ...row, initial_balance_cents: '1500' } }).createAccount('chave-0007', 'ctx', { name: 'Carteira', kind: 'dinheiro' })).initialBalanceCents).toBe(1500);
  });

  it('linha incoerente é recusada e a movimentação com conta só vale em aporte e resgate', async () => {
    for (const bad of [{ ...row, kind: 'poupanca' }, { ...row, status: 'excluida' }, { ...row, name: '' }, { ...row, name: 'x'.repeat(41) }, { ...row, version: 0 }, { ...row, is_default: true, status: 'arquivada' }]) {
      expect(await failure(fake({ create_account: bad }).createAccount('chave-0008', 'ctx', { name: 'Carteira', kind: 'dinheiro' }))).toEqual(['desconhecido', 'conta_inconsistente', null]);
    }
    expect(await failure(fake({}).createAccount('chave-0009', 'ctx', { name: 'Carteira', kind: 'dinheiro' }))).toEqual(['desconhecido', 'desconhecido', null]);
    const goal = {
      id: 'g1', context_id: 'ctx', goal_type: 'objetivo', name: 'Viagem', target_cents: 500000, target_month: null, planned_monthly_cents: null,
      essential_base_cents: null, essential_months: null, essential_base_source: null, status: 'ativa', created_by: 'p1', version: 1, created_at: 'a', updated_at: 'b',
      saved_cents: 1000, initial_cents: 0, deposits_cents: 1000, withdrawals_cents: 0, income_cents: 0, appreciation_cents: 0, depreciation_cents: 0, last_movement_on: '2036-10-07',
    };
    const movement = { id: 'm1', goal_id: 'g1', context_id: 'ctx', kind: 'aporte', amount_cents: 1000, occurred_on: '2036-10-07', note: null, account_id: 'a1', created_by: 'p1', version: 1, created_at: 'a', updated_at: 'b' };
    expect((await fake({ add_goal_movement: { goal, movement } }).addGoalMovement('chave-0010', 'g1', 'aporte', { amountCents: 1000, occurredOn: '2036-10-07', note: null, accountId: 'a1' })).movement!.accountId).toBe('a1');
    expect((await fake({ add_goal_movement: { goal, movement: { ...movement, account_id: undefined } } }).addGoalMovement('chave-0011', 'g1', 'aporte', { amountCents: 1000, occurredOn: '2036-10-07', note: null })).movement!.accountId).toBeNull();
    expect(await failure(fake({ add_goal_movement: { goal, movement: { ...movement, kind: 'rendimento' } } }).addGoalMovement('chave-0012', 'g1', 'rendimento', { amountCents: 1000, occurredOn: '2036-10-07', note: null }))).toEqual(['desconhecido', 'movimento_inconsistente', null]);
  });

  it('listAccounts devolve as ativas antes das arquivadas, a principal no topo, qualquer que seja a ordem que o banco entregue', async () => {
    const mk = (id: string, status: string, isDefault = false) => ({ ...row, id, name: id, status, is_default: isDefault });
    const rows = [mk('arq1', 'arquivada'), mk('ativa2', 'ativa'), mk('arq2', 'arquivada'), mk('principal', 'ativa', true), mk('ativa3', 'ativa')];
    const listed = await fake({}, { financial_accounts: rows }).listAccounts('ctx');
    expect(listed.map((a) => a.id)).toEqual(['principal', 'ativa2', 'ativa3', 'arq1', 'arq2']);
  });

  it('a conta de aporte vai só quando informada; em alterar, nula tira a conta e ausente não manda nada (o banco mantém a conta)', async () => {
    calls.length = 0;
    const goal = { id: 'g1', context_id: 'ctx', goal_type: 'objetivo', name: 'Viagem', target_cents: 500000, target_month: null, planned_monthly_cents: null, essential_base_cents: null, essential_months: null, essential_base_source: null, status: 'ativa', created_by: 'p1', version: 1, created_at: 'a', updated_at: 'b', saved_cents: 0, initial_cents: 0, deposits_cents: 0, withdrawals_cents: 0, income_cents: 0, appreciation_cents: 0, depreciation_cents: 0, last_movement_on: null };
    const repo = fake({ add_goal_movement: { goal, movement: null }, update_goal_movement: { goal, movement: null } });
    const base = { amountCents: 1000, occurredOn: '2036-10-07', note: null };
    await repo.addGoalMovement('chave-0020', 'g1', 'aporte', base);
    await repo.addGoalMovement('chave-0021', 'g1', 'aporte', { ...base, accountId: null });
    await repo.addGoalMovement('chave-0022', 'g1', 'aporte', { ...base, accountId: 'a1' });
    await repo.updateGoalMovement('chave-0023', 'm1', 1, base);
    await repo.updateGoalMovement('chave-0024', 'm1', 1, { ...base, accountId: null });
    await repo.updateGoalMovement('chave-0025', 'm1', 1, { ...base, accountId: 'a1' });
    expect(calls.map(([, args]) => ('p_account_id' in args ? args.p_account_id : 'ausente'))).toEqual(['ausente', 'ausente', 'a1', 'ausente', null, 'a1']);
  });

  it('códigos de erro novos voltam com o próprio nome, sem detalhe além de versao_atual', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => undefined));
    try {
      for (const code of ['tipo_da_conta_invalido', 'nome_da_conta_repetido', 'limite_de_contas', 'conta_principal', 'ultima_conta_ativa', 'conta_com_lancamentos', 'conta_arquivada', 'nome_da_conta_invalido', 'conta_invalida'] as const) {
        for (const message of [code, `ERROR: ${code}`]) {
          const repo = fake({}, {}, { message, code: 'PT409', details: 'Key (id)=(0000)=(segredo) já existe. 12345678' });
          expect(await failure(repo.createAccount('chave-4001', 'ctx', { name: 'X', kind: 'banco' }))).toEqual([code, code, null]);
          expect(await failure(repo.setAccountStatus('chave-4002', 'a1', 1, 'arquivada'))).toEqual([code, code, null]);
          expect(await failure(repo.deleteAccount('chave-4003', 'a1', 1))).toEqual([code, code, null]);
        }
      }
      const stale = fake({}, {}, { message: 'versao_desatualizada', code: 'PT409', details: 'versao_atual=7' });
      expect(await failure(stale.updateAccount('chave-4004', 'a1', 1, { name: 'X', kind: 'banco' }))).toEqual(['versao_desatualizada', 'versao_desatualizada', 'versao_atual=7']);
      // A renomeação direta: nome repetido (índice único) e nome fora do tamanho (restrição de coluna).
      expect(await failure(fake({}, {}, { message: 'duplicate key value violates unique constraint "financial_accounts_name_live"', code: '23505' }).renameAccount('a1', 'X'))).toEqual(['nome_da_conta_repetido', 'nome_da_conta_repetido', null]);
      expect(await failure(fake({}, {}, { message: 'new row violates check constraint', code: '23514' }).renameAccount('a1', 'X'))).toEqual(['nome_da_conta_invalido', 'nome_da_conta_invalido', null]);
      for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  });
});

describe('API real: buscar em Movimentações (Ciclo H1, D-045)', () => {
  // Ana, em 07/10/2037, num período em que nenhum bloco anterior gravou nada. Bruno é a pessoa de fora. Gastos, contas, cartão e
  // pessoas FICTÍCIOS. A busca só lê: o teste confere que nenhuma requisição de escrita sai nas buscas.
  const T0 = '2037-10-07';
  const YEAR: RecordSearchFilter = { from: '2037-01-01', to: '2037-12-31', kind: null, category: null, accountId: null, minCents: null, maxCents: null, terms: [] };
  const methods: string[] = [];
  const spy: typeof fetch = async (input, init) => {
    methods.push((init?.method ?? 'GET').toUpperCase());
    return fetch(input, init);
  };
  const ana = repoFor(ANA, T0);
  const bruno = repoFor(BRUNO, T0);
  const reader = new SupabaseRepository(clientFor(ANA, T0, spy), { id: ANA });
  let ctx = '';
  let principal = '';
  let wallet = '';
  let card: Card;

  const params = (over: Partial<SearchParams> = {}): SearchParams => ({ ...DEFAULT_SEARCH, ...over });
  const record = (kind: RecordKind, description: string, reais: number, occurredOn: IsoDate, category: string | null, accountId = principal) =>
    ana.createRecord(newOperationKey(), ctx, kind, { accountId, amountCents: cents(reais), occurredOn, description, category });
  const allOf2037 = async () => {
    const rows: FinancialRecord[] = [];
    for (let m = 1; m <= 12; m++) rows.push(...(await ana.listRecords(ctx, `2037-${String(m).padStart(2, '0')}`)));
    return rows;
  };
  const line = (r: FinancialRecord) => `${r.occurredOn} ${r.description} ${r.amountCents}`;

  beforeAll(async () => {
    const space = (await ana.getSpace())!;
    ctx = space.personalContextId;
    principal = space.accounts[0]!.id;
    wallet = (await ana.createAccount(newOperationKey(), ctx, { name: 'Carteira da busca', kind: 'dinheiro' })).id;
    await record('despesa', 'Conta de luz', 140, '2037-08-10', 'Moradia');
    await record('despesa', 'Conta de LUZ', 150, '2037-09-10', 'Moradia');
    await record('despesa', 'Luz da casa (Enel)', 170.5, '2037-10-05', 'Moradia');
    await record('despesa', 'Farmácia', 45.9, '2037-09-12', 'Saúde');
    await record('despesa', 'Café', 8, '2037-10-02', null);
    await record('despesa', 'Padaria', 12, '2037-10-03', 'Mercado', wallet);
    await record('receita', 'Salário', 6000, '2037-10-01', 'Salário');
    await record('receita', 'Freela de luz', 300, '2037-09-20', 'Renda extra');
    // Uma conta a pagar paga: o gasto do pagamento entra na busca.
    const bill = (await ana.createCommitment(newOperationKey(), ctx, { description: 'Internet da busca', amountCents: cents(99), dueOn: '2037-10-04', category: 'Moradia' })).commitment;
    await ana.payCommitment(newOperationKey(), bill.id, bill.version, { accountId: principal, amountCents: cents(99), paidOn: '2037-10-04', category: 'Moradia' });
    // Um cartão com duas compras; a fatura de outubro (fechada em 03/10) é paga em 06/10.
    card = (await ana.createCard(newOperationKey(), ctx, { name: 'Cartão da busca', lastDigits: null, closingDay: 3, dueDay: 10, limitCents: null })).card;
    await ana.addCardPurchase(newOperationKey(), card.id, { description: 'Tênis de corrida', category: 'Lazer', purchasedOn: '2037-09-20', totalCents: 60000, installments: 3 });
    await ana.addCardPurchase(newOperationKey(), card.id, { description: 'Livro de luz', category: 'Educação', purchasedOn: '2037-08-02', totalCents: 5000, installments: 1 });
    const october = (await ana.listInvoiceItems(card.id)).find((i) => i.month === '2037-10')!;
    await ana.payInvoice(newOperationKey(), card.id, '2037-10', october.commitmentVersion!, october.totalCents, '2037-10-06', principal);
  });

  it('a busca do banco é a regra do core: cada filtro devolve o mesmo que recordMatchesFilter sobre os registros do ano, na mesma ordem', async () => {
    const universe = await allOf2037();
    expect(universe.length).toBe(10);
    const filters: RecordSearchFilter[] = [
      YEAR,
      { ...YEAR, kind: 'despesa' },
      { ...YEAR, kind: 'receita' },
      { ...YEAR, category: 'Moradia' },
      { ...YEAR, category: NO_CATEGORY_LABEL },
      { ...YEAR, accountId: wallet },
      { ...YEAR, accountId: principal, kind: 'despesa' },
      { ...YEAR, minCents: cents(100), maxCents: cents(200) },
      { ...YEAR, minCents: cents(170.5), maxCents: cents(170.5) },
      { ...YEAR, from: '2037-09-10', to: '2037-10-02' },
      { ...YEAR, from: '2037-10-05', to: null },
      { ...YEAR, to: '2037-08-10' },
      { ...YEAR, kind: 'despesa', category: 'Saúde', minCents: 1, maxCents: cents(50) },
      // Texto: o filtro mais largo do banco (ILIKE com _ nas letras que podem ter acento) é o mesmo do core, com e sem acento.
      { ...YEAR, terms: searchTerms('farmacia') },
      { ...YEAR, terms: searchTerms('FARMÁCIA') },
      { ...YEAR, terms: searchTerms('cafe') },
      { ...YEAR, terms: searchTerms('salario') },
      { ...YEAR, terms: searchTerms('luz') },
      { ...YEAR, terms: searchTerms('luz conta'), kind: 'despesa' },
      { ...YEAR, terms: searchTerms('de   casa') },
      { ...YEAR, terms: searchTerms('50%') },
      { ...YEAR, terms: searchTerms('a_b') },
      { ...YEAR, terms: searchTerms('l\\z') },
    ];
    for (const filter of filters) {
      const page = await reader.searchRecords(ctx, filter);
      const expected = universe.filter((r) => recordMatchesFilter(r, filter)).sort(compareNewestRecord);
      expect(page.items.map(line), JSON.stringify(filter)).toEqual(expected.map(line));
      expect(page.truncated).toBe(false);
    }
    // O texto já vem filtrado do banco: "farmacia" (sem acento) acha "Farmácia", e a conferência exata do aparelho confirma.
    const farmacia = await reader.searchRecords(ctx, { ...YEAR, terms: searchTerms('farmacia') });
    expect(farmacia.items.map((r) => r.description)).toEqual(['Farmácia']);
    expect((await reader.searchRecords(ctx, { ...YEAR, terms: searchTerms('CAFE') })).items.map((r) => r.description)).toEqual(['Café']);
    expect((await reader.searchRecords(ctx, { ...YEAR, terms: searchTerms('%') })).items).toEqual([]);
    expect((await reader.searchRecords(ctx, { ...YEAR, terms: searchTerms('_') })).items).toEqual([]);
    // Datas incluem os dois limites; o filtro com valor exato acha o gasto de R$ 170,50.
    expect((await reader.searchRecords(ctx, { ...YEAR, minCents: cents(170.5), maxCents: cents(170.5) })).items.map((r) => r.description)).toEqual(['Luz da casa (Enel)']);
    expect((await reader.searchRecords(ctx, { ...YEAR, from: '2037-10-05', to: '2037-10-05' })).items.map((r) => r.description)).toEqual(['Luz da casa (Enel)']);
  });

  it('"quanto paguei de luz?": o texto vai ao banco como filtro mais largo, o aparelho confere sem acento nem maiúsculas, e a soma sai do core', async () => {
    const page = await reader.searchRecords(ctx, searchFilterOf(params({ text: 'LUZ', kind: 'despesa', period: 'ano' }), T0));
    expect(page.items.every((r) => /l.z/i.test(r.description))).toBe(true);
    expect(page.items.some((r) => r.description === 'Farmácia')).toBe(false);
    const luz = searchResultRecords(page.items, params({ text: 'LUZ', kind: 'despesa', period: 'ano' }), T0);
    expect(luz.map(line)).toEqual(['2037-10-05 Luz da casa (Enel) 17050', '2037-09-10 Conta de LUZ 15000', '2037-08-10 Conta de luz 14000']);
    const s = summarizeSearch(luz);
    expect(s.paid).toEqual({ count: 3, cents: 46050, months: 3 });
    expect(s.averagePaidCents).toBe(15350);
    // Farmácia com acento achada sem acento (e com acento, e em maiúsculas), pelo filtro do banco e pela conferência do aparelho.
    for (const text of ['farmacia', 'farmácia', 'FARMACIA', 'Farmácia']) {
      const p = params({ text, kind: 'despesa', period: 'ano' });
      const found = await reader.searchRecords(ctx, searchFilterOf(p, T0));
      expect(searchResultRecords(found.items, p, T0).map((r) => r.description), text).toEqual(['Farmácia']);
    }
    // O recebimento "Freela de luz" não entra na busca de gastos.
    expect(luz.some((r) => r.kind === 'receita')).toBe(false);
  });

  it('pagamento de conta e de fatura aparecem como gastos; a fatura é um gasto só, sem abrir as compras', async () => {
    const page = await reader.searchRecords(ctx, { ...YEAR, kind: 'despesa' });
    const bill = page.items.find((r) => r.description === 'Internet da busca')!;
    expect(bill.commitmentId).not.toBeNull();
    const invoice = page.items.filter((r) => r.invoice !== null);
    expect(invoice).toHaveLength(1);
    expect(invoice[0]!.invoice).toEqual({ cardId: card.id, month: '2037-10' });
    expect(invoice[0]!.description).toBe('Fatura Cartão da busca (outubro)');
    expect(invoice[0]!.amountCents).toBe(20000);
    expect(page.items.some((r) => /tênis|livro/i.test(r.description))).toBe(false);
  });

  it('compras no cartão: uma linha por compra, valor total, parcelas e data da compra; fora dos gastos', async () => {
    const page = await reader.searchCardPurchases(ctx, YEAR);
    expect(page.truncated).toBe(false);
    expect(page.items.map((e) => [e.purchasedOn, e.description, e.amountCents, e.installments])).toEqual([
      ['2037-09-20', 'Tênis de corrida', 60000, 3],
      ['2037-08-02', 'Livro de luz', 5000, 1],
    ]);
    const expected = page.items.filter((e) => purchaseMatchesFilter(e, YEAR)).sort(compareNewestPurchase);
    expect(page.items.map((e) => e.id)).toEqual(expected.map((e) => e.id));
    expect(summarizePurchases(page.items)).toEqual({ count: 2, totalCents: 65000 });
    // Categoria, valor total e texto.
    expect((await reader.searchCardPurchases(ctx, { ...YEAR, category: 'Lazer' })).items.map((e) => e.description)).toEqual(['Tênis de corrida']);
    expect((await reader.searchCardPurchases(ctx, { ...YEAR, minCents: 50000 })).items.map((e) => e.description)).toEqual(['Tênis de corrida']);
    expect((await reader.searchCardPurchases(ctx, { ...YEAR, from: '2037-09-01' })).items.map((e) => e.description)).toEqual(['Tênis de corrida']);
    expect(searchResultPurchases(page.items, params({ text: 'LUZ', period: 'tudo' }), T0).map((e) => e.description)).toEqual(['Livro de luz']);
    // O texto também vai ao banco nas compras: "tenis" (sem acento) acha "Tênis de corrida" e "luz" só o livro.
    expect((await reader.searchCardPurchases(ctx, { ...YEAR, terms: searchTerms('tenis') })).items.map((e) => e.description)).toEqual(['Tênis de corrida']);
    expect((await reader.searchCardPurchases(ctx, { ...YEAR, terms: searchTerms('LUZ') })).items.map((e) => e.description)).toEqual(['Livro de luz']);
    // A soma de Pago do mês é a de sempre: a compra no cartão não entra.
    const october = summarizeMonth(await ana.listRecords(ctx, '2037-10'), ctx, '2037-10');
    expect(october.composition.paid.map((r) => r.description)).not.toContain('Tênis de corrida');
  });

  it('recebimento ou conta de origem no filtro: nenhuma compra no cartão (e nem pergunta ao banco)', async () => {
    const before = methods.length;
    expect(await reader.searchCardPurchases(ctx, { ...YEAR, kind: 'receita' })).toEqual({ items: [], truncated: false });
    expect(await reader.searchCardPurchases(ctx, { ...YEAR, accountId: principal })).toEqual({ items: [], truncated: false });
    expect(methods.length).toBe(before);
  });

  it('só lê: nenhuma escrita sai nas buscas, e o app não deixa rastro no banco', async () => {
    const operations = async () => (await clientFor(ANA, T0).from('record_operations').select('idempotency_key', { count: 'exact', head: true })).count;
    const operationsBefore = await operations();
    expect(operationsBefore).toBeGreaterThan(0);
    const before = methods.length;
    await reader.searchRecords(ctx, YEAR);
    await reader.searchCardPurchases(ctx, YEAR);
    const after = methods.slice(before);
    expect(after.length).toBeGreaterThan(1);
    expect(after.every((m) => m === 'GET')).toBe(true);
    expect(await operations()).toBe(operationsBefore);
  });

  it('a pessoa de fora não lê nada deste contexto', async () => {
    expect(await bruno.searchRecords(ctx, YEAR)).toEqual({ items: [], truncated: false });
    expect(await bruno.searchCardPurchases(ctx, YEAR)).toEqual({ items: [], truncated: false });
  });

  it('registro excluído sai da busca', async () => {
    const gone = await record('despesa', 'Registro que será excluído', 5, '2037-10-06', null);
    expect((await reader.searchRecords(ctx, { ...YEAR, from: '2037-10-06', to: '2037-10-06' })).items.map((r) => r.id)).toContain(gone.id);
    await ana.deleteRecord(newOperationKey(), gone.id, gone.version);
    expect((await reader.searchRecords(ctx, { ...YEAR, from: '2037-10-06', to: '2037-10-06' })).items.map((r) => r.id)).not.toContain(gone.id);
  });
});

describe('conversor da busca em Movimentações', () => {
  // Sem rede: os filtros que chegam ao PostgREST, as páginas de 500 até o limite de 1.000 e o aviso de que havia mais.
  const filter: RecordSearchFilter = { from: '2026-01-01', to: '2026-12-31', kind: 'despesa', category: 'Moradia', accountId: 'a1', minCents: 100, maxCents: 90000, terms: [] };
  const none: RecordSearchFilter = { from: null, to: null, kind: null, category: null, accountId: null, minCents: null, maxCents: null, terms: [] };
  const recordRow = (i: number) => ({
    id: `r${String(i).padStart(5, '0')}`,
    context_id: 'ctx',
    account_id: 'a1',
    kind: 'despesa',
    status: 'realizado',
    amount_cents: 1000,
    currency: 'BRL',
    occurred_on: '2026-10-05',
    description: 'Luz',
    category: null,
    commitment_id: null,
    card_id: null,
    invoice_month: null,
    receipt_key: null,
    created_by: 'p1',
    version: 1,
    created_at: '2026-10-05T10:00:00.000Z',
    updated_at: '2026-10-05T10:00:00.000Z',
  });
  const purchaseRow = (i: number) => ({
    id: `e${String(i).padStart(5, '0')}`,
    context_id: 'ctx',
    card_id: 'k1',
    kind: 'compra',
    description: 'Tênis',
    category: 'Lazer',
    charge_kind: null,
    purchased_on: '2026-10-05',
    amount_cents: 60000,
    installments: 3,
    invoice_month: '2026-11-01',
    source_month: null,
    payment_record_id: null,
    receipt_key: null,
    created_by: 'p1',
    version: 1,
    created_at: '2026-10-05T10:00:00.000Z',
    updated_at: '2026-10-05T10:00:00.000Z',
  });
  /** Banco de mentira: guarda a ordem das chamadas de filtro, de ordenação e de página, e devolve `total` linhas. */
  const fakeDb = (total: number, makeRow: (i: number) => unknown) => {
    const log: unknown[][] = [];
    const ranges: [number, number][] = [];
    const tables: string[] = [];
    const db = {
      from: (table: string) => {
        tables.push(table);
        const q: Record<string, unknown> = {};
        for (const m of ['select', 'eq', 'is', 'gte', 'lte', 'ilike', 'order']) q[m] = (...args: unknown[]) => (log.push([m, ...args]), q);
        q.range = (from: number, to: number) => {
          ranges.push([from, to]);
          const page = { data: Array.from({ length: Math.max(0, Math.min(total, to + 1) - from) }, (_, k) => makeRow(from + k)), error: null };
          return { then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => Promise.resolve(page).then(resolve, reject) };
        };
        return q;
      },
    };
    return { repo: new SupabaseRepository(db as unknown as SupabaseClient, { id: 'p1' }), log, ranges, tables };
  };

  it('registros: todos os filtros vão ao banco, do mais recente ao mais antigo, e o texto vai como ILIKE por palavra', async () => {
    const { repo, log, tables } = fakeDb(3, recordRow);
    const page = await repo.searchRecords('ctx', { ...filter, terms: ['farmacia', '50%', 'a_b'] });
    expect(page.items).toHaveLength(3);
    expect(tables).toEqual(['financial_records']);
    expect(log).toEqual([
      ['select', '*'],
      ['eq', 'context_id', 'ctx'],
      ['gte', 'occurred_on', '2026-01-01'],
      ['lte', 'occurred_on', '2026-12-31'],
      ['eq', 'category', 'Moradia'],
      ['gte', 'amount_cents', 100],
      ['lte', 'amount_cents', 90000],
      ['ilike', 'description', '%f_rm____%'],
      ['ilike', 'description', '%50\\%%'],
      ['ilike', 'description', '%_\\_b%'],
      ['eq', 'kind', 'despesa'],
      ['eq', 'account_id', 'a1'],
      ['order', 'occurred_on', { ascending: false }],
      ['order', 'created_at', { ascending: false }],
      ['order', 'id', { ascending: false }],
    ]);
  });

  it('sem filtro só vai o contexto; "Sem categoria" pede a coluna nula', async () => {
    const a = fakeDb(1, recordRow);
    await a.repo.searchRecords('ctx', none);
    expect(a.log.filter(([m]) => m !== 'order')).toEqual([['select', '*'], ['eq', 'context_id', 'ctx']]);
    const b = fakeDb(1, recordRow);
    await b.repo.searchRecords('ctx', { ...none, category: NO_CATEGORY_LABEL });
    expect(b.log).toContainEqual(['is', 'category', null]);
    expect(b.log.some(([m, c]) => m === 'eq' && c === 'category')).toBe(false);
  });

  it('o limite de 1.000: páginas de 500, uma linha a mais para saber se havia mais', async () => {
    const big = fakeDb(1203, recordRow);
    const page = await big.repo.searchRecords('ctx', none);
    expect(big.ranges).toEqual([[0, 499], [500, 999], [1000, 1000]]);
    expect(page.items).toHaveLength(SEARCH_LIMIT);
    expect(page.truncated).toBe(true);
    expect(page.items[0]!.id).toBe('r00000');
    expect(page.items[SEARCH_LIMIT - 1]!.id).toBe('r00999');

    // Exatamente 1.000: sem aviso.
    const exact = fakeDb(1000, recordRow);
    const full = await exact.repo.searchRecords('ctx', none);
    expect(full.items).toHaveLength(1000);
    expect(full.truncated).toBe(false);
    expect(exact.ranges).toEqual([[0, 499], [500, 999], [1000, 1000]]);

    // Uma página parcial acaba na primeira chamada.
    const small = fakeDb(300, recordRow);
    expect((await small.repo.searchRecords('ctx', none)).truncated).toBe(false);
    expect(small.ranges).toEqual([[0, 499]]);
    const empty = fakeDb(0, recordRow);
    expect(await empty.repo.searchRecords('ctx', none)).toEqual({ items: [], truncated: false });
  });

  it('linhas repetidas entre as páginas (mesmo id) saem antes do corte, na ordem em que chegaram', async () => {
    // A leitura por posição pode repetir uma linha se algo mudar entre os pedidos: aqui a segunda página começa repetindo as ids 498 e 499.
    const total = 1100;
    const rowAt = (i: number) => recordRow(i < 500 ? i : i - 2);
    const dup = fakeDb(total, rowAt);
    const page = await dup.repo.searchRecords('ctx', none);
    const ids = page.items.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.slice(0, 3)).toEqual(['r00000', 'r00001', 'r00002']);
    expect(ids.slice(496, 503)).toEqual(['r00496', 'r00497', 'r00498', 'r00499', 'r00500', 'r00501', 'r00502']);
    expect(page.items).toHaveLength(SEARCH_LIMIT);
    expect(page.truncated).toBe(true);
    // Sem mais linhas além das repetidas: não avisa à toa.
    const exact = fakeDb(1002, rowAt);
    const full = await exact.repo.searchRecords('ctx', none);
    expect(full.items).toHaveLength(1000);
    expect(full.truncated).toBe(false);
  });

  it('compras: só kind compra, pela data da compra; recebimento e conta de origem nem consultam', async () => {
    const { repo, log, tables } = fakeDb(2, purchaseRow);
    const page = await repo.searchCardPurchases('ctx', { ...filter, accountId: null });
    expect(tables).toEqual(['card_entry_items']);
    expect(page.items.map((e) => [e.purchasedOn, e.amountCents, e.installments, e.invoiceMonth])).toEqual([
      ['2026-10-05', 60000, 3, '2026-11'],
      ['2026-10-05', 60000, 3, '2026-11'],
    ]);
    expect(log).toEqual([
      ['select', '*'],
      ['eq', 'context_id', 'ctx'],
      ['eq', 'kind', 'compra'],
      ['gte', 'purchased_on', '2026-01-01'],
      ['lte', 'purchased_on', '2026-12-31'],
      ['eq', 'category', 'Moradia'],
      ['gte', 'amount_cents', 100],
      ['lte', 'amount_cents', 90000],
      ['order', 'purchased_on', { ascending: false }],
      ['order', 'created_at', { ascending: false }],
      ['order', 'id', { ascending: false }],
    ]);
    const skipped = fakeDb(2, purchaseRow);
    expect(await skipped.repo.searchCardPurchases('ctx', { ...none, kind: 'receita' })).toEqual({ items: [], truncated: false });
    expect(await skipped.repo.searchCardPurchases('ctx', { ...none, accountId: 'a1' })).toEqual({ items: [], truncated: false });
    expect(skipped.tables).toEqual([]);
    const big = fakeDb(1100, purchaseRow);
    const many = await big.repo.searchCardPurchases('ctx', none);
    expect(many.items).toHaveLength(SEARCH_LIMIT);
    expect(many.truncated).toBe(true);
  });

  it('linha incoerente é recusada, e um erro do banco vira o erro de sempre', async () => {
    const bad = fakeDb(1, (i) => ({ ...recordRow(i), card_id: 'k1' }));
    expect(await bad.repo.searchRecords('ctx', none).then(() => null, (e: unknown) => (e instanceof RepoError ? [e.code, e.message] : String(e)))).toEqual(['desconhecido', 'fatura_inconsistente']);
    const badPurchase = fakeDb(1, (i) => ({ ...purchaseRow(i), installments: 0 }));
    expect(await badPurchase.repo.searchCardPurchases('ctx', none).then(() => null, (e: unknown) => (e instanceof RepoError ? [e.code, e.message] : String(e)))).toEqual(['desconhecido', 'lancamento_inconsistente']);
    const failing = {
      from: () => {
        const q: Record<string, unknown> = {};
        for (const m of ['select', 'eq', 'is', 'gte', 'lte', 'ilike', 'order']) q[m] = () => q;
        q.range = () => Promise.resolve({ data: null, error: { message: 'Failed to fetch' } });
        return q;
      },
    };
    const repo = new SupabaseRepository(failing as unknown as SupabaseClient, { id: 'p1' });
    expect(await repo.searchRecords('ctx', none).then(() => null, (e: unknown) => (e instanceof RepoError ? e.code : String(e)))).toBe('rede');
  });
});
