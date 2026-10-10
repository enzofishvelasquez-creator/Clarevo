import { describe, expect, it } from 'vitest';
import {
  CARD_MONTH_TEXT,
  CARDS_TEXT,
  MemoryRepository,
  cardInvoicesMonth,
  invoiceCommittedCents,
  loadInvoices,
  newOperationKey,
  summarizeCommitted,
  type CardInput,
  type Invoice,
} from '../src';

const TODAY = '2026-10-07';
const OCT = '2026-10';
const key = () => newOperationKey();

const NUBANK: CardInput = { name: 'Nubank', lastDigits: '1234', closingDay: 3, dueDay: 10, limitCents: 500_000 };
const OUTRO: CardInput = { name: 'Banco B', lastDigits: null, closingDay: 20, dueDay: 25, limitCents: null };

/** Duas contas de cartão no contexto Pessoal, hoje em 07/10/2026. */
async function scenario() {
  const repo = new MemoryRepository({ actorId: 'pessoa-teste', displayName: 'Pessoa de teste', today: () => TODAY });
  const space = await repo.ensurePersonalSpace('Conta principal');
  const ctx = space.personalContextId;
  const a = (await repo.createCard(key(), ctx, NUBANK)).card;
  const b = (await repo.createCard(key(), ctx, OUTRO)).card;
  const buy = (cardId: string, description: string, totalCents: number, purchasedOn: string, installments = 1) =>
    repo.addCardPurchase(key(), cardId, { description, category: null, purchasedOn, totalCents, installments });
  const invoices = async () => [...(await loadInvoices(repo, (await repo.getCard(a.id))!, TODAY)), ...(await loadInvoices(repo, (await repo.getCard(b.id))!, TODAY))];
  const committedCards = async (month: string) => summarizeCommitted(await repo.listCommitments(ctx, month), ctx, month, TODAY, await repo.listIncomeReferences(ctx)).cardCents;
  return { repo, ctx, a, b, buy, invoices, committedCards };
}

/** Fatura mínima para os testes sem repositório. */
function invoice(month: string, totalCents: number, paidCents: number | null = null, situation: Invoice['situation'] = 'fechada'): Invoice {
  return { cardId: 'c1', month, totalCents, paidCents, situation } as Invoice;
}

