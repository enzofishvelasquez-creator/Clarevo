import { describe, expect, it } from 'vitest';
import {
  COMMITTED_GROUPS,
  COMMITTED_TEXT,
  DEBT_REFERENCE,
  DEMO_TODAY,
  INCOME_REFERENCE_ERROR_TEXT,
  MemoryRepository,
  annualShare,
  committedGroupOf,
  committedLine,
  committedMeter,
  committedPermille,
  committedTexts,
  committedValueOf,
  createDemoRepository,
  formatPermille,
  isDebtCommitment,
  isRepoError,
  newOperationKey,
  paymentsForecast,
  projectCommitted,
  referenceFor,
  referenceMonthBounds,
  referenceMonthChoices,
  referenceMonthError,
  suggestReference,
  summarizeCommitted,
  summarizeMonth,
  summarizeToPay,
  upcomingCommittedMonths,
  validateIncomeReferenceDraft,
  type Commitment,
  type CommitmentSeriesRef,
  type FinancialRecord,
  type IncomeReference,
  type RepoErrorCode,
  type SeriesKind,
  type SeriesNature,
} from '../src';

/**
 * Ciclo B · Renda comprometida (D-026, com o grupo "Contas do ano" da spec3 e P-019 pela recomendação). Dados fictícios.
 * Números de spec2 §2.3: base de outubro 52,5%, novembro 63,8%, sequência de aceite B, próximos meses e casos de borda.
 */

const OCT = '2026-10';
const NOV = '2026-11';
const SEP = '2026-09';
const CREATED_AT = '2026-10-01T12:00:00.000Z';

async function expectCode(p: Promise<unknown>, code: RepoErrorCode) {
  let caught: unknown = null;
  try {
    await p;
  } catch (e) {
    caught = e;
  }
  expect(isRepoError(caught, code), `esperado ${code}, veio ${String(caught)}`).toBe(true);
}

let seq = 0;
/** Conta a pagar fictícia (padrão: avulsa, em aberto, R$ 100,00). */
const bill = (dueOn: string, over: Partial<Commitment> = {}): Commitment => {
  seq += 1;
  return {
    id: `c-${String(seq).padStart(4, '0')}`,
    contextId: 'ctx',
    description: 'Conta',
    amountCents: 10_000,
    currency: 'BRL',
    dueOn,
    category: null,
    status: 'aberto',
    payment: null,
    series: null,
    seriesOverride: false,
    invoice: null,
    amountIsEstimate: false,
    createdBy: 'pessoa',
    version: 1,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    ...over,
  };
};
const ref = (kind: SeriesKind, nature: SeriesNature = 'conta', number = 1): CommitmentSeriesRef => ({
  id: `s-${kind}-${nature}`,
  number,
  kind,
  nature,
  installmentTotal: kind === 'parcelada' ? 48 : null,
  partsPerYear: kind === 'anual' ? 1 : null,
});
const paid = (amountCents: number, paidOn: string): Partial<Commitment> => ({
  status: 'quitado',
  payment: { recordId: 'reg', amountCents, paidOn, accountId: 'conta' },
});
const income = (fromMonth: string, amountCents: number, over: Partial<IncomeReference> = {}): IncomeReference => ({
  id: `ref-${fromMonth}`,
  contextId: 'ctx',
  fromMonth,
  amountCents,
  varies: false,
  createdBy: 'pessoa',
  version: 1,
  createdAt: CREATED_AT,
  updatedAt: CREATED_AT,
  amountChangedAt: null,
  ...over,
});
const receipt = (occurredOn: string, amountCents: number, category: string | null = 'Salário', kind: 'receita' | 'despesa' = 'receita'): FinancialRecord => {
  seq += 1;
  return {
    id: `r-${seq}`,
    contextId: 'ctx',
    accountId: 'conta',
    kind,
    status: 'realizado',
    amountCents,
    currency: 'BRL',
    occurredOn,
    description: 'Recebimento',
    category,
    commitmentId: null,
    invoice: null,
    receiptKey: null,
    createdBy: 'pessoa',
    version: 1,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  };
};

/** Demonstração com atalhos para os números da sequência de aceite. */
async function demo() {
  const repo = await createDemoRepository({ cards: false });
  const space = (await repo.getSpace())!;
  const ctx = space.personalContextId;
  const accountId = space.accounts[0]!.id;
  const committed = async (month = OCT) =>
    summarizeCommitted(await repo.listCommitments(ctx, month), ctx, month, DEMO_TODAY, await repo.listIncomeReferences(ctx), await repo.listSeries(ctx));
  /** [comprometido, percentual, fora dos compromissos], como na tabela da sequência B. */
  const row = async (month = OCT) => {
    const s = await committed(month);
    return [s.committedCents, s.committedPermille === null ? null : formatPermille(s.committedPermille, s.committedCents), s.outsideCents];
  };
  /** Identidade: comprometido = Σ pagas de C(M) + dueInMonthCents (summarizeToPay). */
  const identity = async (month = OCT) => {
    const list = await repo.listCommitments(ctx, month);
    const s = summarizeCommitted(list, ctx, month, DEMO_TODAY, []);
    const paidOfMonth = list.filter((c) => c.status === 'quitado' && c.dueOn.startsWith(month)).reduce((a, c) => a + c.payment!.amountCents, 0);
    expect(s.committedCents).toBe(paidOfMonth + summarizeToPay(list, ctx, month, DEMO_TODAY).dueInMonthCents);
    expect(s.paidPartCents).toBe(paidOfMonth);
  };
  const find = async (description: string, month = OCT) => (await repo.listCommitments(ctx, month)).find((c) => c.description === description && c.dueOn.startsWith(month))!;
  const totals = async (month = OCT) => {
    const s = summarizeMonth(await repo.listRecords(ctx, month), ctx, month);
    const toPay = summarizeToPay(await repo.listCommitments(ctx, month), ctx, month, DEMO_TODAY).toPayCents;
    return [s.receivedCents, s.paidCents, s.differenceCents, toPay];
  };
  return { repo, ctx, accountId, committed, row, identity, find, totals };
}

// ---------------------------------------------------------------------------
// 1. Percentual, formato e referência vigente
// ---------------------------------------------------------------------------

