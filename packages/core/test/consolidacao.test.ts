import { describe, expect, it } from 'vitest';
import {
  MemoryRepository,
  cardLimitUsed,
  committedTexts,
  loadInvoices,
  newOperationKey,
  savedInMonth,
  summarizeBudget,
  summarizeCommitted,
  summarizeMonth,
  summarizeToPay,
  type IsoMonth,
  type NewGoalInput,
} from '../src';

/**
 * CL-02 e T04 (docs/12): UMA compra de R$ 300,00 em 3 vezes, feita em 10/10/2026 no cartão que fecha dia 3 e vence dia 10, seguida
 * por todos os indicadores, mês a mês: Recebido, Pago, Diferença, Ainda a pagar, Renda comprometida (valor e percentual, com o
 * grupo Faturas), Orçado e Usado, Fatura do mês, Limite usado e Guardado em metas. A mesma montagem, nas funções do banco, está em
 * `supabase/tests/95_consolidacao.sql` (month_totals, month_to_pay, month_committed, month_budget e invoice_items).
 *
 * Cada coluna soma R$ 300,00 nos quatro meses, sem dupla contagem: o orçamento conta a parcela k no mês da compra mais (k - 1); a
 * fatura, o que ainda falta pagar e a renda comprometida contam a parcela na fatura (novembro a janeiro); só o pagamento da fatura
 * entra em Pago, na data do pagamento. A regra da parcela no orçamento e a do estorno seguem como estão (decisões pendentes de Enzo).
 */

const key = newOperationKey;
const OCT = '2026-10';
const NOV = '2026-11';
const DEC = '2026-12';
const JAN = '2027-01';
const MONTHS: IsoMonth[] = [OCT, NOV, DEC, JAN];

const goalInput = (): NewGoalInput => ({
  goalType: 'objetivo',
  name: 'Viagem',
  targetCents: 600_000,
  targetMonth: null,
  plannedMonthlyCents: null,
  essentialBaseCents: null,
  essentialMonths: null,
  essentialBaseSource: null,
  initialCents: null,
  initialOn: null,
});

/** Conta nova com salário de R$ 6.000,00 em outubro, renda de referência, orçamento de Lazer de R$ 300,00 e um cartão. */
async function montagem() {
  const clock = { today: '2026-10-10' };
  const repo = new MemoryRepository({ actorId: 'pessoa-teste', displayName: 'Pessoa de teste', today: () => clock.today });
  const space = await repo.ensurePersonalSpace('Conta principal');
  const ctx = space.personalContextId;
  const accountId = space.accounts[0]!.id;
  await repo.createRecord(key(), ctx, 'receita', { accountId, amountCents: 600_000, occurredOn: '2026-10-01', description: 'Salário', category: 'Salário' });
  await repo.setIncomeReference(key(), ctx, OCT, 0, 600_000, false);
  await repo.setCategoryBudget(key(), ctx, 'Lazer', OCT, 0, 30_000);
  const { card } = await repo.createCard(key(), ctx, { name: 'Nubank', lastDigits: '1234', closingDay: 3, dueDay: 10, limitCents: 500_000 });
  const goal = (await repo.createGoal(key(), ctx, goalInput())).goal;
  return { repo, ctx, accountId, cardId: card.id, goalId: goal.id, clock };
}
type Montagem = Awaited<ReturnType<typeof montagem>>;

/** A compra de R$ 300,00 em 3 vezes, em 10/10/2026, na categoria Lazer. */
const comprar = (m: Montagem, totalCents = 30_000) =>
  m.repo.addCardPurchase(key(), m.cardId, { description: 'Show', category: 'Lazer', purchasedOn: '2026-10-10', totalCents, installments: 3 });