describe('faturas do mês (D-042)', () => {
  it('soma as faturas que vencem no mês, de todos os cartões, e é o mesmo número do grupo "Faturas de cartão" da renda comprometida', async () => {
    const s = await scenario();
    await s.buy(s.a.id, 'Mercado', 30_000, '2026-09-15');
    await s.buy(s.a.id, 'Sofá', 20_000, '2026-09-20', 2);
    await s.buy(s.b.id, 'Farmácia', 15_000, '2026-09-25');
    const all = await s.invoices();
    const m = cardInvoicesMonth(all, OCT, []);
    // Nubank em outubro: 300,00 + 100,00 (parcela 1 de 2). Banco B em outubro: 150,00.
    expect(m.totalCents).toBe(55_000);
    expect(m.invoiceCount).toBe(2);
    expect(m.paidCents).toBe(0);
    expect(m.openCents).toBe(55_000);
    expect(m.totalCents).toBe(await s.committedCards(OCT));
    // Novembro é a parcela 2 de 2 do sofá (100,00), mesmo número da renda comprometida.
    expect(cardInvoicesMonth(all, '2026-11', []).totalCents).toBe(await s.committedCards('2026-11'));
  });

  it('fatura paga entra pelo valor pago (inclusive pagamento em parte); as demais, pelo total previsto, e continua igual ao comprometido', async () => {
    const s = await scenario();
    await s.buy(s.a.id, 'Mercado', 30_000, '2026-09-15');
    await s.buy(s.a.id, 'Sofá', 20_000, '2026-09-20', 2);
    await s.buy(s.b.id, 'Farmácia', 15_000, '2026-09-25');
    const nubankOct = (await s.invoices()).find((i) => i.cardId === s.a.id && i.month === OCT)!;
    expect(nubankOct.situation).toBe('fechada');
    await s.repo.payInvoice(key(), s.a.id, OCT, nubankOct.commitmentVersion!, 25_000, '2026-10-07');
    const m = cardInvoicesMonth(await s.invoices(), OCT, []);
    expect(m.paidCents).toBe(25_000);
    expect(m.openCents).toBe(15_000);
    expect(m.totalCents).toBe(40_000);
    expect(m.totalCents).toBe(await s.committedCards(OCT));
    // O que ficou sem pagar (150,00) vira saldo anterior na fatura de novembro, que entra em novembro.
    const nov = cardInvoicesMonth(await s.invoices(), '2026-11', []);
    expect(nov.totalCents).toBe(await s.committedCards('2026-11'));
    expect(nov.totalCents).toBe(25_000);
  });

  it('a fatura aberta (antes do fechamento) é marcada: o valor pode mudar', async () => {
    const s = await scenario();
    await s.buy(s.b.id, 'Farmácia', 15_000, '2026-09-25');
    const m = cardInvoicesMonth(await s.invoices(), OCT, []);
    expect(m.hasOpenInvoice).toBe(true);
    await s.buy(s.a.id, 'Mercado', 30_000, '2026-09-15');
    expect(cardInvoicesMonth((await s.invoices()).filter((i) => i.cardId === s.a.id), OCT, []).hasOpenInvoice).toBe(false);
  });

  it('percentual da renda de referência: milésimos com metade para cima, como na renda comprometida', async () => {
    const s = await scenario();
    await s.buy(s.a.id, 'Mercado', 30_000, '2026-09-15');
    await s.buy(s.a.id, 'Sofá', 20_000, '2026-09-20', 2);
    await s.repo.setIncomeReference(key(), s.ctx, OCT, 0, 600_000, false);
    const refs = await s.repo.listIncomeReferences(s.ctx);
    const m = cardInvoicesMonth(await s.invoices(), OCT, refs);
    expect(m.referenceCents).toBe(600_000);
    expect(m.totalCents).toBe(40_000);
    expect(m.permille).toBe(67);
    expect(m.percentText).toBe('6,7%');
    expect(CARD_MONTH_TEXT.percent(m.percentText!)).toBe('6,7% da sua renda de referência');
    // Mesmo percentual do grupo "Faturas de cartão" da renda comprometida.
    const committed = summarizeCommitted(await s.repo.listCommitments(s.ctx, OCT), s.ctx, OCT, TODAY, refs);
    expect(committed.cardCents).toBe(m.totalCents);
    expect(committed.cardPermille).toBe(m.permille);
  });

  it('a referência vigente no mês: a de um mês anterior vale; a que começa depois, não', () => {
    const refs = [{ id: 'r1', contextId: 'x', fromMonth: '2026-08', amountCents: 500_000, varies: false, version: 1 }, { id: 'r2', contextId: 'x', fromMonth: '2026-11', amountCents: 900_000, varies: false, version: 1 }] as never;
    const inv = [invoice(OCT, 50_000), invoice('2026-11', 50_000)];
    expect(cardInvoicesMonth(inv, OCT, refs)).toMatchObject({ referenceCents: 500_000, percentText: '10,0%' });
    expect(cardInvoicesMonth(inv, '2026-11', refs)).toMatchObject({ referenceCents: 900_000, percentText: '5,6%' });
    expect(cardInvoicesMonth(inv, '2026-07', refs)).toMatchObject({ referenceCents: null, percentText: null, permille: null });
  });

  it('sem renda de referência: só o valor, sem percentual; sem fatura no mês: total zero e sem percentual', () => {
    expect(cardInvoicesMonth([invoice(OCT, 12_345)], OCT, [])).toMatchObject({ totalCents: 12_345, permille: null, percentText: null, referenceCents: null });
    const none = cardInvoicesMonth([invoice('2026-11', 12_345)], OCT, [{ id: 'r', contextId: 'x', fromMonth: '2026-01', amountCents: 500_000, varies: false, version: 1 }] as never);
    expect(none).toMatchObject({ totalCents: 0, invoiceCount: 0, percentText: null });
  });

  it('valor mínimo: "menos de 0,1%" quando há fatura e o arredondamento dá zero', () => {
    const refs = [{ id: 'r', contextId: 'x', fromMonth: '2026-01', amountCents: 600_000, varies: false, version: 1 }] as never;
    expect(cardInvoicesMonth([invoice(OCT, 1)], OCT, refs).percentText).toBe('menos de 0,1%');
    expect(cardInvoicesMonth([invoice(OCT, 300)], OCT, refs).percentText).toBe('0,1%');
  });

  it('acima de 100% mostra o valor real, sem teto', () => {
    const refs = [{ id: 'r', contextId: 'x', fromMonth: '2026-01', amountCents: 100_000, varies: false, version: 1 }] as never;
    expect(cardInvoicesMonth([invoice(OCT, 150_000)], OCT, refs).percentText).toBe('150,0%');
  });

  it('próximas faturas: até 3 meses com valor, dentro dos 6 meses seguintes, em ordem', () => {
    const inv = [
      invoice(OCT, 10_000),
      invoice('2026-11', 55_000, null, 'aberta'),
      invoice('2026-12', 0),
      invoice('2027-01', 35_000, null, 'aberta'),
      invoice('2027-02', 15_000, null, 'aberta'),
      invoice('2027-03', 15_000, null, 'aberta'),
    ];
    const m = cardInvoicesMonth(inv, OCT, []);
    expect(m.upcoming).toEqual([
      { month: '2026-11', cents: 55_000 },
      { month: '2027-01', cents: 35_000 },
      { month: '2027-02', cents: 15_000 },
    ]);
    expect(CARD_MONTH_TEXT.upcoming(m.upcoming)).toBe('Próximas faturas (previsto): novembro R$ 550,00, janeiro R$ 350,00, fevereiro R$ 150,00');
    expect(cardInvoicesMonth([invoice(OCT, 10_000), invoice('2027-06', 1_000)], OCT, []).upcoming).toEqual([]);
    expect(cardInvoicesMonth([invoice(OCT, 10_000), invoice('2027-04', 1_000)], OCT, []).upcoming).toEqual([{ month: '2027-04', cents: 1_000 }]);
  });

  it('o Cartão Exemplo da demonstração: nada vence em outubro e as próximas faturas aparecem', async () => {
    const { createDemoRepository } = await import('../src');
    const repo = await createDemoRepository();
    const ctx = (await repo.getSpace())!.personalContextId;
    const cards = await repo.listCards(ctx);
    const all = (await Promise.all(cards.map((c) => loadInvoices(repo, c, '2026-10-07')))).flat();
    const m = cardInvoicesMonth(all, OCT, await repo.listIncomeReferences(ctx));
    expect(m.totalCents).toBe(0);
    expect(m.upcoming).toEqual([
      { month: '2026-11', cents: 55_000 },
      { month: '2026-12', cents: 35_000 },
      { month: '2027-01', cents: 35_000 },
    ]);
    // Novembro: o mesmo número da renda comprometida da demonstração.
    const nov = cardInvoicesMonth(all, '2026-11', []);
    const committed = summarizeCommitted(await repo.listCommitments(ctx, '2026-11'), ctx, '2026-11', '2026-10-07', []);
    expect(nov.totalCents).toBe(committed.cardCents);
  });

  it('valor da fatura no comprometido', () => {
    expect(invoiceCommittedCents({ paidCents: null, totalCents: 500 })).toBe(500);
    expect(invoiceCommittedCents({ paidCents: 300, totalCents: 500 })).toBe(300);
    expect(invoiceCommittedCents({ paidCents: 500, totalCents: 500 })).toBe(500);
  });

  it('textos: título, ausência de fatura, regra e ligação com a renda comprometida', () => {
    expect(CARD_MONTH_TEXT.title('2026-10')).toBe('Faturas de outubro');
    expect(CARD_MONTH_TEXT.none('2026-10')).toBe('Nenhuma fatura vence em outubro.');
    expect(CARD_MONTH_TEXT.inCommitted).toBe('Já entra na sua renda comprometida, no grupo Faturas de cartão.');
    expect(CARD_MONTH_TEXT.noReference).toBe('Informe sua renda para ver quanto isso representa.');
    expect(CARD_MONTH_TEXT.seeCommitted).toBe('Ver na renda comprometida');
    expect(CARDS_TEXT.title).toBe('Cartões');
  });
});
