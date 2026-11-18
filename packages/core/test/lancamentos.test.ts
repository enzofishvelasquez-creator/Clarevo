import { describe, expect, it } from 'vitest';
import {
  CATEGORIES,
  CREDIT_CATEGORY,
  CUSTOM_SUBCATEGORIES_MAX,
  MemoryRepository,
  RECORD_KIND_ERROR_TEXT,
  RECORD_LINK_ERROR_TEXT,
  RECORD_LINK_TEXT,
  SUBCATEGORIES,
  SUBCATEGORY_MAX,
  UNCERTAIN_TEXT,
  categoryBreakdown,
  commitmentLinkLabel,
  forgetSubcategory,
  importKey,
  incomeInvestmentOptions,
  invoiceLinkLabel,
  isRepoError,
  kindSwitchNotice,
  linkSteps,
  linkedOptionKey,
  looksLikeOption,
  normalizeSubcategory,
  parseSubcategoryMemory,
  paymentLinkOptions,
  recordLinkErrorText,
  rememberSubcategory,
  saveErrorAfterUnlink,
  showPaymentLink,
  subcategoryAllowed,
  subcategoryChoices,
  summarizeMonth,
  summarizeToPay,
  type Commitment,
  type FinancialRecord,
  type PaymentLinkOption,
  type RepoErrorCode,
} from '../src';

/** Textos visíveis: sem travessão, sem a expressão vetada, sem recomendação de produto e sem cor de alerta. */
const FORBIDDEN =
  /\b(recomendamos|recomendo|invista|aplique|tesouro|cdb|lci|lca|caixinha|cofrinho)\b|fundo de investimento|rentabilidade garantida|rendimento garantido|enriquec|faz(er|endo)?\s+sentido|[–—]|\b(vermelh|verde)\w*/i;
const TODAY = '2026-11-17';

async function rejects(p: Promise<unknown>, code: RepoErrorCode) {
  try {
    await p;
  } catch (e) {
    if (isRepoError(e, code)) return;
    throw e;
  }
  throw new Error(`esperado ${code}`);
}

async function fresh() {
  const repo = new MemoryRepository({ actorId: 'pessoa-teste', displayName: 'Pessoa de teste', today: () => TODAY });
  const space = await repo.ensurePersonalSpace('Conta principal');
  const ctx = space.personalContextId;
  const acc = space.accounts[0]!.id;
  const carteira = (await repo.createAccount('lc-acc-2', ctx, { name: 'Carteira', kind: 'dinheiro' })).id;
  const month = async (m: string) => {
    const s = summarizeMonth(await repo.listRecords(ctx, m), ctx, m);
    return [s.receivedCents, s.paidCents];
  };
  return { repo, ctx, acc, carteira, month };
}

const commitment = (over: Partial<Commitment>): Commitment => ({
  id: 'c1',
  contextId: 'ctx',
  description: 'Internet',
  amountCents: 15000,
  currency: 'BRL',
  dueOn: '2026-11-15',
  category: 'Moradia',
  status: 'aberto',
  payment: null,
  series: null,
  seriesOverride: false,
  amountIsEstimate: false,
  invoice: null,
  createdBy: 'p',
  version: 1,
  createdAt: '',
  updatedAt: '',
  ...over,
});