describe('percentual em milésimos e formato', () => {
  it('metade para cima em inteiros: 52,5%, 52,665% → 52,7%, menos de 0,1% e acima de 100%', () => {
    expect(committedPermille(315_000, 600_000)).toBe(525);
    expect(committedPermille(315_990, 600_000)).toBe(527); // 52,665%
    expect(committedPermille(1, 2_000)).toBe(1); // 0,05% sobe para 0,1%
    expect(committedPermille(1, 2_001)).toBe(0);
    expect(committedPermille(672_000, 600_000)).toBe(1120);
    expect(committedPermille(315_000, null)).toBeNull();
    expect(formatPermille(525, 315_000)).toBe('52,5%');
    expect(formatPermille(0, 0)).toBe('0,0%');
    expect(formatPermille(0, 1)).toBe('menos de 0,1%');
    expect(formatPermille(1, 1)).toBe('0,1%');
    expect(formatPermille(1120, 672_000)).toBe('112,0%');
    expect(formatPermille(12_345, 1)).toBe('1.234,5%');
    expect(() => formatPermille(-1, 0)).toThrow(RangeError);
    expect(() => formatPermille(1.5, 0)).toThrow(RangeError);
    // Renda no limite e conta de R$ 1,00: menos de 0,1%.
    expect(formatPermille(committedPermille(100, 999_999_999)!, 100)).toBe('menos de 0,1%');
  });

  it('referenceFor: a mais recente com início até o mês; nenhuma antes da primeira', () => {
    const refs = [income('2026-10', 500_000), income('2026-09', 600_000), income('2027-01', 700_000)];
    expect(referenceFor(refs, '2026-08')).toBeNull();
    expect(referenceFor(refs, SEP)!.amountCents).toBe(600_000);
    expect(referenceFor(refs, OCT)!.amountCents).toBe(500_000);
    expect(referenceFor(refs, '2026-12')!.amountCents).toBe(500_000);
    expect(referenceFor(refs, '2027-03')!.amountCents).toBe(700_000);
    expect(referenceFor([], OCT)).toBeNull();
  });

  it('grupos e dívidas: contas do ano nunca são dívida; outro parcelamento também não', () => {
    expect(committedGroupOf(bill(OCT + '-01'))).toBe('outras');
    expect(committedGroupOf(bill(OCT + '-01', { series: ref('mensal') }))).toBe('fixos');
    expect(committedGroupOf(bill(OCT + '-01', { series: ref('anual') }))).toBe('anuais');
    expect(committedGroupOf(bill(OCT + '-01', { series: ref('parcelada', 'outro_parcelamento') }))).toBe('parcelamentos');
    expect(committedGroupOf(bill(OCT + '-01', { invoice: { cardId: 'cartao-1', month: '2026-10', closingOn: '2026-10-03' } }))).toBe('faturas');
    expect(committedGroupOf(bill(OCT + '-01', { series: ref('parcelada', 'financiamento'), invoice: { cardId: 'cartao-1', month: '2026-10', closingOn: '2026-10-03' } }))).toBe('faturas');
    expect(COMMITTED_GROUPS).toEqual(['fixos', 'anuais', 'parcelamentos', 'faturas', 'outras']);
    // Fatura de cartão nunca é dívida.
    expect(isDebtCommitment(bill(OCT + '-01', { invoice: { cardId: 'cartao-1', month: '2026-10', closingOn: '2026-10-03' } }))).toBe(false);
    expect(isDebtCommitment(bill(OCT + '-01', { series: ref('parcelada', 'financiamento') }))).toBe(true);
    expect(isDebtCommitment(bill(OCT + '-01', { series: ref('parcelada', 'compra_parcelada') }))).toBe(true);
    expect(isDebtCommitment(bill(OCT + '-01', { series: ref('parcelada', 'outro_parcelamento') }))).toBe(false);
    expect(isDebtCommitment(bill(OCT + '-01', { series: ref('anual') }))).toBe(false);
    expect(isDebtCommitment(bill(OCT + '-01'))).toBe(false);
    // Paga entra pelo valor pago; em aberto pelo previsto.
    expect(committedValueOf(bill(OCT + '-15', { amountCents: 15_000, ...paid(15_990, '2026-10-07') }))).toBe(15_990);
    expect(committedValueOf(bill(OCT + '-15', { amountCents: 15_000 }))).toBe(15_000);
  });

  it('medidor na escala da referência: cheio com "+" acima de 100%; sem referência, nenhum', () => {
    expect(committedMeter(250_000, 65_000, 600_000)).toEqual({ paidPermille: 417, openPermille: 108, over: false });
    expect(committedMeter(0, 672_000, 600_000)).toEqual({ paidPermille: 0, openPermille: 1000, over: true });
    expect(committedMeter(700_000, 100_000, 600_000)).toEqual({ paidPermille: 1000, openPermille: 0, over: true });
    expect(committedMeter(600_000, 0, 600_000)).toEqual({ paidPermille: 1000, openPermille: 0, over: false });
    expect(committedMeter(1, 0, null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 2. Demonstração: outubro 52,5% e novembro 63,8%
// ---------------------------------------------------------------------------

describe('demonstração (renda de referência R$ 6.000,00 desde setembro)', () => {
  it('outubro: 52,5%, fora dos compromissos R$ 2.850,00; Resumo sem mudança (6.000 / 3.900 / 2.100 / 650)', async () => {
    const d = await demo();
    expect(await d.totals()).toEqual([600_000, 390_000, 210_000, 65_000]);
    const s = await d.committed();
    expect({
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
      from: s.referenceFrom,
      permille: [s.committedPermille, s.fixedPermille, s.annualPermille, s.installmentPermille, s.otherPermille, s.debtPermille],
      outside: s.outsideCents,
      count: s.count,
    }).toEqual({
      fixed: 250_000,
      annual: 0,
      installment: 0,
      debt: 0,
      other: 65_000,
      committed: 315_000,
      paid: 250_000,
      open: 65_000,
      estimated: 0,
      overdueBefore: 0,
      reference: 600_000,
      from: SEP,
      permille: [525, 417, 0, 0, 108, 0],
      outside: 285_000,
      count: 3,
    });
    expect(s.items.fixos.map((c) => c.description)).toEqual(['Aluguel']);
    expect(s.items.outras.map((c) => c.description)).toEqual(['Internet', 'Condomínio']);
    expect(s.overReference).toBe(false);
    expect(s.needsReview).toBe(false);
    // P-019: contas do ano ÷ 12 (IPVA 2.400,00 + IPTU 10 × 180,00 = 4.200,00), fora do percentual.
    expect(s.annualShare).toEqual({ yearlyCents: 420_000, monthlyCents: 35_000, estimated: true });

    const t = committedTexts(s, 600_000);
    expect(t.highlight).toBe('52,5%');
    expect(t.highlightCaption).toBe('da sua renda de referência em outubro de 2026');
    expect(t.highlightAmounts).toBe('R$ 3.150,00 em contas de R$ 6.000,00');
    expect([t.meterPaid, t.meterOpen]).toEqual(['Já pago · R$ 2.500,00', 'Em aberto · R$ 650,00']);
    expect(t.meterA11y).toBe('52,5% da renda de referência: já pago R$ 2.500,00, em aberto R$ 650,00.');
    expect(t.groups.map((g) => g.line)).toEqual([
      'Gastos fixos · R$ 2.500,00 · 41,7%',
      'Parcelamentos · R$ 0,00 · 0,0%',
      'Outras contas a pagar · R$ 650,00 · 10,8%',
    ]);
    expect(t.outside).toBe('Fora dos compromissos: R$ 2.850,00');
    expect(t.outsideNote).toBe(COMMITTED_TEXT.outsideNote);
    expect(t.reference).toBe('R$ 6.000,00 por mês, desde setembro de 2026');
    expect(t.received).toBe('Recebido em outubro: R$ 6.000,00');
    expect(t.annualShare).toBe('Contas do ano: R$ 350,00 por mês se dividir o valor do ano por 12.');
    expect(t.annualShareNote).toBe('Não entra no percentual.');
    expect([t.debt, t.estimated, t.overdueBefore, t.overReference, t.review, t.noReference, t.empty]).toEqual([null, null, null, null, null, null, null]);
    expect(t.how).toBe(
      'Somamos as contas a pagar com vencimento em outubro: o valor pago das que já foram pagas e o valor previsto das que estão em aberto. ' +
        'Gastos anotados sem conta a pagar, como mercado, ficam fora. Por isso este número é diferente de Pago e de Ainda a pagar.',
    );
    expect(committedLine(s)).toEqual({
      kind: 'percentual',
      title: 'Renda comprometida em outubro',
      value: '52,5%',
      caption: null,
      meter: { paidPermille: 417, openPermille: 108, over: false },
      a11yLabel: 'Renda comprometida em outubro: 52,5% da renda de referência. R$ 3.150,00 de R$ 6.000,00. Abre os detalhes.',
    });
    await d.identity(OCT);
  });

  it('novembro (contas já criadas): 63,8%, dívidas 14,2%, inclui R$ 180,00 estimados', async () => {
    const d = await demo();
    const s = await d.committed(NOV);
    expect([s.fixedCents, s.annualCents, s.installmentCents, s.debtCents, s.otherCents, s.committedCents]).toEqual([
      268_000, 0, 85_000, 85_000, 30_000, 383_000,
    ]);
    expect([s.committedPermille, s.fixedPermille, s.installmentPermille, s.debtPermille, s.otherPermille]).toEqual([638, 447, 142, 142, 50]);
    expect([s.outsideCents, s.estimatedOpenCents, s.paidPartCents, s.overdueBeforeCents]).toEqual([217_000, 18_000, 0, 0]);
    const t = committedTexts(s);
    expect(t.highlight).toBe('63,8%');
    expect(t.groups.map((g) => g.line)).toEqual([
      'Gastos fixos · R$ 2.680,00 · 44,7%',
      'Parcelamentos · R$ 850,00 · 14,2%',
      'Outras contas a pagar · R$ 300,00 · 5,0%',
    ]);
    expect(t.debt).toBe('Dívidas: R$ 850,00 · 14,2% da renda de referência.');
    expect(t.estimated).toBe('Inclui R$ 180,00 em valores estimados.');
    expect(t.outside).toBe('Fora dos compromissos: R$ 2.170,00');
    expect(t.received).toBeNull(); // sem o Recebido informado
    // Os percentuais por grupo são arredondados um a um: 44,7 + 14,2 + 5,0 = 63,9, e o total sobre a soma dá 63,8%.
    expect(s.fixedPermille! + s.installmentPermille! + s.otherPermille!).toBe(639);
    await d.identity(NOV);
  });

  it('a referência da demonstração: R$ 6.000,00 desde setembro, renda fixa; conta nova e cenário "retorno" sem nenhuma', async () => {
    const d = await demo();
    const refs = await d.repo.listIncomeReferences(d.ctx);
    expect(refs.map((r) => [r.fromMonth, r.amountCents, r.varies, r.version])).toEqual([[SEP, 600_000, false, 1]]);
    // A referência nunca entra em Recebido.
    expect((await d.totals(SEP))[0]).toBe(600_000);
    const back = await createDemoRepository({ scenario: 'retorno' });
    expect(await back.listIncomeReferences((await back.getSpace())!.personalContextId)).toEqual([]);
    const fresh = new MemoryRepository({ actorId: 'pessoa-nova', displayName: 'Pessoa nova', today: () => DEMO_TODAY });
    const ctx = (await fresh.ensurePersonalSpace('Conta principal')).personalContextId;
    expect(await fresh.listIncomeReferences(ctx)).toEqual([]);
    const empty = summarizeCommitted(await fresh.listCommitments(ctx, OCT), ctx, OCT, DEMO_TODAY, []);
    expect(committedLine(empty)).toEqual({
      kind: 'sem_referencia',
      title: 'Veja quanto da sua renda já está comprometido',
      a11yLabel: 'Veja quanto da sua renda já está comprometido. Abre a renda comprometida.',
    });
  });
});

// ---------------------------------------------------------------------------
// 3. Sequência de aceite B (demonstração, hoje 07/10/2026)
// ---------------------------------------------------------------------------

describe('sequência de aceite B', () => {
  it('pagar, desfazer, anotar contas e gastos, vencida antes, pagar adiantado, trocar e excluir referências', async () => {
    const d = await demo();
    const { repo, ctx, accountId } = d;
    const key = newOperationKey;

    // Base.
    expect(await d.row()).toEqual([315_000, '52,5%', 285_000]);

    // Pagar Internet com 159,90 em 07/10: entra pelo valor pago.
    const internet = await d.find('Internet');
    const pay = await repo.payCommitment(key(), internet.id, internet.version, { accountId, amountCents: 15_990, paidOn: DEMO_TODAY, category: 'Moradia' });
    expect(await d.row()).toEqual([315_990, '52,7%', 284_010]);
    await d.identity();

    // Desfazer esse pagamento.
    await repo.undoCommitmentPayment(key(), internet.id, pay.commitment.version);
    expect(await d.row()).toEqual([315_000, '52,5%', 285_000]);

    // Conta avulsa "Conserto da geladeira", 300,00, vence 28/10.
    await repo.createCommitment(key(), ctx, { description: 'Conserto da geladeira', amountCents: 30_000, dueOn: '2026-10-28', category: null });
    expect(await d.row()).toEqual([345_000, '57,5%', 255_000]);

    // Gasto comum "Mercado" 200,00: não é conta a pagar.
    await repo.createRecord(key(), ctx, 'despesa', { accountId, amountCents: 20_000, occurredOn: DEMO_TODAY, description: 'Mercado', category: 'Mercado' });
    expect(await d.row()).toEqual([345_000, '57,5%', 255_000]);
    expect((await d.totals())[1]).toBe(410_000);

    // Gás 40,00 vencido em 28/09: linha à parte em outubro; conta em setembro (0,7% com a referência de setembro).
    await repo.createCommitment(key(), ctx, { description: 'Gás', amountCents: 4_000, dueOn: '2026-09-28', category: 'Moradia' });
    expect(await d.row()).toEqual([345_000, '57,5%', 255_000]);
    const oct = await d.committed();
    expect(oct.overdueBeforeCents).toBe(4_000);
    expect(oct.overdueBefore.map((c) => c.description)).toEqual(['Gás']);
    expect(committedTexts(oct).overdueBefore).toBe(
      'Além disso, R$ 40,00 de contas vencidas antes de outubro continuam em aberto. Elas contam no mês do vencimento.',
    );
    expect(await d.row(SEP)).toEqual([4_000, '0,7%', 596_000]);
    expect((await d.committed(SEP)).overdueBeforeCents).toBe(0); // só no mês de hoje
    await d.identity();

    // Pagar hoje o Aluguel de novembro: muda Pago de outubro (4.100 → 6.600), nenhum comprometido.
    const nov = await d.find('Aluguel', NOV);
    await repo.payCommitment(key(), nov.id, nov.version, { accountId, amountCents: 250_000, paidOn: DEMO_TODAY, category: 'Moradia' });
    expect((await d.totals())[1]).toBe(660_000);
    expect(await d.row()).toEqual([345_000, '57,5%', 255_000]);
    expect(await d.row(NOV)).toEqual([383_000, '63,8%', 217_000]);
    expect((await d.committed(NOV)).paidPartCents).toBe(250_000);
    await d.identity(NOV);

    // Referência 5.000,00 a partir de outubro: outubro 69,0%, novembro 76,6%, setembro continua 0,7%.
    const octRef = await repo.setIncomeReference(key(), ctx, OCT, 0, 500_000, false);
    expect(await d.row()).toEqual([345_000, '69,0%', 155_000]);
    expect(await d.row(NOV)).toEqual([383_000, '76,6%', 117_000]);
    expect(await d.row(SEP)).toEqual([4_000, '0,7%', 596_000]);

    // Excluir a referência de outubro: volta a de setembro.
    await repo.deleteIncomeReference(key(), octRef.id, octRef.version);
    expect(await d.row()).toEqual([345_000, '57,5%', 255_000]);

    // Excluir também a de setembro: só valores em reais.
    const [sep] = await repo.listIncomeReferences(ctx);
    await repo.deleteIncomeReference(key(), sep!.id, sep!.version);
    expect(await d.row()).toEqual([345_000, null, null]);
    const s = await d.committed();
    expect([s.fixedPermille, s.otherPermille, s.debtPermille, s.meter, s.overReference]).toEqual([null, null, null, null, false]);
    const t = committedTexts(s, 600_000);
    expect(t.noReference).toEqual({
      label: 'Contas de outubro',
      amount: 'R$ 3.450,00',
      hint: 'Para ver quanto isso representa da sua renda, informe sua renda de referência.',
      button: 'Informar renda de referência',
    });
    expect([t.highlight, t.outside, t.reference, t.received]).toEqual([null, null, null, null]);
    expect(t.groups.map((g) => g.line)).toEqual(['Gastos fixos · R$ 2.500,00', 'Parcelamentos · R$ 0,00', 'Outras contas a pagar · R$ 950,00']);
    expect(committedLine(s).kind).toBe('sem_referencia');

    // Recebido, Pago e Ainda a pagar seguem as regras próprias (a referência nunca entra em Recebido).
    // Ainda a pagar de outubro: Internet 150,00 + Condomínio 500,00 + Conserto 300,00 + Gás 40,00 (vencido antes).
    expect(await d.totals()).toEqual([600_000, 660_000, -60_000, 99_000]);
    repo.checkInvariants();
  });
});

// ---------------------------------------------------------------------------
// 4. Casos de borda
// ---------------------------------------------------------------------------

describe('casos de borda', () => {
  function fresh(start = '2026-10-07') {
    let today = start;
    const repo = new MemoryRepository({ actorId: 'pessoa-teste', displayName: 'Pessoa teste', today: () => today });
    return {
      repo,
      setToday: (d: string) => {
        today = d;
      },
      today: () => today,
    };
  }

  it('pago em 31/10 o que vence em 01/11: Pago de outubro e comprometido de novembro', async () => {
    const f = fresh('2026-10-31');
    const space = await f.repo.ensurePersonalSpace('Conta principal');
    const ctx = space.personalContextId;
    const accountId = space.accounts[0]!.id;
    await f.repo.setIncomeReference(newOperationKey(), ctx, OCT, 0, 600_000, false);
    const c = await f.repo.createCommitment(newOperationKey(), ctx, { description: 'Escola', amountCents: 120_000, dueOn: '2026-11-01', category: 'Educação' });
    await f.repo.payCommitment(newOperationKey(), c.commitment.id, c.commitment.version, { accountId, amountCents: 120_000, paidOn: '2026-10-31', category: 'Educação' });
    expect(summarizeMonth(await f.repo.listRecords(ctx, OCT), ctx, OCT).paidCents).toBe(120_000);
    const refs = await f.repo.listIncomeReferences(ctx);
    const oct = summarizeCommitted(await f.repo.listCommitments(ctx, OCT), ctx, OCT, f.today(), refs);
    const nov = summarizeCommitted(await f.repo.listCommitments(ctx, NOV), ctx, NOV, f.today(), refs);
    expect([oct.committedCents, oct.count, nov.committedCents, nov.paidPartCents]).toEqual([0, 0, 120_000, 120_000]);
  });

  it('paga em outro mês entra no mês do vencimento, pelo valor pago', async () => {
    const f = fresh('2026-10-07');
    const space = await f.repo.ensurePersonalSpace('Conta principal');
    const ctx = space.personalContextId;
    const accountId = space.accounts[0]!.id;
    const c = await f.repo.createCommitment(newOperationKey(), ctx, { description: 'Internet', amountCents: 15_000, dueOn: '2026-10-15', category: null });
    f.setToday('2026-11-02');
    await f.repo.payCommitment(newOperationKey(), c.commitment.id, c.commitment.version, { accountId, amountCents: 16_200, paidOn: '2026-11-02', category: null });
    const oct = summarizeCommitted(await f.repo.listCommitments(ctx, OCT), ctx, OCT, f.today(), []);
    const nov = summarizeCommitted(await f.repo.listCommitments(ctx, NOV), ctx, NOV, f.today(), []);
    expect([oct.committedCents, oct.paidPartCents, nov.committedCents]).toEqual([16_200, 16_200, 0]);
    expect(summarizeMonth(await f.repo.listRecords(ctx, NOV), ctx, NOV).paidCents).toBe(16_200);
  });

  it('gasto anotado sem conta a pagar fica fora; mês sem contas mostra 0,0% e a frase própria', async () => {
    const f = fresh();
    const space = await f.repo.ensurePersonalSpace('Conta principal');
    const ctx = space.personalContextId;
    await f.repo.createRecord(newOperationKey(), ctx, 'despesa', {
      accountId: space.accounts[0]!.id,
      amountCents: 250_000,
      occurredOn: '2026-10-05',
      description: 'Aluguel',
      category: 'Moradia',
    });
    await f.repo.setIncomeReference(newOperationKey(), ctx, OCT, 0, 600_000, false);
    const s = summarizeCommitted(await f.repo.listCommitments(ctx, OCT), ctx, OCT, f.today(), await f.repo.listIncomeReferences(ctx));
    expect([s.committedCents, s.committedPermille, s.count, s.outsideCents]).toEqual([0, 0, 0, 600_000]);
    expect(committedLine(s)).toEqual({
      kind: 'percentual',
      title: 'Renda comprometida em outubro',
      value: '0,0%',
      caption: 'Nenhuma conta a pagar com vencimento em outubro.',
      meter: { paidPermille: 0, openPermille: 0, over: false },
      a11yLabel:
        'Renda comprometida em outubro: 0,0% da renda de referência. Nenhuma conta a pagar com vencimento em outubro. Abre os detalhes.',
    });
    const t = committedTexts(s);
    expect(t.empty).toBe('Nenhuma conta a pagar com vencimento em outubro.');
    expect(t.groups.map((g) => g.percentText)).toEqual(['0,0%', '0,0%', '0,0%']);
  });

  it('acima de 100%: valor real, frase neutra pela diferença em centavos; igual à referência não passa', () => {
    const ref6000 = [income(SEP, 600_000)];
    const over = summarizeCommitted([bill('2026-10-05', { amountCents: 672_000 })], 'ctx', OCT, DEMO_TODAY, ref6000);
    expect([over.committedPermille, over.outsideCents, over.overReference]).toEqual([1120, -72_000, true]);
    const t = committedTexts(over);
    expect(t.highlight).toBe('112,0%');
    expect(t.overReference).toBe('As contas do mês passam a renda de referência em R$ 720,00.');
    expect([t.outside, t.outsideNote]).toEqual([null, null]);
    expect(over.meter).toEqual({ paidPermille: 0, openPermille: 1000, over: true });
    // Um centavo acima: o percentual arredondado é 100,0%, mas a frase usa os centavos.
    const cent = summarizeCommitted([bill('2026-10-05', { amountCents: 600_001 })], 'ctx', OCT, DEMO_TODAY, ref6000);
    expect([formatPermille(cent.committedPermille!, cent.committedCents), cent.overReference]).toEqual(['100,0%', true]);
    expect(committedTexts(cent).overReference).toBe('As contas do mês passam a renda de referência em R$ 0,01.');
    const equal = summarizeCommitted([bill('2026-10-05', { amountCents: 600_000 })], 'ctx', OCT, DEMO_TODAY, ref6000);
    expect([equal.overReference, equal.outsideCents, committedTexts(equal).outside]).toEqual([false, 0, 'Fora dos compromissos: R$ 0,00']);
  });

  it('outro contexto, contas de outros meses e referências de outro contexto ficam fora', () => {
    const list = [
      bill('2026-10-05', { amountCents: 100_000 }),
      bill('2026-10-06', { amountCents: 50_000, contextId: 'outro' }),
      bill('2026-11-05', { amountCents: 70_000 }),
      bill('2026-09-30', { amountCents: 9_000 }),
    ];
    const refs = [income(SEP, 600_000), income(OCT, 100_000, { contextId: 'outro' })];
    const s = summarizeCommitted(list, 'ctx', OCT, DEMO_TODAY, refs);
    expect([s.committedCents, s.count, s.referenceCents, s.overdueBeforeCents]).toEqual([100_000, 1, 600_000, 9_000]);
    // Fora do mês de hoje, as vencidas antes não aparecem.
    expect(summarizeCommitted(list, 'ctx', OCT, '2026-11-03', refs).overdueBeforeCents).toBe(0);
  });

  it('contas do ano formam um grupo próprio, não são dívida, e a identidade continua valendo', () => {
    const jan = [
      bill('2027-01-05', { amountCents: 250_000, series: ref('mensal') }),
      bill('2027-01-12', { amountCents: 18_000, amountIsEstimate: true, series: ref('mensal', 'conta', 4) }),
      bill('2027-01-10', { amountCents: 85_000, series: ref('parcelada', 'financiamento', 15) }),
      bill('2027-01-20', { amountCents: 240_000, amountIsEstimate: true, series: ref('anual') }),
    ];
    const s = summarizeCommitted(jan, 'ctx', '2027-01', '2027-01-03', [income(SEP, 600_000)]);
    expect([s.fixedCents, s.annualCents, s.installmentCents, s.debtCents, s.committedCents]).toEqual([268_000, 240_000, 85_000, 85_000, 593_000]);
    expect([s.committedPermille, s.annualPermille, s.debtPermille]).toEqual([988, 400, 142]);
    expect(s.estimatedOpenCents).toBe(258_000);
    const t = committedTexts(s);
    expect(t.groups.map((g) => g.line)).toEqual([
      'Gastos fixos · R$ 2.680,00 · 44,7%',
      'Contas do ano · R$ 2.400,00 · 40,0%',
      'Parcelamentos · R$ 850,00 · 14,2%',
      'Outras contas a pagar · R$ 0,00 · 0,0%',
    ]);
    expect(t.debt).toBe('Dívidas: R$ 850,00 · 14,2% da renda de referência.');
    expect(s.committedCents).toBe(summarizeToPay(jan, 'ctx', '2027-01', '2027-01-03').dueInMonthCents);
  });

  it('renda que varia: referência de um mês anterior pede revisão, sem bloquear', () => {
    const refs = [income(SEP, 600_000, { varies: true })];
    const oct = summarizeCommitted([], 'ctx', OCT, DEMO_TODAY, refs);
    expect([oct.needsReview, committedTexts(oct).review]).toEqual([true, 'Referência de setembro. Revise para outubro.']);
    expect(oct.committedPermille).toBe(0);
    expect(summarizeCommitted([], 'ctx', SEP, DEMO_TODAY, refs).needsReview).toBe(false);
    expect(summarizeCommitted([], 'ctx', OCT, DEMO_TODAY, [income(SEP, 600_000)]).needsReview).toBe(false);
    const jan = summarizeCommitted([], 'ctx', '2027-01', '2027-01-04', [income('2026-12', 600_000, { varies: true })]);
    expect(committedTexts(jan).review).toBe('Referência de dezembro de 2026. Revise para janeiro de 2027.');
  });
});

// ---------------------------------------------------------------------------
// 5. Próximos meses e marcos
// ---------------------------------------------------------------------------

describe('próximos meses (previsão) e "O que muda"', () => {
  async function upcoming(d: Awaited<ReturnType<typeof demo>>, month = OCT) {
    const months = upcomingCommittedMonths(month);
    const dueList = await d.repo.listCommitmentsDueBetween(d.ctx, months[0]!, months[months.length - 1]!);
    return projectCommitted(await d.repo.listSeries(d.ctx), dueList, await d.repo.listIncomeReferences(d.ctx), months, DEMO_TODAY);
  }

  it('demonstração: novembro 63,8%, dezembro 58,8%, janeiro 98,8% (contas do ano 40,0%), fevereiro 61,8% (3,0%)', async () => {
    const d = await demo();
    expect(upcomingCommittedMonths(OCT)).toEqual(['2026-11', '2026-12', '2027-01', '2027-02', '2027-03', '2027-04']);
    const p = await upcoming(d);
    expect(p.months.map((m) => [m.month, m.committedCents, m.committedPermille])).toEqual([
      ['2026-11', 383_000, 638],
      ['2026-12', 353_000, 588],
      ['2027-01', 593_000, 988],
      ['2027-02', 371_000, 618],
      ['2027-03', 371_000, 618],
      ['2027-04', 371_000, 618],
    ]);
    const [nov, dec, jan, feb] = p.months;
    expect([nov!.fixedCents, nov!.installmentCents, nov!.otherCents, nov!.plannedCents, nov!.estimatedCents]).toEqual([268_000, 85_000, 30_000, 0, 18_000]);
    expect([dec!.fixedCents, dec!.installmentCents, dec!.otherCents, dec!.plannedCents, dec!.estimatedCents]).toEqual([268_000, 85_000, 0, 353_000, 18_000]);
    expect([jan!.annualCents, jan!.annualPermille, jan!.debtCents, jan!.debtPermille]).toEqual([240_000, 400, 85_000, 142]);
    expect([feb!.annualCents, feb!.annualPermille]).toEqual([18_000, 30]);
    expect(nov!.text).toBe('Novembro de 2026 · R$ 3.830,00 · 63,8%');
    expect(dec!.text).toBe('Dezembro de 2026 · R$ 3.530,00 · 58,8%');
    expect(dec!.a11yLabel).toBe(
      'Dezembro de 2026, previsto: R$ 3.530,00 em contas, 58,8% da renda de referência, inclui R$ 180,00 em valores estimados.',
    );
    expect(jan!.meter).toEqual({ paidPermille: 0, openPermille: 988, over: false });
    expect(p.milestones.map((m) => m.text)).toEqual([
      'Janeiro de 2027: IPVA, cerca de R$ 2.400,00.',
      'Fevereiro de 2027: IPTU, 10 parcelas de cerca de R$ 180,00.',
      'Outubro de 2029: última parcela de Financiamento do carro (R$ 850,00).',
    ]);
    expect(p.milestones.map((m) => m.kind)).toEqual(['conta_do_ano', 'conta_do_ano', 'ultima_parcela']);
    // Novembro previsto = renda comprometida de novembro (mesma regra).
    expect(nov!.committedCents).toBe((await d.committed(NOV)).committedCents);
  });

  it('pagas antes do mês entram pelo valor pago; excluídas só neste mês saem da previsão', async () => {
    const d = await demo();
    const nov = await d.find('Aluguel', NOV);
    await d.repo.payCommitment(newOperationKey(), nov.id, nov.version, { accountId: d.accountId, amountCents: 249_000, paidOn: DEMO_TODAY, category: 'Moradia' });
    const luz = await d.find('Luz', NOV);
    await d.repo.deleteCommitment(newOperationKey(), luz.id, luz.version); // excluir só a Luz de novembro
    const p = await upcoming(d);
    const [n, dec] = p.months;
    expect([n!.committedCents, n!.paidPartCents, n!.estimatedCents]).toEqual([249_000 + 85_000 + 30_000, 249_000, 0]);
    // Dezembro continua com a Luz prevista (número 2); novembro (número 1) nunca volta.
    expect([dec!.committedCents, dec!.estimatedCents]).toEqual([353_000, 18_000]);
  });

  it('série com término, novo valor programado e números pulados no futuro', async () => {
    const f = new MemoryRepository({ actorId: 'pessoa-teste', displayName: 'Pessoa teste', today: () => '2026-10-07' });
    const ctx = (await f.ensurePersonalSpace('Conta principal')).personalContextId;
    const escola = await f.createSeries(newOperationKey(), ctx, {
      kind: 'mensal',
      nature: 'conta',
      description: 'Escola',
      category: 'Educação',
      amountCents: 120_000,
      amountMode: 'fixo',
      dueDay: 10,
      firstDueMonth: '2026-10',
      firstNumber: 1,
      installmentTotal: null,
      partsPerYear: null,
      lastMonth: '2027-02',
    });
    // Reajuste programado a partir de janeiro (número 4, ainda não criado).
    await f.updateSeriesFrom(newOperationKey(), escola.series.id, escola.series.version, 4, [], {
      nature: 'conta',
      description: 'Escola',
      category: 'Educação',
      amountCents: 126_000,
      amountMode: 'fixo',
      dueDay: 10,
    });
    const series = await f.listSeries(ctx);
    const months = upcomingCommittedMonths(OCT);
    const dueList = await f.listCommitmentsDueBetween(ctx, months[0]!, months[5]!);
    const p = projectCommitted(series, dueList, [], months, '2026-10-07');
    expect(p.months.map((m) => m.committedCents)).toEqual([120_000, 120_000, 126_000, 126_000, 0, 0]);
    expect(p.months.map((m) => m.text)).toEqual([
      'Novembro de 2026 · R$ 1.200,00',
      'Dezembro de 2026 · R$ 1.200,00',
      'Janeiro de 2027 · R$ 1.260,00',
      'Fevereiro de 2027 · R$ 1.260,00',
      'Março de 2027 · R$ 0,00',
      'Abril de 2027 · R$ 0,00',
    ]);
    expect(p.milestones.map((m) => m.text)).toEqual(['Janeiro de 2027: Escola passa a R$ 1.260,00.', 'Fevereiro de 2027: última conta de Escola (R$ 1.260,00).']);
    // Números pulados (excluídos só neste mês) não entram na previsão.
    const skipped = series.map((s) => ({ ...s, skippedNumbers: [3] }));
    expect(projectCommitted(skipped, dueList, [], months, '2026-10-07').months.map((m) => m.committedCents)).toEqual([120_000, 0, 126_000, 126_000, 0, 0]);
    // O mês de hoje recebe previsão quando a conta ainda não foi criada (antes da geração ao abrir o app).
    expect(projectCommitted(series, [], [], [OCT], '2026-10-07').months.map((m) => [m.committedCents, m.plannedCents])).toEqual([[120_000, 120_000]]);
    // Meses antes do mês de hoje não recebem previsão.
    const past = projectCommitted(series, [], [], ['2026-08', '2026-09'], '2026-10-07');
    expect(past.months.map((m) => m.committedCents)).toEqual([0, 0]);
    expect(projectCommitted(series, [], [], [], '2026-10-07')).toEqual({ months: [], milestones: [] });
  });
});

// ---------------------------------------------------------------------------
// 6. Contas do ano ÷ 12 (P-019), sugestão de referência e previsão dos pagamentos
// ---------------------------------------------------------------------------

describe('contas do ano por mês (P-019), fora do percentual', () => {
  it('IPVA 2.512,30 + IPTU 10 × 180,00 + Matrícula 1.200,00 = 5.512,30 por ano → R$ 459,36 por mês (para cima)', async () => {
    const f = new MemoryRepository({ actorId: 'pessoa-teste', displayName: 'Pessoa teste', today: () => '2026-10-07' });
    const ctx = (await f.ensurePersonalSpace('Conta principal')).personalContextId;
    const annual = (description: string, amountCents: number, partsPerYear: number, firstDueMonth: string, amountMode: 'fixo' | 'variavel') =>
      f.createSeries(newOperationKey(), ctx, {
        kind: 'anual',
        nature: 'conta',
        description,
        category: null,
        amountCents,
        amountMode,
        dueDay: 10,
        firstDueMonth,
        firstNumber: 1,
        installmentTotal: null,
        partsPerYear,
        lastMonth: null,
      });
    await annual('IPVA', 251_230, 1, '2027-01', 'variavel');
    await annual('IPTU', 18_000, 10, '2027-02', 'variavel');
    await annual('Matrícula', 120_000, 1, '2026-12', 'fixo');
    const series = await f.listSeries(ctx);
    expect(annualShare(series, '2026-10-07')).toEqual({ yearlyCents: 551_230, monthlyCents: 45_936, estimated: true });
    expect(45_936 * 12).toBeGreaterThanOrEqual(551_230);
    expect(45_935 * 12).toBeLessThan(551_230);
    expect(annualShare([], '2026-10-07')).toBeNull();
    // Não muda o comprometido nem o percentual.
    const withSeries = summarizeCommitted([], ctx, OCT, '2026-10-07', [income(SEP, 600_000, { contextId: ctx })], series);
    expect([withSeries.committedCents, withSeries.committedPermille, withSeries.annualShare!.monthlyCents]).toEqual([0, 0, 45_936]);
    expect(committedTexts(withSeries).annualShare).toBe('Contas do ano: R$ 459,36 por mês se dividir o valor do ano por 12.');
  });
});

describe('sugestão de renda de referência', () => {
  it('demonstração: R$ 6.000,00 com base em setembro', async () => {
    const d = await demo();
    const records = (await Promise.all(['2026-07', '2026-08', SEP, OCT].map((m) => d.repo.listRecords(d.ctx, m)))).flat();
    const s = suggestReference(records, OCT);
    expect(s).toEqual({ amountCents: 600_000, months: [SEP] });
    expect(COMMITTED_TEXT.reference.suggestion(s!.amountCents, s!.months)).toBe(
      'Nos meses com recebimentos anotados, a média foi R$ 6.000,00 (setembro). Reembolsos ficam fora.',
    );
    expect(COMMITTED_TEXT.reference.useSuggestion(s!.amountCents)).toBe('Usar R$ 6.000,00');
  });

  it('sem reembolsos (sem caixa nem espaços), meses vazios fora, metade para cima; nada → null', () => {
    const records = [
      receipt('2026-07-05', 500_000),
      receipt('2026-07-20', 30_000, ' reembolso '),
      receipt('2026-08-20', 12_000, 'Reembolso'), // agosto só com reembolso: fora
      receipt('2026-09-01', 600_000),
      receipt('2026-09-15', 50_001, 'Renda extra'),
      receipt('2026-09-16', 9_999, null), // sem categoria entra
      receipt('2026-09-17', 99_999, 'Mercado', 'despesa'), // gasto: fora
      receipt('2026-10-01', 900_000), // mês de hoje: fora
      receipt('2026-06-01', 900_000), // antes dos 3 meses fechados: fora
    ];
    // Julho 5.000,00; setembro 6.600,00 → média 5.800,00.
    expect(suggestReference(records, OCT)).toEqual({ amountCents: 580_000, months: ['2026-07', SEP] });
    // 5.000,00 e 6.000,01 → 5.500,005 → R$ 5.500,01 (metade para cima).
    expect(suggestReference([receipt('2026-07-05', 500_000), receipt('2026-09-01', 600_001)], OCT)!.amountCents).toBe(550_001);
    expect(suggestReference([receipt('2026-08-20', 12_000, 'Reembolso')], OCT)).toBeNull();
    expect(suggestReference([], OCT)).toBeNull();
    expect(COMMITTED_TEXT.reference.suggestion(580_000, ['2026-07', '2026-08', SEP])).toBe(
      'Nos meses com recebimentos anotados, a média foi R$ 5.800,00 (julho, agosto e setembro). Reembolsos ficam fora.',
    );
    expect(COMMITTED_TEXT.reference.suggestion(580_000, ['2026-12', '2027-01'])).toContain('(dezembro de 2026 e janeiro de 2027)');
  });

  it('formulário: meses aceitos, chips e validação na ordem do banco', () => {
    expect(referenceMonthBounds(DEMO_TODAY)).toEqual({ min: '2024-10', max: '2027-10' });
    expect(referenceMonthError('2024-10', DEMO_TODAY)).toBeNull();
    expect(referenceMonthError('2024-09', DEMO_TODAY)).toBe('referencia_fora_do_intervalo');
    expect(referenceMonthError('2027-10', DEMO_TODAY)).toBeNull();
    expect(referenceMonthError('2027-11', DEMO_TODAY)).toBe('referencia_fora_do_intervalo');
    expect(referenceMonthError('2026-13', DEMO_TODAY)).toBe('mes_invalido');
    expect(referenceMonthChoices(DEMO_TODAY)).toEqual([
      { month: SEP, label: 'Setembro', isDefault: false },
      { month: OCT, label: 'Outubro', isDefault: true },
      { month: NOV, label: 'Novembro', isDefault: false },
    ]);
    expect(referenceMonthChoices('2026-12-15').map((c) => c.label)).toEqual(['Novembro', 'Dezembro', 'Janeiro de 2027']);
    expect(validateIncomeReferenceDraft({ amountText: '6.000,00', fromMonth: OCT, varies: true }, DEMO_TODAY)).toEqual({
      ok: true,
      fromMonth: OCT,
      amountCents: 600_000,
      varies: true,
    });
    expect(validateIncomeReferenceDraft({ amountText: '', fromMonth: '2024-01', varies: false }, DEMO_TODAY)).toEqual({
      ok: false,
      errors: { fromMonth: 'Escolha um mês entre dois anos atrás e os próximos 12 meses.', amountText: 'Informe um valor maior que zero, como 6.000,00.' },
    });
    expect(validateIncomeReferenceDraft({ amountText: '10.000.000,00', fromMonth: OCT, varies: false }, DEMO_TODAY)).toEqual({
      ok: false,
      errors: { amountText: INCOME_REFERENCE_ERROR_TEXT.valor_acima_do_limite },
    });
    expect(validateIncomeReferenceDraft({ amountText: '0,00', fromMonth: OCT, varies: false }, DEMO_TODAY).ok).toBe(false);
  });
});

describe('previsão dos pagamentos do mês (só em /a-pagar e só no mês de hoje)', () => {
  it('demonstração: R$ 3.900,00 pagos + R$ 650,00 em aberto = R$ 4.550,00', async () => {
    const d = await demo();
    const paidCents = summarizeMonth(await d.repo.listRecords(d.ctx, OCT), d.ctx, OCT).paidCents;
    const toPay = summarizeToPay(await d.repo.listCommitments(d.ctx, OCT), d.ctx, OCT, DEMO_TODAY);
    expect(paymentsForecast(paidCents, toPay)).toEqual({
      month: OCT,
      totalCents: 455_000,
      estimatedCents: 0,
      text: 'Se pagar tudo o que está em aberto, os pagamentos de outubro chegam a R$ 4.550,00.',
      estimatedText: null,
    });
    // Outro mês: nunca.
    expect(paymentsForecast(0, summarizeToPay(await d.repo.listCommitments(d.ctx, NOV), d.ctx, NOV, DEMO_TODAY))).toBeNull();
  });

  it('inclui vencidas de meses anteriores e diz quanto é estimado; nada em aberto → null', () => {
    const list = [
      bill('2026-10-20', { amountCents: 50_000 }), // vencida em outubro, paga agora entra em Pago de novembro
      bill('2026-11-05', { amountCents: 250_000 }),
      bill('2026-11-12', { amountCents: 18_000, amountIsEstimate: true }),
      bill('2026-12-05', { amountCents: 250_000 }), // depois do mês: fora
      bill('2026-11-01', { amountCents: 30_000, ...paid(30_000, '2026-11-01') }), // já paga: já está em Pago
    ];
    const toPay = summarizeToPay(list, 'ctx', NOV, '2026-11-03');
    const f = paymentsForecast(100_000, toPay)!;
    expect([f.totalCents, f.estimatedCents]).toEqual([418_000, 18_000]);
    expect(f.text).toBe('Se pagar tudo o que está em aberto, os pagamentos de novembro chegam a R$ 4.180,00.');
    expect(f.estimatedText).toBe('Inclui R$ 180,00 estimados.');
    expect(paymentsForecast(100_000, summarizeToPay([list[4]!], 'ctx', NOV, '2026-11-03'))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 7. MemoryRepository: set_income_reference e delete_income_reference
// ---------------------------------------------------------------------------

describe('MemoryRepository: renda de referência com as regras do banco', () => {
  async function setup() {
    let today = '2026-10-07';
    const repo = new MemoryRepository({ actorId: 'pessoa-teste', displayName: 'Pessoa teste', today: () => today });
    const ctx = (await repo.ensurePersonalSpace('Conta principal')).personalContextId;
    return {
      repo,
      ctx,
      setToday: (d: string) => {
        today = d;
      },
    };
  }

  it('criar com versão 0, conflito no mesmo mês, alterar com a versão atual; versão nula ou errada recusada', async () => {
    const { repo, ctx } = await setup();
    expect(await repo.listIncomeReferences(ctx)).toEqual([]);
    const created = await repo.setIncomeReference('k1', ctx, SEP, 0, 600_000, false);
    expect([created.fromMonth, created.amountCents, created.varies, created.version, created.contextId, created.createdBy]).toEqual([
      SEP, 600_000, false, 1, ctx, 'pessoa-teste',
    ]);
    await expectCode(repo.setIncomeReference('k2', ctx, SEP, 0, 650_000, false), 'versao_desatualizada');
    const updated = await repo.setIncomeReference('k3', ctx, SEP, 1, 650_000, true);
    expect([updated.id, updated.amountCents, updated.varies, updated.version]).toEqual([created.id, 650_000, true, 2]);
    await expectCode(repo.setIncomeReference('k4', ctx, SEP, 1, 700_000, true), 'versao_desatualizada');
    await expectCode(repo.setIncomeReference('k5', ctx, SEP, null as unknown as number, 700_000, true), 'versao_desatualizada');
    await expectCode(repo.setIncomeReference('k6', ctx, SEP, -1, 700_000, true), 'versao_desatualizada');
    await expectCode(repo.setIncomeReference('k7', ctx, OCT, 1, 700_000, true), 'versao_desatualizada'); // nenhuma viva em outubro
    const oct = await repo.setIncomeReference('k8', ctx, OCT, 0, 500_000, false);
    expect((await repo.listIncomeReferences(ctx)).map((r) => [r.fromMonth, r.version])).toEqual([
      [SEP, 2],
      [OCT, 1],
    ]);
    expect(oct.id).not.toBe(created.id);
    repo.checkInvariants();
  });

  it('mês (mes_invalido e referencia_fora_do_intervalo), valor, tipo e permissão, na ordem do banco', async () => {
    const { repo, ctx } = await setup();
    const key = newOperationKey;
    expect((await repo.setIncomeReference(key(), ctx, '2024-10', 0, 1, false)).fromMonth).toBe('2024-10');
    expect((await repo.setIncomeReference(key(), ctx, '2027-10', 0, 999_999_999, false)).amountCents).toBe(999_999_999);
    await expectCode(repo.setIncomeReference(key(), ctx, '2024-09', 0, 600_000, false), 'referencia_fora_do_intervalo');
    await expectCode(repo.setIncomeReference(key(), ctx, '2027-11', 0, 600_000, false), 'referencia_fora_do_intervalo');
    await expectCode(repo.setIncomeReference(key(), ctx, '2026-13', 0, 600_000, false), 'mes_invalido');
    await expectCode(repo.setIncomeReference(key(), ctx, '2026-10-01', 0, 600_000, false), 'mes_invalido');
    await expectCode(repo.setIncomeReference(key(), ctx, OCT, 0, 0, false), 'valor_invalido');
    await expectCode(repo.setIncomeReference(key(), ctx, OCT, 0, 1.5, false), 'valor_invalido');
    await expectCode(repo.setIncomeReference(key(), ctx, OCT, 0, 1_000_000_000, false), 'valor_acima_do_limite');
    await expectCode(repo.setIncomeReference(key(), ctx, OCT, 0, 600_000, null as unknown as boolean), 'tipo_invalido');
    // Ordem: permissão antes do mês; mês antes do valor; valor antes da versão.
    await expectCode(repo.setIncomeReference(key(), 'ctx-de-outra-pessoa', '2020-01', 0, 0, false), 'sem_permissao');
    await expectCode(repo.setIncomeReference(key(), ctx, '2020-01', 0, 0, false), 'referencia_fora_do_intervalo');
    await expectCode(repo.setIncomeReference(key(), ctx, OCT, -5, 0, false), 'valor_invalido');
    // A faixa acompanha o dia de hoje.
    expect(await repo.listIncomeReferences('ctx-de-outra-pessoa')).toEqual([]);
    expect((await repo.listIncomeReferences(ctx)).length).toBe(2);
  });

  it('repetição: mesma chave e conteúdo devolve o estado atual; outro conteúdo ou outra ação → chave_reutilizada', async () => {
    const { repo, ctx } = await setup();
    const a = await repo.setIncomeReference('mesma', ctx, SEP, 0, 600_000, false);
    const again = await repo.setIncomeReference('mesma', ctx, SEP, 0, 600_000, false);
    expect(again).toEqual(a);
    expect((await repo.listIncomeReferences(ctx)).length).toBe(1);
    await expectCode(repo.setIncomeReference('mesma', ctx, SEP, 0, 600_001, false), 'chave_reutilizada');
    await expectCode(repo.setIncomeReference('mesma', ctx, SEP, 0, 600_000, true), 'chave_reutilizada');
    await expectCode(repo.deleteIncomeReference('mesma', a.id, 1), 'chave_reutilizada');
    await expectCode(repo.createCommitment('mesma', ctx, { description: 'Luz', amountCents: 100, dueOn: '2026-10-12', category: null }), 'chave_reutilizada');
    // Resposta perdida depois de gravar: repetir a mesma chave não grava de novo.
    repo.failNextWrite = 'depois';
    await expectCode(repo.setIncomeReference('perdida', ctx, OCT, 0, 500_000, false), 'rede');
    const retried = await repo.setIncomeReference('perdida', ctx, OCT, 0, 500_000, false);
    expect([retried.fromMonth, retried.version]).toEqual([OCT, 1]);
    // Falha antes de gravar: nada muda.
    repo.failNextWrite = 'antes';
    await expectCode(repo.setIncomeReference('antes', ctx, NOV, 0, 400_000, false), 'rede');
    expect((await repo.listIncomeReferences(ctx)).map((r) => r.fromMonth)).toEqual([SEP, OCT]);
  });

  it('excluir: versão conferida, exclusão lógica, repetição; a anterior volta a valer; recriar no mesmo mês', async () => {
    const { repo, ctx } = await setup();
    const sep = await repo.setIncomeReference(newOperationKey(), ctx, SEP, 0, 600_000, false);
    const oct = await repo.setIncomeReference(newOperationKey(), ctx, OCT, 0, 500_000, false);
    await expectCode(repo.deleteIncomeReference(newOperationKey(), oct.id, 2), 'versao_desatualizada');
    const deleted = await repo.deleteIncomeReference('del', oct.id, 1);
    expect([deleted.id, deleted.version]).toEqual([oct.id, 2]);
    expect(await repo.deleteIncomeReference('del', oct.id, 1)).toEqual(deleted);
    await expectCode(repo.deleteIncomeReference(newOperationKey(), oct.id, 2), 'nao_encontrado');
    await expectCode(repo.deleteIncomeReference(newOperationKey(), 'ref-inexistente', 1), 'nao_encontrado');
    const refs = await repo.listIncomeReferences(ctx);
    expect(refs.map((r) => r.id)).toEqual([sep.id]);
    expect(referenceFor(refs, OCT)!.amountCents).toBe(600_000);
    const again = await repo.setIncomeReference(newOperationKey(), ctx, OCT, 0, 550_000, false);
    expect([again.version, again.id === oct.id]).toEqual([1, false]);
    repo.checkInvariants();
  });

  it('conta como anotação na atividade (como as demais escritas); invariantes e campos imutáveis', async () => {
    const { repo, ctx, setToday } = await setup();
    await repo.setIncomeReference(newOperationKey(), ctx, SEP, 0, 600_000, false);
    expect((await repo.getReturnReviewState(ctx)).activity!.lastWriteOn).toBe('2026-10-07');
    setToday('2026-10-09');
    const [r] = await repo.listIncomeReferences(ctx);
    await repo.deleteIncomeReference(newOperationKey(), r!.id, r!.version);
    expect((await repo.getReturnReviewState(ctx)).activity!.lastWriteOn).toBe('2026-10-09');

    const internals = repo as unknown as {
      incomeRefs: Map<string, IncomeReference & { deletedAt?: string }>;
      checkTransitions(before: Record<string, Map<string, unknown>>): void;
    };
    const live = await repo.setIncomeReference(newOperationKey(), ctx, OCT, 0, 500_000, false);
    // Duas vivas no mesmo mês: recusado.
    internals.incomeRefs.set('ref-dup', { ...live, id: 'ref-dup' });
    expect(() => repo.checkInvariants()).toThrow('referencia_inconsistente');
    internals.incomeRefs.delete('ref-dup');
    repo.checkInvariants();
    // Mudar o mês de uma referência existente: campo imutável.
    const before = { commitments: new Map(), seriesById: new Map(), terms: new Map(), incomeRefs: new Map(internals.incomeRefs) };
    const stored = internals.incomeRefs.get(live.id)!;
    internals.incomeRefs.set(live.id, { ...stored, fromMonth: NOV, version: stored.version + 1 });
    expect(() => internals.checkTransitions(before)).toThrow('campo_imutavel');
    internals.incomeRefs.set(live.id, stored);
  });
});

// ---------------------------------------------------------------------------
// 8. Referência de 30% (linha de dívidas)
// ---------------------------------------------------------------------------

describe('referência de 30% com fonte e data, só na linha de dívidas', () => {
  it('fonte identificada, endereço https e data de consulta', () => {
    expect(DEBT_REFERENCE.permille).toBe(300);
    expect(DEBT_REFERENCE.url).toMatch(/^https:\/\/www\.serasa\.com\.br\//);
    expect(DEBT_REFERENCE.consultedOn).toBe('2026-10-09');
    expect(COMMITTED_TEXT.debtReference).toContain('até 30% da renda líquida');
    expect(COMMITTED_TEXT.debtReferenceSource).toBe('Fonte: Serasa, página sobre comprometimento de renda, consultada em 09/10/2026.');
    // 30% de R$ 6.000,00 = R$ 1.800,00; dívidas de R$ 1.150,00 = 19,2% (exemplo do tema renda-comprometida).
    expect(committedPermille(115_000, 600_000)).toBe(192);
    expect((600_000 * DEBT_REFERENCE.permille) / 1000).toBe(180_000);
  });
});
