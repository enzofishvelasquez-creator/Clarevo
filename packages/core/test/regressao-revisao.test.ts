/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  BUDGET_TEXT,
  DEMO_TEXT,
  DEMO_TODAY,
  GOALS_TEXT,
  GUIDE_ENTRIES,
  MemoryRepository,
  PendingAttemptStore,
  SERIES_TOTALS_TEXT,
  SUBSCRIPTION_TEXT,
  UNCERTAIN_TEXT,
  buildInvoices,
  cardSummaryTexts,
  categoryUsage,
  commitmentSituation,
  committedTexts,
  contextPillText,
  createDemoRepository,
  dueText,
  essentialEstimateText,
  essentialMonthly,
  goalCardCaption,
  goalDetailTexts,
  goalPlan,
  guardedWrite,
  invoiceSituationLabel,
  invoiceTexts,
  isPartialInvoicePayment,
  loadInvoices,
  newAttemptSlot,
  newOperationKey,
  reserveCardTexts,
  seriesMonthlyTotal,
  seriesStartingLater,
  seriesTotalsTexts,
  settleSlot,
  slotKeys,
  subscriptionRow,
  subscriptionTotals,
  subscriptionYear,
  summarizeCommitted,
  summarizeMonth,
  type CommitmentSeries,
  type IsoDate,
  type SubscriptionSeries,
} from '../src';

/**
 * Regressão da resposta à revisão v0.9 (docs/12, itens 1 a 8 do plano, CL-20): um teste para cada falha corrigida, com o texto ou o
 * valor de antes e o de depois. As tabelas "Antes" e "Depois" de cada bloco são as que `docs/12` registra como evidência.
 */

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const read = (path: string) => readFileSync(`${ROOT}${path}`, 'utf8');
const key = newOperationKey;
/** Texto como o gerador do manual o escreve em HTML (scripts/gerar-manual.js, função esc). */
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** Palavras e sinais que nenhum texto do produto pode ter (CLAUDE.md): travessões e a expressão proibida. */
const FORBIDDEN = new RegExp(['faz(er|endo)?', 'sentido'].join('\\s+') + '|[\\u2013\\u2014]', 'i');

// ---------------------------------------------------------------------------
// CL-01: a mesma frase, descrevendo a regra de hoje, na tela, no guia, no manual e em docs/02
// ---------------------------------------------------------------------------

describe('CL-01: a regra do orçamento escrita uma vez só', () => {
  const rule = BUDGET_TEXT.rule;

  it('a frase da tela do orçamento é a do guia e a do manual (e a de docs/02), palavra por palavra', () => {
    // Tela: a tela desenha BUDGET_TEXT.rule e nenhum texto escrito à mão sobre a regra.
    const screen = read('apps/app/src/app/orcamento/index.tsx');
    expect(screen).toContain('{BUDGET_TEXT.rule}');
    expect(screen).not.toContain('Compras no cartão contam');
    // Guia (e a ajuda "?" da tela, que lê o mesmo catálogo).
    const entry = GUIDE_ENTRIES.find((e) => e.id === 'orcamento')!;
    expect(entry.steps).toContain(rule);
    expect(entry.help).toContain('orcamento');
    // Manual: o HTML gerado do catálogo (`npm run manual`).
    expect(read('docs/manual/index.html')).toContain(esc(rule));
    // Documentação das regras.
    expect(read('docs/02_REGRAS_FINANCEIRAS.md')).toContain(rule);
    // As três primeiras frases de antes não existem mais em lugar nenhum do código nem do manual.
    for (const old of [
      'Compras no cartão contam no mês da compra (cada parcela no seu mês), mesmo antes de a fatura ser paga.',
      'Compras no cartão contam no mês da compra, mesmo antes de a fatura ser paga.',
    ]) {
      expect(read('packages/core/src/budget.ts')).not.toContain(old);
      expect(read('packages/core/src/guide/catalog.ts')).not.toContain(old);
      expect(read('docs/manual/index.html')).not.toContain(old);
    }
  });

  it('a frase diz a regra de hoje: parcela k no mês da compra + (k - 1), nunca a compra inteira nem o mês da fatura; Em Pago só com a fatura paga', () => {
    expect(rule).toContain('a 1ª parcela no mês da compra, a 2ª no mês seguinte');
    expect(rule).toContain('mesmo antes de a fatura ser paga');
    expect(rule).toContain('Em Pago, ela só entra quando a fatura é paga.');
    expect(rule).toContain(BUDGET_TEXT.paidRule);
    // Compra de R$ 300,00 em 3x em 10/10, com a fatura de novembro: a regra acima é o que `categoryUsage` calcula.
    const entries = [{ kind: 'compra', category: 'Lazer', amountCents: 30_000, installments: 3, purchasedOn: '2026-10-10', invoiceMonth: '2026-11', sourceMonth: null } as const];
    const lazer = (m: string) => categoryUsage(m, { records: [], entries }).Lazer;
    expect(['2026-10', '2026-11', '2026-12', '2027-01'].map(lazer)).toEqual([10_000, 10_000, 10_000, 0]);
    // Gasto pago e conta paga: no mês da data do pagamento (a regra da segunda frase).
    expect(categoryUsage('2026-10', { records: [{ kind: 'despesa', category: 'Moradia', amountCents: 50_000, occurredOn: '2026-10-02', invoice: null }], entries: [] }).Moradia).toBe(50_000);
    expect(categoryUsage('2026-09', { records: [{ kind: 'despesa', category: 'Moradia', amountCents: 50_000, occurredOn: '2026-10-02', invoice: null }], entries: [] }).Moradia).toBe(0);
  });

  it('texto sem travessão, sem a expressão proibida e em linguagem neutra', () => {
    expect(rule).not.toMatch(FORBIDDEN);
    expect(rule).not.toMatch(/\b(pessoa|você)\b.*\b(o|a)s?\b cliente/i);
  });
});