describe('subcategorias (D-107, item 2)', () => {
  it('cada categoria de gasto tem uma lista curta, sem repetição e dentro do limite', () => {
    for (const c of CATEGORIES.despesa) {
      const list = SUBCATEGORIES[c]!;
      expect(list.length, c).toBeGreaterThanOrEqual(4);
      expect(list.length, c).toBeLessThanOrEqual(8);
      expect(new Set(list).size).toBe(list.length);
      for (const s of list) {
        expect([...s].length).toBeLessThanOrEqual(SUBCATEGORY_MAX);
        expect(s).not.toMatch(FORBIDDEN);
      }
    }
    expect(SUBCATEGORIES.Moradia).toEqual(expect.arrayContaining(['Aluguel', 'Conta de luz', 'Internet']));
    expect(Object.keys(SUBCATEGORIES).sort()).toEqual([...CATEGORIES.despesa].sort());
  });

  it('normaliza e confere como o banco', () => {
    expect(normalizeSubcategory('  Conta   de luz ')).toBe('Conta de luz');
    expect(normalizeSubcategory('   ')).toBeNull();
    expect(normalizeSubcategory(null)).toBeNull();
    expect(subcategoryAllowed('despesa', 'Moradia', 'Conta de luz')).toBe(true);
    expect(subcategoryAllowed('despesa', null, 'Conta de luz')).toBe(false);
    expect(subcategoryAllowed('receita', 'Salário', 'Bico')).toBe(false);
    expect(subcategoryAllowed('despesa', 'Moradia', 'x'.repeat(31))).toBe(false);
    expect(subcategoryAllowed('receita', 'Salário', null)).toBe(true);
  });

  it('as subcategorias próprias ficam no aparelho: guardar, sem repetir sugestão, tirar e ler', () => {
    let m = rememberSubcategory({}, 'Moradia', ' Diarista ');
    m = rememberSubcategory(m, 'Moradia', 'aluguel'); // sugestão: não guarda
    m = rememberSubcategory(m, 'Moradia', 'Jardinagem');
    m = rememberSubcategory(m, 'Moradia', 'diarista'); // repetida: sobe para o começo
    expect(m.Moradia).toEqual(['diarista', 'Jardinagem']);
    expect(subcategoryChoices('Moradia', m).own).toEqual(['diarista', 'Jardinagem']);
    expect(subcategoryChoices('Moradia', m).suggested).toBe(SUBCATEGORIES.Moradia);
    expect(subcategoryChoices(null, m)).toEqual({ suggested: [], own: [] });
    for (let i = 0; i < 12; i++) m = rememberSubcategory(m, 'Lazer', `Item ${i}`);
    expect(m.Lazer).toHaveLength(CUSTOM_SUBCATEGORIES_MAX);
    m = forgetSubcategory(m, 'Moradia', 'diarista');
    m = forgetSubcategory(m, 'Moradia', 'Jardinagem');
    expect(m.Moradia).toBeUndefined();
    expect(parseSubcategoryMemory({ Lazer: ['  A ', 3, '', 'x'.repeat(40)], Inventada: ['B'], Mercado: 'não' })).toEqual({ Lazer: ['A'] });
    expect(parseSubcategoryMemory('lixo')).toEqual({});
  });

  it('a composição de Pago mostra quanto foi para cada subcategoria dentro da categoria', () => {
    const base = { contextId: 'c', accountId: 'a', status: 'realizado', currency: 'BRL', commitmentId: null, invoice: null, receiptKey: null, createdBy: 'p', version: 1, createdAt: '', updatedAt: '' } as const;
    const rec = (id: string, amountCents: number, category: string | null, subcategory?: string): FinancialRecord => ({
      ...base,
      id,
      kind: 'despesa',
      amountCents,
      occurredOn: '2026-11-10',
      description: id,
      category,
      ...(subcategory ? { subcategory } : {}),
    });
    const shares = categoryBreakdown([rec('luz', 17052, 'Moradia', 'Conta de luz'), rec('net', 12000, 'Moradia', 'Internet'), rec('x', 5000, 'Moradia'), rec('m', 30000, 'Mercado')]);
    const moradia = shares.find((s) => s.category === 'Moradia')!;
    expect(moradia.cents).toBe(34052);
    expect(moradia.subcategories).toEqual([
      { subcategory: 'Conta de luz', label: 'Conta de luz', cents: 17052 },
      { subcategory: 'Internet', label: 'Internet', cents: 12000 },
      { subcategory: null, label: RECORD_LINK_TEXT.noSubcategory, cents: 5000 },
    ]);
    // Sem subcategoria na categoria, nada a mais (as outras telas continuam iguais).
    expect(shares.find((s) => s.category === 'Mercado')!.subcategories).toBeUndefined();
    expect(moradia.subcategories!.reduce((a, s) => a + s.cents, 0)).toBe(moradia.cents);
  });
});