/** Todos os indicadores de um mês, como as telas os leem: as mesmas funções do Resumo, de Contas a pagar, da renda comprometida, do orçamento e do cartão. */
async function indicadores(m: Montagem, month: IsoMonth) {
  const { repo, ctx, cardId, clock } = m;
  const totals = summarizeMonth(await repo.listRecords(ctx, month), ctx, month);
  const commitments = await repo.listCommitments(ctx, month);
  const committed = summarizeCommitted(commitments, ctx, month, clock.today, await repo.listIncomeReferences(ctx), await repo.listSeries(ctx));
  const budget = summarizeBudget(await repo.getMonthBudget(ctx, month));
  const invoices = await loadInvoices(repo, (await repo.getCard(cardId))!, clock.today);
  return {
    recebido: totals.receivedCents,
    pago: totals.paidCents,
    diferenca: totals.differenceCents,
    aPagar: summarizeToPay(commitments, ctx, month, clock.today).toPayCents,
    comprometido: committed.committedCents,
    comprometidoFaturas: committed.cardCents,
    percentual: committed.committedPermille,
    orcado: budget.budgetCents,
    usadoLazer: budget.rows.find((r) => r.category === 'Lazer')?.usedCents ?? 0,
    usadoTotal: budget.usedCents,
    fatura: invoices.find((i) => i.month === month)?.totalCents ?? 0,
    limiteUsado: cardLimitUsed(invoices),
    guardado: savedInMonth(await repo.listGoalMovementsInMonth(ctx, month), month),
  };
}
type Indicadores = Awaited<ReturnType<typeof indicadores>>;

const todos = async (m: Montagem) => Object.fromEntries(await Promise.all(MONTHS.map(async (month) => [month, await indicadores(m, month)] as const))) as Record<IsoMonth, Indicadores>;
/**
 * Uma linha com todos os indicadores do mês, em texto, na ordem de `pg_temp.mes` em `supabase/tests/95_consolidacao.sql`: recebido
 * pago diferença aPagar comprometido comprometidoFaturas percentual(milésimos) usadoLazer fatura limiteUsado guardado. Os mesmos
 * textos nos dois testes provam que o core e o banco chegam aos mesmos números.
 */
const linha = (i: Indicadores): string =>
  [i.recebido, i.pago, i.diferenca, i.aPagar, i.comprometido, i.comprometidoFaturas, i.percentual ?? '-', i.usadoLazer, i.fatura, i.limiteUsado, i.guardado].join(' ');
const linhas = (t: Record<IsoMonth, Indicadores>): string[] => MONTHS.map((month) => linha(t[month]!));
const coluna = (t: Record<IsoMonth, Indicadores>, campo: keyof Indicadores) => MONTHS.map((month) => t[month]![campo]);
const soma = (t: Record<IsoMonth, Indicadores>, campo: keyof Indicadores) => MONTHS.reduce((acc, month) => acc + (t[month]![campo] ?? 0), 0);

/** O que mudou entre duas fotos, por mês e por indicador ("2026-11.fatura"). */
function mudou(antes: Record<IsoMonth, Indicadores>, depois: Record<IsoMonth, Indicadores>): string[] {
  const out: string[] = [];
  for (const month of MONTHS) {
    for (const campo of Object.keys(antes[month]!) as (keyof Indicadores)[]) if (antes[month]![campo] !== depois[month]![campo]) out.push(`${month}.${campo}`);
  }
  return out;
}