// ---------------------------------------------------------------------------
// CL-08: rótulos de Gastos fixos, o que ainda não começou e o por ano das assinaturas
// ---------------------------------------------------------------------------

describe('CL-08: Gastos fixos, parcelamentos, assinaturas e contas do ano', () => {
  it('demonstração: a frase de cada soma diz o conjunto, e o que ainda não começou aparece à parte (antes: "Por mês" e "Por ano" soltos)', async () => {
    const repo = await createDemoRepository();
    const series = await repo.listSeries((await repo.getSpace())!.personalContextId);
    // Antes: "Por mês, se os valores não mudarem: R$ 3.668,90 (inclui R$ 180,00 estimados). Contas do ano ficam fora desta soma."
    //        "Por ano, se os valores não mudarem: R$ 4.200,00 (inclui R$ 4.200,00 estimados)."
    expect(seriesTotalsTexts(series, DEMO_TODAY)).toEqual({
      monthly: 'Gastos fixos, parcelamentos e assinaturas: R$ 3.668,90 por mês, se os valores não mudarem (inclui R$ 180,00 estimados).',
      monthlyLater: 'Já começaram: R$ 2.500,00. Começam depois: R$ 1.168,90 (4 itens, o primeiro em novembro de 2026).',
      yearly: 'Contas do ano (IPVA, IPTU e outras): R$ 4.200,00 por ano, se os valores não mudarem (valor estimado).',
      yearlyLater: 'Começam depois: R$ 4.200,00 (2 itens, o primeiro em janeiro de 2027).',
    });
    // O que o atalho "Dividir estas contas" recebe não muda: R$ 3.668,90.
    expect(seriesMonthlyTotal(series, DEMO_TODAY)).toEqual({ totalCents: 366_890, estimatedCents: 18_000 });
    for (const text of Object.values(seriesTotalsTexts(series, DEMO_TODAY))) expect(text).not.toMatch(FORBIDDEN);
  });

  it('a parte que ainda não começou: a série com a primeira conta depois do mês de hoje, nunca a que começa no mês nem a encerrada', () => {
    const serie = (over: Partial<CommitmentSeries>): CommitmentSeries =>
      ({
        id: 's',
        kind: 'mensal',
        firstDueMonth: '2026-10',
        firstNumber: 1,
        lastNumber: null,
        partsPerYear: null,
        terms: [{ fromNumber: 1, description: 'Item', category: null, amountCents: 10_000, amountMode: 'fixo', dueDay: 5 }],
        ...over,
      }) as CommitmentSeries;
    const hoje: IsoDate = '2026-10-07';
    // Começa em outubro (mês de hoje), começa em novembro, encerrada em agosto: só a de novembro é "depois".
    const lista = [serie({ id: 'a' }), serie({ id: 'b', firstDueMonth: '2026-11' }), serie({ id: 'c', firstDueMonth: '2026-06', lastNumber: 3 })];
    expect(seriesStartingLater(lista, hoje, false)).toEqual({ count: 1, totalCents: 10_000, estimatedCents: 0, firstMonth: '2026-11' });
    expect(seriesTotalsTexts(lista, hoje).monthlyLater).toBe('Já começaram: R$ 100,00. Começam depois: R$ 100,00 (1 item, em novembro de 2026).');
    // Tudo já começou: nenhuma linha à parte. Nenhuma começou: só a parte de depois.
    expect(seriesTotalsTexts([lista[0]!], hoje).monthlyLater).toBeNull();
    expect(seriesTotalsTexts([lista[1]!], hoje).monthlyLater).toBe('Começam depois: R$ 100,00 (1 item, em novembro de 2026).');
    expect(SERIES_TOTALS_TEXT.estimated(10_000, 0)).toBe('');
    expect(SERIES_TOTALS_TEXT.estimated(10_000, 10_000)).toBe(' (valor estimado)');
    expect(SERIES_TOTALS_TEXT.estimated(10_000, 2_000)).toBe(' (inclui R$ 20,00 estimados)');
  });

  const assinatura = (over: Partial<SubscriptionSeries> = {}): SubscriptionSeries => ({
    id: 's1',
    kind: 'mensal',
    firstDueMonth: '2026-06',
    firstNumber: 1,
    lastNumber: null,
    partsPerYear: null,
    terms: [{ fromNumber: 1, description: 'Streaming', category: 'Lazer', amountCents: 3_990, amountMode: 'fixo', dueDay: 10 }],
    subscription: true,
    subscriptionReviewedOn: null,
    subscriptionSince: null,
    createdAt: '2026-06-01T12:00:00.000Z',
    ...over,
  });

  it('assinatura que termina antes de 12 meses: só os meses em que vale (antes: R$ 478,80 por ano para o que termina em dezembro)', () => {
    // Hoje 07/10/2026; a assinatura começou em junho (primeira conta em 2026-06, número 1) e termina em dezembro: outubro, novembro e dezembro.
    const termina = assinatura({ lastNumber: 7 }); // 2026-06 + 6 meses = 2026-12
    expect(subscriptionYear(termina, DEMO_TODAY)).toEqual({ months: 3, lastMonth: '2026-12' });
    const row = subscriptionRow(termina, DEMO_TODAY);
    expect([row.monthlyCents, row.yearlyCents, row.yearMonths, row.yearEndsIn]).toEqual([3_990, 11_970, 3, '2026-12']);
    expect(SUBSCRIPTION_TEXT.untilMonth(row.yearlyCents, row.yearEndsIn!)).toBe('R$ 119,70 até dezembro de 2026');
    expect(SUBSCRIPTION_TEXT.detailYear(row.yearlyCents, false, row.yearEndsIn)).toBe('Assinatura · R$ 119,70 até dezembro de 2026');
    expect(SUBSCRIPTION_TEXT.detailYear(row.yearlyCents, false, row.yearEndsIn)).not.toContain('478,80');
    expect(SUBSCRIPTION_TEXT.yearSuffix(row.yearEndsIn)).toBe('até dezembro de 2026');
    // Sem término e a assinatura que termina a 12 meses ou mais: "por ano", 12 meses.
    expect(subscriptionYear(assinatura(), DEMO_TODAY)).toEqual({ months: 12, lastMonth: null });
    expect(SUBSCRIPTION_TEXT.yearSuffix(null)).toBe('por ano');
    // Último mês em setembro de 2027: outubro de 2026 a setembro de 2027 são 12 meses; em agosto, 11; em outubro de 2027, 12 (os 12 primeiros).
    expect(subscriptionYear(assinatura({ lastNumber: 16 }), DEMO_TODAY)).toEqual({ months: 12, lastMonth: null });
    expect(subscriptionYear(assinatura({ lastNumber: 15 }), DEMO_TODAY)).toEqual({ months: 11, lastMonth: '2027-08' });
    expect(subscriptionYear(assinatura({ lastNumber: 17 }), DEMO_TODAY)).toEqual({ months: 12, lastMonth: null });
    // No último mês (outubro): 1 mês só.
    expect(subscriptionYear(assinatura({ lastNumber: 5 }), DEMO_TODAY)).toEqual({ months: 1, lastMonth: '2026-10' });
  });

  it('assinatura que ainda não começou conta 12 meses a partir do primeiro mês dela; com término curto, só os meses dela', () => {
    expect(subscriptionYear(assinatura({ firstDueMonth: '2027-06' }), DEMO_TODAY)).toEqual({ months: 12, lastMonth: null });
    // De junho a agosto de 2027: 3 meses (3 × R$ 39,90 = R$ 119,70).
    const curta = assinatura({ firstDueMonth: '2027-06', lastNumber: 3 });
    expect(subscriptionYear(curta, DEMO_TODAY)).toEqual({ months: 3, lastMonth: '2027-08' });
    expect(subscriptionRow(curta, DEMO_TODAY).yearlyCents).toBe(11_970);
  });

  it('o total do grupo soma o por ano de cada uma e diz quantas terminam antes (a demonstração continua em R$ 1.666,80)', async () => {
    const lista = [assinatura({ id: 'a', lastNumber: 7 }), assinatura({ id: 'b', terms: [{ fromNumber: 1, description: 'Academia', category: null, amountCents: 9_900, amountMode: 'fixo', dueDay: 5 }] })];
    expect(subscriptionTotals(lista, DEMO_TODAY)).toEqual({ count: 2, monthlyCents: 13_890, yearlyCents: 11_970 + 118_800, estimatedMonthlyCents: 0, endingCount: 1 });
    expect(SUBSCRIPTION_TEXT.endingNote).toBe('No por ano, as assinaturas com término contam só os meses até o último.');
    const repo = await createDemoRepository();
    const demo = subscriptionTotals(await repo.listSeries((await repo.getSpace())!.personalContextId), DEMO_TODAY);
    expect([demo.monthlyCents, demo.yearlyCents, demo.endingCount]).toEqual([13_890, 166_680, 0]);
    expect(SUBSCRIPTION_TEXT.totals(demo.monthlyCents, demo.yearlyCents)).toBe('R$ 138,90 por mês · R$ 1.666,80 por ano');
  });

  it('parcelamento curto entra uma vez no por mês e nunca é multiplicado; conta do ano fica só na soma por ano', () => {
    const parcelamento = {
      id: 'p',
      kind: 'parcelada',
      firstDueMonth: '2026-10',
      firstNumber: 1,
      lastNumber: 3,
      partsPerYear: null,
      terms: [{ fromNumber: 1, description: 'Geladeira', category: null, amountCents: 50_000, amountMode: 'fixo', dueDay: 5 }],
    } as CommitmentSeries;
    expect(seriesMonthlyTotal([parcelamento], DEMO_TODAY)).toEqual({ totalCents: 50_000, estimatedCents: 0 });
    const texts = seriesTotalsTexts([parcelamento], DEMO_TODAY);
    expect(texts.monthly).toBe('Gastos fixos, parcelamentos e assinaturas: R$ 500,00 por mês, se os valores não mudarem.');
    expect(texts.yearly).toBeNull();
    // Parcelamento não é assinatura: nunca tem "por ano" de assinatura.
    expect(subscriptionTotals([parcelamento as unknown as SubscriptionSeries], DEMO_TODAY).count).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// CL-11: o selo "Demonstração" nos formulários, nos detalhes e em Metas
// ---------------------------------------------------------------------------

describe('CL-11: demonstração visível nos formulários e em Metas', () => {
  it('na demonstração a pílula do contexto diz "Demonstração · Pessoal"; numa conta real, o texto de sempre (antes: "Salvando em Pessoal" nos dois)', () => {
    expect(contextPillText('Salvando em Pessoal', true)).toBe('Demonstração · Pessoal');
    expect(contextPillText('Importando em Pessoal', true)).toBe('Demonstração · Pessoal');
    expect(contextPillText('Pessoal', true)).toBe('Demonstração · Pessoal');
    expect(contextPillText('Família', true)).toBe('Demonstração · Família');
    expect(contextPillText('Salvando em Pessoal', false)).toBe('Salvando em Pessoal');
    expect(contextPillText('Pessoal', false)).toBe('Pessoal');
    expect(DEMO_TEXT.saveNote).toBe('Fica só nesta demonstração, com dados fictícios.');
    expect(DEMO_TEXT.badge).toBe('Demonstração');
    for (const text of [DEMO_TEXT.saveNote, DEMO_TEXT.pill('Pessoal')]) expect(text).not.toMatch(FORBIDDEN);
    // A pílula cabe ao lado do título em 320 px: o texto da demonstração é mais curto que "Demonstração · Salvando em Pessoal".
    expect(contextPillText('Salvando em Pessoal', true).length).toBeLessThanOrEqual(22);
  });

  it('toda tela com contexto fixo passa pela mesma pílula: nenhum "Salvando em" escrito fora de ContextPill', () => {
    const files = [
      'apps/app/src/components/record-form.tsx',
      'apps/app/src/components/commitment-form.tsx',
      'apps/app/src/components/payment-form.tsx',
      'apps/app/src/components/series-form.tsx',
      'apps/app/src/components/goal-form.tsx',
      'apps/app/src/components/card-form.tsx',
      'apps/app/src/components/account-form.tsx',
      'apps/app/src/components/invoice-pay-form.tsx',
      'apps/app/src/components/invoice-entry-form.tsx',
      'apps/app/src/app/meta/nova.tsx',
      'apps/app/src/app/cartoes/novo.tsx',
      'apps/app/src/app/importar/index.tsx',
      'apps/app/src/components/import-flow.tsx',
    ];
    for (const file of files) {
      const source = read(file);
      const lines = source.split('\n').filter((l) => l.includes('Salvando em') || l.includes('Importando em'));
      for (const line of lines) expect(line, `${file}: ${line.trim()}`).toMatch(/ContextPill|^\s*(\/\/|\*|\/\*)/);
    }
    const header = read('apps/app/src/components/header.tsx');
    expect(header).toContain('contextPillText(label, demo)');
    expect(header).toContain("auth.mode === 'demo'");
  });

  it('formulários de gasto e de gasto fixo avisam, na linha final, que nada sai da demonstração; Metas mostra o contexto', () => {
    for (const file of ['apps/app/src/components/record-form.tsx', 'apps/app/src/components/series-form.tsx']) {
      const source = read(file);
      expect(source, file).toContain('DEMO_TEXT.saveNote');
      expect(source, file).toContain("auth.mode === 'demo'");
    }
    const metas = read('apps/app/src/app/(tabs)/metas.tsx');
    expect(metas).toContain('<AppHeader title={GOALS_TEXT.tabTitle} context="Pessoal" />');
    // A conta real com o e-mail da demonstração não esconde "Primeiros passos".
    expect(read('apps/app/src/components/primeiros-passos.tsx')).toContain("const demoWithData = auth.mode === 'demo' && user?.email === DEMO_EMAIL;");
  });
});

// ---------------------------------------------------------------------------
// CL-03 e CL-19: resultado incerto e a tentativa guardada fora do formulário
// ---------------------------------------------------------------------------

describe('CL-03 e CL-19: resultado incerto', () => {
  const OCT = '2026-10';
  const despesa = { amountCents: 8_000, occurredOn: '2026-10-07', description: 'Farmácia', category: 'Saúde' };

  async function conta() {
    const repo = new MemoryRepository({ actorId: 'pessoa-teste', displayName: 'Pessoa de teste', today: () => DEMO_TODAY });
    const space = await repo.ensurePersonalSpace('Conta principal');
    return { repo, ctx: space.personalContextId, accountId: space.accounts[0]!.id };
  }

  it('o texto de resultado incerto manda conferir antes de anotar de novo (antes: "Não foi possível salvar. Seu preenchimento foi mantido. Tente novamente.")', () => {
    expect(UNCERTAIN_TEXT.movimentos).toBe('Não deu para confirmar se salvou. Confira em Movimentos antes de anotar de novo.');
    for (const [area, text] of Object.entries(UNCERTAIN_TEXT)) {
      expect(text, area).toMatch(/^Não deu para confirmar se salvou\. Confira em [A-Za-zÀ-ú ]+ antes de (anotar|tentar) de novo\.$/);
      expect(text, area).not.toMatch(FORBIDDEN);
      expect(text, area).not.toContain('Não foi possível salvar');
    }
    // As telas de gravação mostram o texto novo nos caminhos de rede incerta (e só neles).
    for (const file of ['record-form', 'commitment-form', 'payment-form', 'series-form', 'goal-form', 'card-form', 'account-form', 'invoice-pay-form']) {
      expect(read(`apps/app/src/components/${file}.tsx`), file).toContain('UNCERTAIN_TEXT.');
    }
  });

  it('resposta perdida depois de gravar, sair do formulário e anotar de novo o mesmo gasto: um registro só (antes: dois)', async () => {
    const { repo, ctx, accountId } = await conta();
    const input = { ...despesa, accountId };
    const snapshot = JSON.stringify([input, 0]);
    const send = (k: string) => repo.createRecord(k, ctx, 'despesa', input);
    const find = (k: string) => repo.findOperation(k);

    // ANTES: cada visita ao formulário abria com uma chave nova, e a segunda anotação duplicava.
    const antes = await conta();
    const semMemoria1 = slotKeys(newAttemptSlot(), (k) => antes.repo.findOperation(k));
    antes.repo.failNextWrite = 'depois';
    expect((await guardedWrite(semMemoria1, snapshot, (k) => antes.repo.createRecord(k, antes.ctx, 'despesa', { ...despesa, accountId: antes.accountId }))).status).toBe('uncertain');
    const semMemoria2 = slotKeys(newAttemptSlot(), (k) => antes.repo.findOperation(k));
    const duplicou = await guardedWrite(semMemoria2, snapshot, (k) => antes.repo.createRecord(k, antes.ctx, 'despesa', { ...despesa, accountId: antes.accountId }));
    expect(duplicou.status).toBe('ok');
    expect(await antes.repo.listRecords(antes.ctx, OCT)).toHaveLength(2);

    // DEPOIS: a tentativa fica na memória do app, por pessoa e por formulário.
    const store = new PendingAttemptStore();
    const visita1 = slotKeys(store.adopt('pessoa-teste', 'registro:novo:despesa'), find);
    repo.failNextWrite = 'depois';
    expect((await guardedWrite(visita1, snapshot, send)).status).toBe('uncertain');
    expect(await repo.listRecords(ctx, OCT)).toHaveLength(1); // gravou, mas a resposta se perdeu
    expect(store.count('pessoa-teste')).toBe(1);
    // A pessoa sai do formulário, reabre e anota o mesmo gasto: confere antes de enviar e mostra como concluído.
    const visita2 = slotKeys(store.adopt('pessoa-teste', 'registro:novo:despesa'), find);
    expect(visita2.hasPending(snapshot)).toBe(true);
    const r2 = await guardedWrite(visita2, snapshot, send);
    expect(r2.status).toBe('reconciled');
    expect(await repo.listRecords(ctx, OCT)).toHaveLength(1);
    expect(store.count('pessoa-teste')).toBe(0);
    // Salvar uma terceira vez, depois de resolvido, é uma anotação nova (outra chave): o app não bloqueia gastos iguais de verdade.
    const visita3 = slotKeys(store.adopt('pessoa-teste', 'registro:novo:despesa'), find);
    expect((await guardedWrite(visita3, snapshot, send)).status).toBe('ok');
    expect(await repo.listRecords(ctx, OCT)).toHaveLength(2);
    repo.checkInvariants();
  });

  it('outro conteúdo depois de sair do formulário é outro gasto: a tentativa guardada não é aproveitada nem sobrescrita', async () => {
    const { repo, ctx, accountId } = await conta();
    const store = new PendingAttemptStore();
    const find = (k: string) => repo.findOperation(k);
    const a = { ...despesa, accountId };
    const visita1 = slotKeys(store.adopt('pessoa-teste', 'registro:novo:despesa'), find);
    repo.failNextWrite = 'depois';
    await guardedWrite(visita1, JSON.stringify([a, 0]), (k) => repo.createRecord(k, ctx, 'despesa', a));
    // A pessoa volta e anota outra coisa (outro valor e outra descrição).
    const b = { ...despesa, accountId, amountCents: 2_500, description: 'Lanche' };
    const visita2 = slotKeys(store.adopt('pessoa-teste', 'registro:novo:despesa'), find);
    expect(visita2.hasPending(JSON.stringify([b, 0]))).toBe(false);
    expect((await guardedWrite(visita2, JSON.stringify([b, 0]), (k) => repo.createRecord(k, ctx, 'despesa', b))).status).toBe('ok');
    const lista = await repo.listRecords(ctx, OCT);
    expect(lista.map((r) => [r.description, r.amountCents]).sort()).toEqual([['Farmácia', 8_000], ['Lanche', 2_500]]);
    repo.checkInvariants();
  });

  it('a tentativa de uma pessoa nunca aparece para outra, e some ao sair da conta; formulários diferentes não se misturam', () => {
    const store = new PendingAttemptStore();
    const ana = store.adopt('ana', 'registro:novo:despesa');
    ana.pending.push({ key: 'k1', snapshot: 's1' });
    expect(store.adopt('beto', 'registro:novo:despesa').pending).toEqual([]);
    expect(store.adopt('ana', 'registro:novo:receita').pending).toEqual([]);
    expect(store.adopt('ana', 'registro:novo:despesa').pending).toEqual([{ key: 'k1', snapshot: 's1', carried: true }]);
    expect(store.peek('ana', 'conta-a-pagar:nova')).toBeNull();
    expect(store.count()).toBe(1);
    store.clear('beto');
    expect(store.count('ana')).toBe(1);
    store.clear();
    expect(store.count()).toBe(0);
    expect(store.peek('ana', 'registro:novo:despesa')).toBeNull();
  });

  it('criação de meta com resposta perdida: sair e criar de novo a mesma meta não cria duas', async () => {
    const { repo, ctx } = await conta();
    const input = { goalType: 'objetivo', name: 'Viagem', targetCents: 600_000, targetMonth: null, plannedMonthlyCents: null, essentialBaseCents: null, essentialMonths: null, essentialBaseSource: null, initialCents: null, initialOn: null } as const;
    const store = new PendingAttemptStore();
    const find = (k: string) => repo.findGoalOperation(k);
    const snapshot = JSON.stringify([null, 0, input]);
    repo.failNextWrite = 'depois';
    expect((await guardedWrite(slotKeys(store.adopt('pessoa-teste', 'meta:nova'), find), snapshot, (k) => repo.createGoal(k, ctx, input))).status).toBe('uncertain');
    const r = await guardedWrite(slotKeys(store.adopt('pessoa-teste', 'meta:nova'), find), snapshot, (k) => repo.createGoal(k, ctx, input), (s) => s.action === 'criar_meta');
    expect(r.status).toBe('reconciled');
    expect(await repo.listGoals(ctx)).toHaveLength(1);
  });

  it('a conta a pagar anotada com resposta perdida também não duplica ao reabrir o formulário', async () => {
    const { repo, ctx } = await conta();
    const input = { description: 'Internet', amountCents: 15_000, dueOn: '2026-10-15', category: 'Moradia' };
    const store = new PendingAttemptStore();
    const find = (k: string) => repo.findCommitmentOperation(k);
    const snapshot = JSON.stringify([input, 0]);
    repo.failNextWrite = 'depois';
    await guardedWrite(slotKeys(store.adopt('pessoa-teste', 'conta-a-pagar:nova'), find), snapshot, (k) => repo.createCommitment(k, ctx, input));
    const r = await guardedWrite(slotKeys(store.adopt('pessoa-teste', 'conta-a-pagar:nova'), find), snapshot, (k) => repo.createCommitment(k, ctx, input), (s) => s.action === 'criar_compromisso');
    expect(r.status).toBe('reconciled');
    expect(await repo.listCommitments(ctx, OCT)).toHaveLength(1);
  });

  it('depois de gravar, a chave usada nunca volta: o formulário seguinte, com outro conteúdo, grava sem chave_reutilizada', async () => {
    const { repo, ctx, accountId } = await conta();
    const store = new PendingAttemptStore();
    const visita1 = store.adopt('pessoa-teste', 'registro:novo:despesa');
    const primeira = visita1.current;
    await repo.createRecord(visita1.current, ctx, 'despesa', { ...despesa, accountId });
    settleSlot(visita1);
    expect(visita1.pending).toEqual([]);
    expect(visita1.current).not.toBe(primeira);
    const visita2 = store.adopt('pessoa-teste', 'registro:novo:despesa');
    expect(visita2.current).not.toBe(primeira);
    await repo.createRecord(visita2.current, ctx, 'despesa', { ...despesa, accountId, amountCents: 1_000, description: 'Outro gasto' });
    expect(await repo.listRecords(ctx, OCT)).toHaveLength(2);
    // Sem trocar a chave (o erro que isto evita), o banco recusaria o segundo gasto.
    await expect(repo.createRecord(primeira, ctx, 'despesa', { ...despesa, accountId, amountCents: 1_000, description: 'Outro gasto' })).rejects.toMatchObject({ code: 'chave_reutilizada' });
    repo.checkInvariants();
  });

  it('o mesmo gravar, sem queda de rede, não muda: ok, a próxima anotação usa outra chave', async () => {
    const { repo, ctx, accountId } = await conta();
    const slot = newAttemptSlot();
    const keys = slotKeys(slot, (k) => repo.findOperation(k));
    const input = { ...despesa, accountId };
    const first = slot.current;
    expect((await guardedWrite(keys, 's', (k) => repo.createRecord(k, ctx, 'despesa', input))).status).toBe('ok');
    expect(slot.current).not.toBe(first);
    expect(slot.pending).toEqual([]);
    expect(key()).not.toBe(key());
  });
});

// ---------------------------------------------------------------------------
// CL-07: "Paga em parte" e "Vencida" iguais em todas as telas
// ---------------------------------------------------------------------------

describe('CL-07: situação da fatura nas telas do cartão e em Contas a pagar', () => {
  const NOV = '2026-11';
  const DEC = '2026-12';

  /** Cartão que fecha dia 3 e vence dia 10, com a fatura de novembro de R$ 530,00 e a de dezembro de R$ 350,00. */
  async function cartao(today: IsoDate) {
    const clock = { today };
    const repo = new MemoryRepository({ actorId: 'pessoa-teste', displayName: 'Pessoa de teste', today: () => clock.today });
    const space = await repo.ensurePersonalSpace('Conta principal');
    const ctx = space.personalContextId;
    const { card } = await repo.createCard(key(), ctx, { name: 'Nubank', lastDigits: '1234', closingDay: 3, dueDay: 10, limitCents: 500_000 });
    await repo.addCardPurchase(key(), card.id, { description: 'Compras de outubro', category: 'Mercado', purchasedOn: '2026-10-05', totalCents: 53_000, installments: 1 });
    clock.today = '2026-11-05';
    await repo.addCardPurchase(key(), card.id, { description: 'Compras de novembro', category: 'Lazer', purchasedOn: '2026-11-05', totalCents: 35_000, installments: 1 });
    clock.today = today;
    return { repo, ctx, card, clock };
  }
  const faturas = async (c: Awaited<ReturnType<typeof cartao>>, today: IsoDate) => loadInvoices(c.repo, (await c.repo.getCard(c.card.id))!, today);

  it('fatura fechada e não paga depois do vencimento é "Vencida" na tela do cartão; antes do vencimento, "Fechada" (antes: "Fechada" sempre)', async () => {
    const c = await cartao('2026-11-08');
    const antes = (await faturas(c, '2026-11-08')).find((i) => i.month === NOV)!;
    expect([antes.situation, antes.overdue, invoiceTexts(antes, '2026-11-08').situation]).toEqual(['fechada', false, 'Fechada']);
    const venceHoje = (await faturas(c, '2026-11-10')).find((i) => i.month === NOV)!;
    expect(venceHoje.overdue).toBe(false); // vence hoje ainda não é vencida (como nas contas)
    const depois = (await faturas(c, '2026-11-11')).find((i) => i.month === NOV)!;
    // A situação do banco continua "fechada": a fatura vencida ainda pode ser paga.
    expect([depois.situation, depois.overdue, invoiceSituationLabel(depois), invoiceTexts(depois, '2026-11-11').situation]).toEqual(['fechada', true, 'Vencida', 'Vencida']);
    expect(invoiceTexts(depois, '2026-11-11').a11yLabel).toBe('Fatura de novembro, vencida, R$ 530,00. Fechou em 03/11. Venceu em 10/11.');
    // Na lista de cartões, a fatura fechada passa a dizer "vencida" depois do vencimento.
    const resumo = cardSummaryTexts({ card: (await c.repo.getCard(c.card.id))!, current: depois, closedUnpaid: [depois], limitUsedCents: 0, limitLeftCents: null } as never, '2026-11-11');
    expect(resumo.closed).toEqual(['Fatura vencida de novembro: R$ 530,00. Venceu em 10/11']);
    // Aberta, paga e paga em parte não são vencidas.
    const aberta = (await faturas(c, '2026-11-11')).find((i) => i.month === DEC)!;
    expect([aberta.overdue, invoiceTexts(aberta, '2026-11-11').situation]).toEqual([false, 'Aberta']);
  });

  it('conta da fatura paga em parte: "Paga em parte" em Contas a pagar, igual à tela da fatura (antes: "Paga em 08/11/2026")', async () => {
    const c = await cartao('2026-11-08');
    const nov = (await faturas(c, '2026-11-08')).find((i) => i.month === NOV)!;
    const pago = await c.repo.payInvoice(key(), c.card.id, NOV, nov.commitmentVersion!, 30_000, '2026-11-08');
    // Tela da fatura.
    const fatura = (await faturas(c, '2026-11-08')).find((i) => i.month === NOV)!;
    expect(invoiceTexts(fatura, '2026-11-08').situation).toBe('Paga em parte');
    // Contas a pagar: a conta da fatura e a legenda da linha.
    const conta = (await c.repo.listInvoiceCommitments(c.card.id)).find((x) => x.invoice!.month === NOV)!;
    expect(conta.amountCents).toBe(53_000);
    expect(conta.payment!.amountCents).toBe(30_000);
    expect(isPartialInvoicePayment(conta)).toBe(true);
    expect(commitmentSituation(conta, '2026-11-08')).toBe('paga_em_parte');
    expect(dueText(conta, '2026-11-08')).toBe('Paga em parte em 08/11/2026 · R$ 230,00 foram para a fatura de dezembro');
    expect(dueText(conta, '2026-11-08')).not.toBe('Paga em 08/11/2026');
    expect(pago.entry).toMatchObject({ kind: 'saldo_anterior', amountCents: 23_000 });
    // O valor pago e os totais: Pago de novembro R$ 300,00; dezembro com saldo anterior de R$ 230,00 e total de R$ 580,00.
    const totals = summarizeMonth(await c.repo.listRecords(c.ctx, NOV), c.ctx, NOV);
    expect([totals.paidCents, totals.differenceCents]).toEqual([30_000, -30_000]);
    const dez = (await faturas(c, '2026-11-08')).find((i) => i.month === DEC)!;
    expect([dez.balanceCents, dez.totalCents]).toEqual([23_000, 58_000]);
    // Renda comprometida: novembro R$ 300,00 (o valor pago) e dezembro R$ 580,00; a soma, R$ 880,00 = R$ 530,00 + R$ 350,00.
    const refs = await c.repo.listIncomeReferences(c.ctx);
    const comprometido = async (m: string) => summarizeCommitted(await c.repo.listCommitments(c.ctx, m), c.ctx, m, '2026-11-08', refs, []).committedCents;
    expect([await comprometido(NOV), await comprometido(DEC)]).toEqual([30_000, 58_000]);
    expect((await comprometido(NOV)) + (await comprometido(DEC))).toBe(53_000 + 35_000);
  });

  it('fatura paga por inteiro continua "Paga em 08/11/2026"; conta comum paga por menos que o previsto também (só fatura é "em parte")', async () => {
    const c = await cartao('2026-11-08');
    const nov = (await faturas(c, '2026-11-08')).find((i) => i.month === NOV)!;
    await c.repo.payInvoice(key(), c.card.id, NOV, nov.commitmentVersion!, 53_000, '2026-11-08');
    const conta = (await c.repo.listInvoiceCommitments(c.card.id)).find((x) => x.invoice!.month === NOV)!;
    expect([commitmentSituation(conta, '2026-11-08'), dueText(conta, '2026-11-08')]).toEqual(['paga', 'Paga em 08/11/2026']);
    // Conta comum: pagar R$ 90,00 de uma de R$ 100,00 quita a conta inteira.
    const avulsa = await c.repo.createCommitment(key(), c.ctx, { description: 'Água', amountCents: 10_000, dueOn: '2026-11-08', category: 'Moradia' });
    const paga = await c.repo.payCommitment(key(), avulsa.commitment.id, avulsa.commitment.version, { accountId: (await c.repo.getSpace())!.accounts[0]!.id, amountCents: 9_000, paidOn: '2026-11-08', category: 'Moradia' });
    expect([commitmentSituation(paga.commitment, '2026-11-08'), dueText(paga.commitment, '2026-11-08')]).toEqual(['paga', 'Paga em 08/11/2026']);
  });

  it('as telas usam as mesmas palavras: o rótulo da linha e do detalhe vem de commitmentSituation, e o do cartão de invoiceTexts', () => {
    const row = read('apps/app/src/components/commitment-row.tsx');
    expect(row).toContain("label: 'Paga em parte'");
    expect(row).toContain("label: 'Vencida'");
    expect(read('apps/app/src/app/a-pagar/[id]/index.tsx')).toContain('dueText(c, today)');
    expect(read('packages/core/src/cards.ts')).toContain("export const INVOICE_OVERDUE_LABEL = 'Vencida';");
    expect(buildInvoices).toBeTypeOf('function');
  });
});

// ---------------------------------------------------------------------------
// CL-09: a reserva diz o que conta, desde quando e como arredonda
// ---------------------------------------------------------------------------

describe('CL-09: explicações da reserva para imprevistos', () => {
  it('card, detalhe e base dizem "sem rendimentos", o mês de partida, o arredondamento para baixo e o que fica fora (demonstração, T10)', async () => {
    const repo = await createDemoRepository();
    const ctx = (await repo.getSpace())!.personalContextId;
    const reserve = (await repo.listGoals(ctx)).find((g) => g.goalType === 'emergencia')!;
    const movements = await repo.listGoalMovementsInMonth(ctx, '2026-10');
    // Antes: "Planejado: R$ 500,00 por mês" no card.
    expect(reserveCardTexts(reserve)).toMatchObject({
      amounts: 'R$ 3.500,00 de R$ 22.500,00',
      percent: '15%',
      coverage: 'Cobre 0,9 mês dos seus gastos essenciais',
      planned: 'Planejado: R$ 500,00 por mês, sem contar rendimentos',
      rounding: 'O percentual e os meses cobertos são arredondados para baixo.',
    });
    const plan = goalPlan(reserve, movements, DEMO_TODAY);
    // Antes: "Planejado: R$ 500,00 por mês · chega lá em dezembro de 2029".
    expect(goalCardCaption(plan)).toBe('Planejado: R$ 500,00 por mês · chega lá em dezembro de 2029, sem contar rendimentos');
    // Antes: "Você planejou guardar R$ 500,00 por mês. Nesse ritmo, chega lá em dezembro de 2029."
    const detail = goalDetailTexts(reserve, await repo.listGoalMovements(reserve.id), DEMO_TODAY);
    expect(detail.planned).toBe('Você planejou guardar R$ 500,00 por mês. Contando a partir de novembro de 2026, sem rendimentos, chega lá em dezembro de 2029.');
    expect(detail.rounding).toBe(GOALS_TEXT.roundingNote);
    expect(detail.coverage).toBe('Cobre 0,9 mês dos seus gastos essenciais');
    // Base: só o que foi pago, o número de meses e o que fica de fora. Antes: "Média de setembro de 2026 em Moradia e Mercado. Lazer e gastos sem categoria não entram."
    const months = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'];
    const records = (await Promise.all(months.map((m) => repo.listRecords(ctx, m)))).flat();
    expect(essentialEstimateText(essentialMonthly(records, '2026-10', 315_000))).toBe(
      'Média do que foi pago em setembro de 2026 em Moradia e Mercado (1 mês com gastos anotados). Contas ainda não pagas, Lazer e gastos sem categoria não entram.',
    );
    for (const text of [detail.planned!, detail.rounding!, GOALS_TEXT.plannedShort(50_000), GOALS_TEXT.cardPlanned(50_000, '2029-12'), GOALS_TEXT.reserve.essentialsAverage(['2026-07', '2026-09'], ['Moradia'])]) {
      expect(text).not.toMatch(FORBIDDEN);
    }
  });

  it('o mês de partida acompanha o aporte do mês: sem aporte em outubro, o plano conta desde outubro; com aporte, desde novembro', async () => {
    const repo = await createDemoRepository();
    const ctx = (await repo.getSpace())!.personalContextId;
    const reserve = (await repo.listGoals(ctx)).find((g) => g.goalType === 'emergencia')!;
    const all = await repo.listGoalMovements(reserve.id);
    const semAporte = all.filter((m) => !(m.kind === 'aporte' && m.occurredOn.startsWith('2026-10')));
    expect(goalDetailTexts(reserve, semAporte, DEMO_TODAY).planned).toContain('Contando a partir de outubro de 2026');
    expect(goalDetailTexts(reserve, all, DEMO_TODAY).planned).toContain('Contando a partir de novembro de 2026');
    // Mudar o plano não mexe no guardado (intenção, não movimento): continua R$ 3.500,00.
    expect(reserve.savedCents).toBe(350_000);
  });

  it('as telas mostram a nota do arredondamento no card (aba Metas) e no detalhe da reserva', () => {
    expect(read('apps/app/src/components/goal-cards.tsx')).toContain('{t.rounding}');
    expect(read('apps/app/src/app/meta/[id]/index.tsx')).toContain('reserve ? t.rounding : null');
  });
});