describe('"O que este gasto pagou?" (D-107, item 1)', () => {
  const acordo = commitment({
    id: 'acordo',
    description: 'Acordo',
    amountCents: 26500,
    dueOn: '2026-11-10',
    category: CREDIT_CATEGORY,
    series: { id: 's', number: 18, kind: 'parcelada', nature: 'outro_parcelamento', installmentTotal: 21, partsPerYear: null },
  });
  const fatura = commitment({ id: 'fat', description: 'Fatura Cartão Exemplo', amountCents: 120000, dueOn: '2026-11-10', invoice: { cardId: 'card', month: '2026-11', closingOn: '2026-11-03' } });
  const aberta = commitment({ id: 'fat2', description: 'Fatura Cartão Exemplo', amountCents: 5000, dueOn: '2026-12-10', invoice: { cardId: 'card', month: '2026-12', closingOn: '2026-12-03' } });
  const paga = commitment({ id: 'paga', status: 'quitado' });
  const internet = commitment({ id: 'net' });

  it('lista as contas em aberto e as faturas fechadas, com o valor igual primeiro', () => {
    const opts = paymentLinkOptions([internet, acordo, fatura, aberta, paga], [{ id: 'card', name: 'Cartão Exemplo' }], TODAY, 26500);
    expect(opts.map((o) => o.label)).toEqual(['Acordo (parcela 18 de 21)', 'Fatura Cartão Exemplo (novembro)', 'Internet']);
    expect(opts[0]).toMatchObject({ type: 'conta', key: 'conta:acordo', commitmentId: 'acordo', version: 1 });
    expect(opts[1]).toMatchObject({ type: 'fatura', key: 'fatura:card:2026-11', cardId: 'card', month: '2026-11' });
    // Sem valor digitado: pelo vencimento.
    expect(paymentLinkOptions([internet, acordo], [], TODAY).map((o) => o.key)).toEqual(['conta:acordo', 'conta:net']);
    // Fatura de um cartão que não está na lista fica de fora.
    expect(paymentLinkOptions([fatura], [], TODAY)).toEqual([]);
    expect(invoiceLinkLabel('Cartão Exemplo', '2027-01', TODAY)).toBe('Fatura Cartão Exemplo (janeiro de 2027)');
    expect(commitmentLinkLabel(commitment({ description: 'Luz', series: { id: 's', number: 3, kind: 'mensal', nature: 'conta', installmentTotal: null, partsPerYear: null } }))).toBe(
      'Luz (todo mês)',
    );
  });

  it('aparece com "Crédito e parcelas" e, em outra categoria, quando alguma conta parece com o gasto', () => {
    const opts = paymentLinkOptions([internet, acordo, fatura], [{ id: 'card', name: 'Cartão Exemplo' }], TODAY);
    expect(showPaymentLink(CREDIT_CATEGORY, opts, 'Qualquer', null)).toBe(true);
    expect(showPaymentLink('Moradia', opts, 'Café', 450)).toBe(false);
    expect(showPaymentLink('Moradia', opts, 'Pagamento da internet de novembro', null)).toBe(true);
    expect(showPaymentLink(null, opts, 'PIX', 26500)).toBe(true);
    // Mesmo valor perto do vencimento parece; longe (mais de 15 dias), não.
    expect(showPaymentLink(null, opts, 'PIX', 26500, null, '2026-11-12')).toBe(true);
    expect(showPaymentLink(null, opts, 'PIX', 26500, null, '2026-06-12')).toBe(false);
    expect(showPaymentLink(null, opts, 'PAGAMENTO DE PIX QR FATURA', null)).toBe(true);
    expect(showPaymentLink('Lazer', [], 'Cinema', 100, 'conta:x')).toBe(true);
    const o = opts.find((x) => x.key === 'conta:acordo')!;
    expect(looksLikeOption(o, 'acordo da dívida', null)).toBe(true);
    expect(looksLikeOption(o, 'mer', null)).toBe(false);
  });

  it('os passos de salvar: nada, desligar, ligar ou trocar', () => {
    const conta = { key: 'conta:a' } as PaymentLinkOption;
    expect(linkSteps(null, null)).toEqual({ unlink: false, link: null });
    expect(linkSteps('conta:a', conta)).toEqual({ unlink: false, link: null });
    expect(linkSteps(null, conta)).toEqual({ unlink: false, link: conta });
    expect(linkSteps('conta:b', conta)).toEqual({ unlink: true, link: conta });
    expect(linkSteps('conta:b', null)).toEqual({ unlink: true, link: null });
    expect(linkedOptionKey({ commitmentId: 'a', invoice: null })).toBe('conta:a');
    expect(linkedOptionKey({ commitmentId: 'f', invoice: { cardId: 'c', month: '2026-11' } })).toBe('fatura:c:2026-11');
    expect(linkedOptionKey({ commitmentId: null, invoice: null })).toBeNull();
  });
});