describe('T04 e CL-02: compra de R$ 300,00 em 3x em 10/10/2026, indicador por indicador, mês a mês', () => {
  it('antes de pagar nada (10/10): orçamento, fatura, Ainda a pagar e renda comprometida somam R$ 300,00; Pago, Recebido e Diferença não mudam', async () => {
    const m = await montagem();
    const antes = await todos(m);
    const compra = await comprar(m);
    // O lançamento guarda o total e o número de parcelas; cada parcela é R$ 100,00, e a primeira cai na fatura de novembro.
    expect(compra.entry).toMatchObject({ kind: 'compra', installments: 3, amountCents: 30_000, invoiceMonth: NOV });
    const t = await todos(m);

    // Orçamento por categoria: a parcela k conta no mês da compra mais (k - 1), com o orçamento de R$ 300,00 em Lazer (regra de hoje).
    expect(coluna(t, 'usadoLazer')).toEqual([10_000, 10_000, 10_000, 0]);
    expect(coluna(t, 'usadoTotal')).toEqual([10_000, 10_000, 10_000, 0]);
    expect(coluna(t, 'orcado')).toEqual([30_000, 30_000, 30_000, 30_000]);
    expect(soma(t, 'usadoLazer')).toBe(30_000);
    // A fatura (fecha dia 3, vence dia 10): a compra de 10/10 já passou do fechamento de outubro, então a parcela 1 é a de novembro.
    expect(coluna(t, 'fatura')).toEqual([0, 10_000, 10_000, 10_000]);
    expect(soma(t, 'fatura')).toBe(30_000);
    // Ainda a pagar e renda comprometida (grupo Faturas): as mesmas parcelas, no mês do vencimento. 10.000 de 600.000 = 1,7%.
    expect(coluna(t, 'aPagar')).toEqual([0, 10_000, 10_000, 10_000]);
    expect(coluna(t, 'comprometido')).toEqual([0, 10_000, 10_000, 10_000]);
    expect(coluna(t, 'comprometidoFaturas')).toEqual([0, 10_000, 10_000, 10_000]);
    expect(coluna(t, 'percentual')).toEqual([0, 17, 17, 17]);
    expect(soma(t, 'aPagar')).toBe(30_000);
    expect(soma(t, 'comprometido')).toBe(30_000);
    // Limite usado: as três parcelas ainda não pagas.
    expect(coluna(t, 'limiteUsado')).toEqual([30_000, 30_000, 30_000, 30_000]);
    // Compra no cartão nunca entra em Pago, Recebido nem Diferença; meta nem foi tocada.
    expect(coluna(t, 'pago')).toEqual([0, 0, 0, 0]);
    expect(coluna(t, 'recebido')).toEqual([600_000, 0, 0, 0]);
    expect(coluna(t, 'diferenca')).toEqual([600_000, 0, 0, 0]);
    expect(coluna(t, 'guardado')).toEqual([0, 0, 0, 0]);
    // Só os indicadores da compra mudaram.
    expect(mudou(antes, t).sort()).toEqual(
      [
        ...MONTHS.map((x) => `${x}.limiteUsado`),
        '2026-10.usadoLazer', '2026-10.usadoTotal',
        '2026-11.usadoLazer', '2026-11.usadoTotal', '2026-11.fatura', '2026-11.aPagar', '2026-11.comprometido', '2026-11.comprometidoFaturas', '2026-11.percentual',
        '2026-12.usadoLazer', '2026-12.usadoTotal', '2026-12.fatura', '2026-12.aPagar', '2026-12.comprometido', '2026-12.comprometidoFaturas', '2026-12.percentual',
        '2027-01.fatura', '2027-01.aPagar', '2027-01.comprometido', '2027-01.comprometidoFaturas', '2027-01.percentual',
      ].sort(),
    );
    m.repo.checkInvariants();
  });

  it('pagando cada fatura no vencimento (10/11, 10/12 e 10/01): só então entra em Pago, e a soma volta a ser R$ 300,00 em todas as colunas', async () => {
    const m = await montagem();
    await comprar(m);
    const pagarFatura = async (mes: IsoMonth, dia: string, cents = 10_000) => {
      m.clock.today = dia;
      const fatura = (await loadInvoices(m.repo, (await m.repo.getCard(m.cardId))!, dia)).find((i) => i.month === mes)!;
      expect(fatura.situation).toBe('fechada');
      return m.repo.payInvoice(key(), m.cardId, mes, fatura.commitmentVersion!, cents, dia);
    };
    const pagoDe = async () => coluna(await todos(m), 'pago');

    const base = await todos(m);
    const novembro = await pagarFatura(NOV, '2026-11-10');
    expect(novembro.record).toMatchObject({ kind: 'despesa', amountCents: 10_000, occurredOn: '2026-11-10', category: null });
    expect(await pagoDe()).toEqual([0, 10_000, 0, 0]);
    let t = await todos(m);
    // Pagar não mexe no orçamento (a compra já foi contada), na fatura de cada mês nem na renda comprometida (a paga conta pelo valor pago).
    for (const campo of ['usadoLazer', 'usadoTotal', 'fatura', 'comprometido', 'comprometidoFaturas', 'percentual', 'orcado', 'guardado', 'recebido'] as const) {
      expect(coluna(t, campo), campo).toEqual(coluna(base, campo));
    }
    // Pago e Diferença de novembro mudam; Ainda a pagar de novembro zera; o limite usado devolve a parcela.
    expect([t[NOV]!.pago, t[NOV]!.diferenca, t[NOV]!.aPagar]).toEqual([10_000, -10_000, 0]);
    expect(coluna(t, 'limiteUsado')).toEqual([20_000, 20_000, 20_000, 20_000]);
    expect(coluna(t, 'aPagar')).toEqual([0, 0, 10_000, 10_000]);

    await pagarFatura(DEC, '2026-12-10');
    await pagarFatura(JAN, '2027-01-10');
    t = await todos(m);
    expect(coluna(t, 'pago')).toEqual([0, 10_000, 10_000, 10_000]);
    expect(coluna(t, 'diferenca')).toEqual([600_000, -10_000, -10_000, -10_000]);
    expect(coluna(t, 'aPagar')).toEqual([0, 0, 0, 0]);
    expect(coluna(t, 'limiteUsado')).toEqual([0, 0, 0, 0]);
    // As cinco colunas fecham em R$ 300,00: orçamento (Lazer), faturas, comprometido, comprometido do grupo Faturas e Pago.
    expect([soma(t, 'usadoLazer'), soma(t, 'fatura'), soma(t, 'comprometido'), soma(t, 'comprometidoFaturas'), soma(t, 'pago')]).toEqual([
      30_000, 30_000, 30_000, 30_000, 30_000,
    ]);
    // O Pago por mês ainda é só o pagamento da fatura, nunca a compra: o gasto de cada pagamento não leva categoria.
    expect((await m.repo.listRecords(m.ctx, NOV)).every((r) => r.kind === 'receita' || r.category === null)).toBe(true);
    m.repo.checkInvariants();
  });

  it('pagamento parcial de R$ 50,00 da fatura de dezembro: Pago de dezembro R$ 50,00, a diferença vira saldo anterior em janeiro, e as somas continuam R$ 300,00', async () => {
    const m = await montagem();
    await comprar(m);
    const pagar = async (mes: IsoMonth, dia: string, cents: number) => {
      m.clock.today = dia;
      const fatura = (await loadInvoices(m.repo, (await m.repo.getCard(m.cardId))!, dia)).find((i) => i.month === mes)!;
      return m.repo.payInvoice(key(), m.cardId, mes, fatura.commitmentVersion!, cents, dia);
    };
    await pagar(NOV, '2026-11-10', 10_000);
    const parcial = await pagar(DEC, '2026-12-10', 5_000);
    expect(parcial.entry).toMatchObject({ kind: 'saldo_anterior', amountCents: 5_000, invoiceMonth: JAN });
    const t = await todos(m);
    expect(coluna(t, 'pago')).toEqual([0, 10_000, 5_000, 0]);
    // Janeiro passa a R$ 150,00 (parcela 3 de R$ 100,00 e o saldo anterior de R$ 50,00); dezembro conta pelo valor pago (R$ 50,00).
    expect(coluna(t, 'fatura')).toEqual([0, 10_000, 10_000, 15_000]);
    expect(coluna(t, 'comprometido')).toEqual([0, 10_000, 5_000, 15_000]);
    expect(soma(t, 'comprometido')).toBe(30_000);
    expect(coluna(t, 'aPagar')).toEqual([0, 0, 0, 15_000]);
    // Limite: R$ 300,00 de compra menos R$ 100,00 e R$ 50,00 pagos; o saldo anterior de R$ 50,00 segue ocupando o limite (R$ 150,00 usados,
    // R$ 4.850,00 restantes de R$ 5.000,00).
    expect(coluna(t, 'limiteUsado')).toEqual([15_000, 15_000, 15_000, 15_000]);
    expect(500_000 - t[JAN]!.limiteUsado).toBe(485_000);
    // O orçamento não muda: o saldo anterior não é compra, e o pagamento da fatura não conta.
    expect(coluna(t, 'usadoLazer')).toEqual([10_000, 10_000, 10_000, 0]);
    expect(soma(t, 'usadoLazer')).toBe(30_000);
    // Pagando o resto em janeiro (R$ 150,00), o total pago fecha em R$ 300,00.
    await pagar(JAN, '2027-01-10', 15_000);
    const depois = await todos(m);
    expect(soma(depois, 'pago')).toBe(30_000);
    expect(soma(depois, 'aPagar')).toBe(0);
    expect(coluna(depois, 'limiteUsado')).toEqual([0, 0, 0, 0]);
    m.repo.checkInvariants();
  });

  it('alterar um lançamento muda só os indicadores dele: editar a compra, anotar um encargo e guardar um aporte', async () => {
    const m = await montagem();
    const compra = await comprar(m);
    const base = await todos(m);

    // Aporte de R$ 100,00 na meta: só "Guardado" de outubro muda (nunca Pago, Recebido, Ainda a pagar, comprometido nem orçamento).
    await m.repo.addGoalMovement(key(), m.goalId, 'aporte', { amountCents: 10_000, occurredOn: '2026-10-10', note: null });
    let t = await todos(m);
    expect(mudou(base, t)).toEqual(['2026-10.guardado']);
    expect(t[OCT]!.guardado).toBe(10_000);

    // Encargo (juros) de R$ 12,00 na fatura de novembro: muda a fatura, Ainda a pagar, comprometido e limite usado; o orçamento não (encargo fica fora).
    const antesEncargo = t;
    await m.repo.addCardCharge(key(), m.cardId, { chargeType: 'juros', amountCents: 1_200, invoiceMonth: NOV });
    t = await todos(m);
    expect(mudou(antesEncargo, t).sort()).toEqual(
      ['2026-10.limiteUsado', '2026-11.limiteUsado', '2026-12.limiteUsado', '2027-01.limiteUsado', '2026-11.fatura', '2026-11.aPagar', '2026-11.comprometido', '2026-11.comprometidoFaturas', '2026-11.percentual'].sort(),
    );
    expect(t[NOV]!).toMatchObject({ fatura: 11_200, aPagar: 11_200, usadoLazer: 10_000 });

    // Editar a compra para R$ 330,00 em 3x: as três parcelas (R$ 110,00) mudam no orçamento, nas faturas, em Ainda a pagar e no comprometido.
    const antesEdicao = t;
    await m.repo.updateCardEntry(key(), compra.entry!.id, compra.entry!.version, {
      kind: 'compra',
      description: 'Show',
      category: 'Lazer',
      purchasedOn: '2026-10-10',
      totalCents: 33_000,
      installments: 3,
    });
    t = await todos(m);
    expect(coluna(t, 'usadoLazer')).toEqual([11_000, 11_000, 11_000, 0]);
    expect(coluna(t, 'fatura')).toEqual([0, 12_200, 11_000, 11_000]);
    expect(coluna(t, 'pago')).toEqual(coluna(antesEdicao, 'pago'));
    expect(coluna(t, 'recebido')).toEqual(coluna(antesEdicao, 'recebido'));
    expect(coluna(t, 'guardado')).toEqual(coluna(antesEdicao, 'guardado'));
    expect(mudou(antesEdicao, t).some((x) => /\.(pago|recebido|diferenca|guardado)$/.test(x))).toBe(false);
    m.repo.checkInvariants();
  });

  it('os mesmos números do banco (supabase/tests/95_consolidacao.sql, cenário 6): aporte, encargo e edição da compra, mês a mês, em texto', async () => {
    const m = await montagem();
    const compra = await comprar(m);
    expect(linhas(await todos(m))).toEqual([
      '600000 0 600000 0 0 0 0 10000 0 30000 0',
      '0 0 0 10000 10000 10000 17 10000 10000 30000 0',
      '0 0 0 10000 10000 10000 17 10000 10000 30000 0',
      '0 0 0 10000 10000 10000 17 0 10000 30000 0',
    ]);
    // Aporte de R$ 100,00: só o guardado de outubro.
    await m.repo.addGoalMovement(key(), m.goalId, 'aporte', { amountCents: 10_000, occurredOn: '2026-10-10', note: null });
    expect(linhas(await todos(m))).toEqual([
      '600000 0 600000 0 0 0 0 10000 0 30000 10000',
      '0 0 0 10000 10000 10000 17 10000 10000 30000 0',
      '0 0 0 10000 10000 10000 17 10000 10000 30000 0',
      '0 0 0 10000 10000 10000 17 0 10000 30000 0',
    ]);
    // Encargo de R$ 12,00 na fatura de novembro: fatura, Ainda a pagar, comprometido (R$ 122,00 de R$ 6.000,00 = 1,9%) e limite usado.
    await m.repo.addCardCharge(key(), m.cardId, { chargeType: 'juros', amountCents: 1_200, invoiceMonth: NOV });
    expect(linhas(await todos(m))).toEqual([
      '600000 0 600000 0 0 0 0 10000 0 31200 10000',
      '0 0 0 11200 11200 11200 19 10000 11200 31200 0',
      '0 0 0 10000 10000 10000 17 10000 10000 31200 0',
      '0 0 0 10000 10000 10000 17 0 10000 31200 0',
    ]);
    // A compra editada para R$ 330,00 em 3x.
    await m.repo.updateCardEntry(key(), compra.entry!.id, compra.entry!.version, {
      kind: 'compra',
      description: 'Show',
      category: 'Lazer',
      purchasedOn: '2026-10-10',
      totalCents: 33_000,
      installments: 3,
    });
    expect(linhas(await todos(m))).toEqual([
      '600000 0 600000 0 0 0 0 11000 0 34200 10000',
      '0 0 0 12200 12200 12200 20 11000 12200 34200 0',
      '0 0 0 11000 11000 11000 18 11000 11000 34200 0',
      '0 0 0 11000 11000 11000 18 0 11000 34200 0',
    ]);
    m.repo.checkInvariants();
  });

  it('conta paga com atraso: conta no orçamento e em Pago do mês do pagamento, e na renda comprometida do mês do vencimento', async () => {
    const m = await montagem();
    // Condomínio de R$ 500,00 que venceu em 25/09/2026 e foi paga em 02/10/2026, na categoria Moradia.
    const conta = await m.repo.createCommitment(key(), m.ctx, { description: 'Condomínio', amountCents: 50_000, dueOn: '2026-09-25', category: 'Moradia' });
    await m.repo.setCategoryBudget(key(), m.ctx, 'Moradia', OCT, 0, 100_000);
    await m.repo.payCommitment(key(), conta.commitment.id, conta.commitment.version, {
      accountId: m.accountId,
      amountCents: 50_000,
      paidOn: '2026-10-02',
      category: 'Moradia',
    });
    const setembro = await indicadores(m, '2026-09');
    const outubro = await indicadores(m, OCT);
    // Renda comprometida: pelo vencimento (setembro). Pago, Diferença e orçamento: pela data do pagamento (outubro).
    expect(setembro).toMatchObject({ comprometido: 50_000, aPagar: 0, pago: 0 });
    expect(outubro).toMatchObject({ comprometido: 0, aPagar: 0, pago: 50_000, diferenca: 550_000 });
    const moradia = summarizeBudget(await m.repo.getMonthBudget(m.ctx, OCT)).rows.find((r) => r.category === 'Moradia');
    expect(moradia?.usedCents).toBe(50_000);
    expect(summarizeBudget(await m.repo.getMonthBudget(m.ctx, '2026-09')).rows.find((r) => r.category === 'Moradia')).toBeUndefined();
    m.repo.checkInvariants();
  });

  it('o mesmo caminho nos textos: a linha "Faturas de cartão" da renda comprometida aparece de novembro a janeiro, nunca em outubro', async () => {
    const m = await montagem();
    await comprar(m);
    const linhas = async (month: IsoMonth) => {
      const s = summarizeCommitted(await m.repo.listCommitments(m.ctx, month), m.ctx, month, m.clock.today, await m.repo.listIncomeReferences(m.ctx), await m.repo.listSeries(m.ctx));
      return committedTexts(s, 600_000).groups.map((g) => g.line);
    };
    expect((await linhas(OCT)).some((l) => l.startsWith('Faturas de cartão'))).toBe(false);
    for (const month of [NOV, DEC, JAN]) expect(await linhas(month)).toContain('Faturas de cartão · R$ 100,00 · 1,7%');
  });
});