describe('textos (D-107)', () => {
  it('os textos fixos e montados seguem as regras', () => {
    const samples: string[] = [];
    for (const v of Object.values(RECORD_LINK_TEXT)) {
      if (typeof v === 'string') samples.push(v);
    }
    samples.push(
      RECORD_LINK_TEXT.subcategoryRemove('Diarista'),
      RECORD_LINK_TEXT.optionDue('2026-11-10'),
      RECORD_LINK_TEXT.optionLine({ label: 'Acordo (parcela 18 de 21)', amountCents: 26500, dueOn: '2026-11-10' }),
      RECORD_LINK_TEXT.incomeEffect('Aplicação do banco'),
      RECORD_LINK_TEXT.linkFailedAfterSave(recordLinkErrorText('fatura_aberta')),
      RECORD_LINK_TEXT.linkFailedAfterUpdate(recordLinkErrorText('qualquer')),
      RECORD_LINK_TEXT.linkedNotice('Acordo (parcela 18 de 21)'),
      RECORD_LINK_TEXT.linkedInvoiceNotice('Fatura Cartão Exemplo (novembro)'),
      kindSwitchNotice('despesa', 'receita', { occurredOn: '2026-11-16' })!,
      kindSwitchNotice('receita', 'despesa', { occurredOn: '2026-10-30', nextMonth: true })!,
      ...Object.values(RECORD_LINK_ERROR_TEXT),
      ...Object.values(RECORD_KIND_ERROR_TEXT),
    );
    for (const t of samples) {
      expect(t, t).not.toMatch(FORBIDDEN);
      expect(t.trim()).toBe(t);
    }
    expect(RECORD_LINK_TEXT.paidHint).toBe('Ligando o gasto à conta, ela sai de Ainda a pagar e o valor não conta duas vezes.');
    expect(RECORD_LINK_TEXT.optionLine({ label: 'Internet', amountCents: 15000, dueOn: '2026-11-15' })).toBe('Internet · R$ 150,00 · vence em 15/11/2026');
  });

  it('falha ao salvar depois de desligar a conta de antes: a faixa de erro diz que a conta voltou para Ainda a pagar (revisão de 17/11/2026)', () => {
    const reason = recordLinkErrorText('versao_desatualizada');
    expect(saveErrorAfterUnlink(reason, false)).toBe(reason);
    expect(saveErrorAfterUnlink(null, false)).toBeNull();
    expect(saveErrorAfterUnlink('Não foi possível salvar. Tente de novo.', true)).toBe(
      'Não foi possível salvar. Tente de novo. A conta de antes já voltou para Ainda a pagar. As outras alterações não foram salvas.',
    );
    // O erro ficou junto de um campo: a faixa traz só o aviso do desligar.
    expect(saveErrorAfterUnlink(null, true)).toBe(RECORD_LINK_TEXT.unlinkedNotSaved);
    expect(RECORD_LINK_TEXT.unlinkedNotSaved).toBe('A conta de antes já voltou para Ainda a pagar. As outras alterações não foram salvas.');
    // Falha de rede: não dá para saber se gravou, então a faixa não diz que as alterações não foram salvas.
    expect(saveErrorAfterUnlink(UNCERTAIN_TEXT.movimentos, true, true)).toBe(
      'Não foi possível confirmar se salvou. Confira em Movimentos antes de anotar de novo. A conta de antes já voltou para Ainda a pagar.',
    );
    expect(saveErrorAfterUnlink(UNCERTAIN_TEXT.movimentos, false, true)).toBe(UNCERTAIN_TEXT.movimentos);
    expect(saveErrorAfterUnlink(reason, true)!).not.toMatch(FORBIDDEN);
  });

  it('a troca de tipo diz o efeito no mês', () => {
    expect(kindSwitchNotice('despesa', 'despesa', { occurredOn: '2026-11-16' })).toBeNull();
    expect(kindSwitchNotice('despesa', 'receita', { occurredOn: '2026-11-16' })).toBe(
      'Ao salvar, este valor sai de Pago e entra em Recebido de novembro de 2026. A categoria passa a ser uma de recebimento.',
    );
    // Voltar para gasto conta no mês da data (a marca do mês seguinte só vale no recebimento).
    expect(kindSwitchNotice('receita', 'despesa', { occurredOn: '2026-10-30', nextMonth: true })).toBe(
      'Ao salvar, este valor sai de Recebido e entra em Pago de outubro de 2026. A categoria passa a ser uma de gasto.',
    );
  });

  it('investimentos que recebem o rendimento: os ativos, e o ligado mesmo encerrado', () => {
    const list = [
      { id: 'b', name: 'Previdência', status: 'ativo' as const },
      { id: 'a', name: 'Aplicação', status: 'ativo' as const },
      { id: 'c', name: 'Antigo', status: 'encerrado' as const },
    ];
    expect(incomeInvestmentOptions(list).map((i) => i.id)).toEqual(['a', 'b']);
    expect(incomeInvestmentOptions(list, 'c').map((i) => i.id)).toEqual(['c', 'a', 'b']);
  });
});

describe('repositório em memória (D-107): as mesmas regras do banco', () => {
  it('o lançamento importado é editado por inteiro: de gasto para recebimento e de volta', async () => {
    const { repo, ctx, acc, carteira, month } = await fresh();
    const key = importKey('teste', { date: '2026-11-16', amountCents: 1, description: 'ENTRADA REND PAGO APLIC AUT APR', fitId: null }, 0);
    await repo.importRecords('lc-imp-1', ctx, 'conta', acc, [
      { importKey: key, kind: 'despesa', amountCents: 1, occurredOn: '2026-11-16', description: 'ENTRADA REND PAGO APLIC AUT APR', category: null },
    ]);
    const [imported] = await repo.listRecords(ctx, '2026-11');
    expect(imported!.kind).toBe('despesa');
    expect(await month('2026-11')).toEqual([0, 1]);
    const r = await repo.updateRecord('lc-imp-2', imported!.id, imported!.version, {
      accountId: carteira,
      amountCents: 2,
      occurredOn: '2026-11-15',
      description: 'Rendimento da aplicação',
      category: 'Renda extra',
      kind: 'receita',
    });
    expect(r).toMatchObject({ kind: 'receita', accountId: carteira, amountCents: 2, occurredOn: '2026-11-15', description: 'Rendimento da aplicação', category: 'Renda extra' });
    expect(await month('2026-11')).toEqual([2, 0]);
    // Repetir a mesma chave devolve o mesmo; o app antigo (sem kind) não troca o tipo.
    expect((await repo.updateRecord('lc-imp-2', imported!.id, imported!.version, { accountId: carteira, amountCents: 2, occurredOn: '2026-11-15', description: 'Rendimento da aplicação', category: 'Renda extra', kind: 'receita' })).version).toBe(r.version);
    const back = await repo.updateRecord('lc-imp-3', r.id, r.version, {
      accountId: acc,
      amountCents: 1,
      occurredOn: '2026-11-16',
      description: 'Tarifa',
      category: 'Moradia',
      kind: 'despesa',
      subcategory: 'Condomínio',
    });
    expect(back).toMatchObject({ kind: 'despesa', subcategory: 'Condomínio' });
    expect(await month('2026-11')).toEqual([0, 1]);
    await rejects(
      repo.updateRecord('lc-imp-4', back.id, back.version, { accountId: acc, amountCents: 1, occurredOn: '2026-11-16', description: 'X', category: 'Salário', kind: 'receita', subcategory: 'Condomínio' }),
      'subcategoria_invalida',
    );
  });

  it('subcategoria: guardar, manter (app antigo), tirar com outra categoria e recusar sem categoria', async () => {
    const { repo, ctx, acc } = await fresh();
    const base = { accountId: acc, amountCents: 17052, occurredOn: '2026-11-10', description: 'Luz', category: 'Moradia' };
    const r = await repo.createRecord('lc-s-1', ctx, 'despesa', { ...base, subcategory: '  Conta de luz ' });
    expect(r.subcategory).toBe('Conta de luz');
    const plain = await repo.createRecord('lc-s-0', ctx, 'despesa', base);
    expect('subcategory' in plain).toBe(false);
    const kept = await repo.updateRecord('lc-s-2', r.id, 1, { ...base, amountCents: 17100 });
    expect(kept.subcategory).toBe('Conta de luz');
    const other = await repo.updateRecord('lc-s-3', r.id, 2, { ...base, category: 'Mercado' });
    expect(other.subcategory).toBeUndefined();
    const set = await repo.updateRecord('lc-s-4', r.id, 3, { ...base, subcategory: 'Internet' });
    const cleared = await repo.updateRecord('lc-s-5', r.id, set.version, { ...base, subcategory: null });
    expect(cleared.subcategory).toBeUndefined();
    await rejects(repo.createRecord('lc-s-6', ctx, 'despesa', { ...base, category: null, subcategory: 'Luz' }), 'subcategoria_invalida');
    await rejects(repo.createRecord('lc-s-7', ctx, 'receita', { ...base, category: 'Salário', subcategory: 'Bico' }), 'subcategoria_invalida');
  });

  it('rendimento de investimento: o recebimento grava o rendimento no investimento e o mantém igual, sem contar duas vezes', async () => {
    const { repo, ctx, acc, month } = await fresh();
    const inv = (await repo.createInvestment('lc-i-0', ctx, { name: 'Aplicação automática', kind: 'renda_fixa', investedCents: 100_000, startOn: '2026-10-01', currentCents: null })).investment!.id;
    const inv2 = (await repo.createInvestment('lc-i-00', ctx, { name: 'Previdência', kind: 'previdencia', investedCents: 50_000, startOn: '2026-10-01', currentCents: null })).investment!.id;
    const income = async (id: string) => (await repo.getInvestment(id))!.incomeCents;
    const base = { accountId: acc, amountCents: 1250, occurredOn: '2026-11-05', description: 'Rendimento de outubro', category: 'Renda extra' };
    const r = await repo.createRecord('lc-i-1', ctx, 'receita', { ...base, investmentId: inv });
    expect(r.investmentId).toBe(inv);
    const moves = await repo.listInvestmentMovements(inv);
    const m = moves.find((x) => x.id === r.investmentMovementId)!;
    expect(m).toMatchObject({ kind: 'rendimento', amountCents: 1250, occurredOn: '2026-11-05', note: 'Rendimento de outubro' });
    expect(await income(inv)).toBe(1250);
    expect(await month('2026-11')).toEqual([1250, 0]);
    // Editar acompanha; sem o campo (app antigo) a ligação fica.
    const e1 = await repo.updateRecord('lc-i-2', r.id, 1, { ...base, amountCents: 1300, occurredOn: '2026-11-06' });
    expect(e1.investmentId).toBe(inv);
    expect((await repo.listInvestmentMovements(inv)).find((x) => x.id === e1.investmentMovementId)).toMatchObject({ amountCents: 1300, occurredOn: '2026-11-06', version: 2 });
    // Desligar, ligar a outro, trocar para gasto.
    const off = await repo.updateRecord('lc-i-3', r.id, 2, { ...base, amountCents: 1300, investmentId: null });
    expect(off.investmentId).toBeUndefined();
    expect(await income(inv)).toBe(0);
    const on2 = await repo.updateRecord('lc-i-4', r.id, 3, { ...base, amountCents: 1300, investmentId: inv2 });
    expect(on2.investmentId).toBe(inv2);
    expect(await income(inv2)).toBe(1300);
    const asExpense = await repo.updateRecord('lc-i-5', r.id, 4, { ...base, amountCents: 1300, category: null, kind: 'despesa' });
    expect(asExpense.investmentId).toBeUndefined();
    expect(await income(inv2)).toBe(0);
    // Excluir o recebimento tira o rendimento; o rendimento apagado pela ficha só desfaz a ligação.
    const d = await repo.createRecord('lc-i-6', ctx, 'receita', { ...base, investmentId: inv });
    await repo.deleteRecord('lc-i-7', d.id, 1);
    expect(await income(inv)).toBe(0);
    const f = await repo.createRecord('lc-i-8', ctx, 'receita', { ...base, investmentId: inv });
    await repo.deleteInvestmentMovement('lc-i-9', f.investmentMovementId!, 1);
    expect((await repo.getRecord(f.id))!.investmentId).toBeUndefined();
    // Recusas.
    await rejects(repo.createRecord('lc-i-10', ctx, 'despesa', { ...base, investmentId: inv }), 'investimento_invalido');
    await rejects(repo.createRecord('lc-i-11', ctx, 'receita', { ...base, investmentId: 'nao-existe' }), 'investimento_invalido');
    await repo.setInvestmentStatus('lc-i-12', inv2, (await repo.getInvestment(inv2))!.version, 'encerrado');
    await rejects(repo.createRecord('lc-i-13', ctx, 'receita', { ...base, investmentId: inv2 }), 'investimento_encerrado');
  });

  it('ligar um gasto que já existe a uma conta a pagar não cria outro gasto, e desligar mantém o gasto', async () => {
    const { repo, ctx, acc, month } = await fresh();
    const cp = (await repo.createCommitment('lc-c-1', ctx, { description: 'Acordo, parcela 18 de 21', amountCents: 26500, dueOn: '2026-11-10', category: CREDIT_CATEGORY })).commitment;
    const g = await repo.createRecord('lc-c-2', ctx, 'despesa', { accountId: acc, amountCents: 26500, occurredOn: '2026-11-12', description: 'Pagamento do acordo', category: CREDIT_CATEGORY });
    const before = await month('2026-11');
    await rejects(repo.linkRecordToCommitment('lc-c-3', cp.id, cp.version, { ...g, amountCents: 26000 }), 'versao_desatualizada');
    const w = await repo.linkRecordToCommitment('lc-c-4', cp.id, cp.version, g);
    expect(w.commitment.status).toBe('quitado');
    expect(w.commitment.payment).toMatchObject({ recordId: g.id, amountCents: 26500, paidOn: '2026-11-12' });
    expect(w.record).toMatchObject({ id: g.id, commitmentId: cp.id, linkedPayment: true, description: 'Pagamento do acordo' });
    expect(await month('2026-11')).toEqual(before);
    expect((await repo.listRecords(ctx, '2026-11')).length).toBe(1);
    // Saiu de Ainda a pagar.
    expect(summarizeToPay(await repo.listCommitments(ctx, '2026-11'), ctx, '2026-11', TODAY).toPayCents).toBe(0);
    // Repetição; já ligado; tipo que não muda.
    expect((await repo.linkRecordToCommitment('lc-c-4', cp.id, cp.version, g)).record.id).toBe(g.id);
    const cp2 = (await repo.createCommitment('lc-c-5', ctx, { description: 'Outra', amountCents: 26500, dueOn: '2026-12-10', category: null })).commitment;
    await rejects(repo.linkRecordToCommitment('lc-c-6', cp2.id, 1, w.record), 'registro_ja_ligado');
    await rejects(
      repo.updateRecord('lc-c-7', g.id, w.record.version, { accountId: acc, amountCents: 26500, occurredOn: '2026-11-12', description: 'X', category: null, kind: 'receita' }),
      'tipo_nao_muda',
    );
    const income = await repo.createRecord('lc-c-8', ctx, 'receita', { accountId: acc, amountCents: 100, occurredOn: '2026-11-12', description: 'Pix', category: null });
    await rejects(repo.linkRecordToCommitment('lc-c-9', cp2.id, 1, income), 'registro_invalido');
    // "Nenhuma destas": a conta reabre e o gasto fica.
    const cur = (await repo.getCommitment(cp.id))!;
    const u = await repo.undoCommitmentPayment('lc-c-10', cp.id, cur.version, true);
    expect(u.commitment.status).toBe('aberto');
    expect(u.record).toMatchObject({ id: g.id, commitmentId: null });
    expect(u.record.linkedPayment).toBeUndefined();
    expect(await repo.getRecord(g.id)).not.toBeNull();
    expect(await month('2026-11')).toEqual([100, 26500]);
  });

  it('ligar um gasto que já existe à fatura fechada (pagamento parcial) e desligar mantendo o gasto', async () => {
    const { repo, ctx, acc, month } = await fresh();
    const card = (await repo.createCard('lc-f-1', ctx, { name: 'Cartão Exemplo', lastDigits: '1234', closingDay: 3, dueDay: 10, limitCents: 500_000 })).card.id;
    await repo.addCardPurchase('lc-f-2', card, { description: 'Mercado do mês', category: 'Mercado', purchasedOn: '2026-11-01', totalCents: 100_000, installments: 1 });
    await repo.addCardPurchase('lc-f-3', card, { description: 'Farmácia', category: 'Saúde', purchasedOn: '2026-11-02', totalCents: 20_000, installments: 1 });
    const inv = (await repo.listCommitments(ctx, '2026-11')).find((c) => c.invoice?.month === '2026-11')!;
    const g = await repo.createRecord('lc-f-4', ctx, 'despesa', { accountId: acc, amountCents: 100_000, occurredOn: '2026-11-10', description: 'PAGAMENTO DE PIX QR CREDITO', category: CREDIT_CATEGORY });
    const before = await month('2026-11');
    const w = await repo.linkRecordToInvoice('lc-f-5', card, '2026-11', inv.version, g);
    expect(w.record).toMatchObject({ id: g.id, invoice: { cardId: card, month: '2026-11' }, linkedPayment: true, description: 'PAGAMENTO DE PIX QR CREDITO' });
    expect(w.commitment.status).toBe('quitado');
    expect(w.entry).toMatchObject({ kind: 'saldo_anterior', amountCents: 20_000, invoiceMonth: '2026-12' });
    expect(await month('2026-11')).toEqual(before);
    // A fatura de dezembro ainda está aberta: não liga.
    const g2 = await repo.createRecord('lc-f-6', ctx, 'despesa', { accountId: acc, amountCents: 100, occurredOn: '2026-11-10', description: 'Outro', category: null });
    const dec = (await repo.listCommitments(ctx, '2026-12')).find((c) => c.invoice?.month === '2026-12')!;
    await rejects(repo.linkRecordToInvoice('lc-f-7', card, '2026-12', dec.version, g2), 'fatura_aberta');
    // Desligar mantendo o gasto.
    const cur = (await repo.listCommitments(ctx, '2026-11')).find((c) => c.invoice?.month === '2026-11')!;
    const u = await repo.undoInvoicePayment('lc-f-8', card, '2026-11', cur.version, true);
    expect(u.commitment.status).toBe('aberto');
    expect(u.record).toMatchObject({ id: g.id, invoice: null, commitmentId: null });
    expect(await repo.getRecord(g.id)).not.toBeNull();
    expect(await month('2026-11')).toEqual([0, 100_100]);
  });
});
