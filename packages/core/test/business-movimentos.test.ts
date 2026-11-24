import { describe, expect, it } from 'vitest';
import {
  BUSINESS_BUDGET_CATEGORIES,
  BUSINESS_CATEGORIES,
  BUSINESS_ERROR_TEXT,
  BUSINESS_OUTSIDE_CATEGORIES,
  BUSINESS_PROFILES,
  BUSINESS_PROFILE_LABEL,
  BUSINESS_PROFILE_NONE_LABEL,
  BUSINESS_TEXT,
  CATEGORIES,
  CONTRIBUTION_BUSINESS_CATEGORY,
  CONTRIBUTION_PERSONAL_CATEGORY,
  DEMO_BUSINESS_NAME,
  MEI_ANNUAL_LIMIT_CENTS,
  MEI_MONTHLY_LIMIT_CENTS,
  MemoryBusinessHub,
  MemoryRepository,
  RepoError,
  WITHDRAWAL_BUSINESS_CATEGORY,
  budgetCategoriesFor,
  businessErrorText,
  businessFlowOf,
  businessMonth,
  businessMonths,
  businessPairKind,
  businessProfileOf,
  businessTopOut,
  businessYear,
  barModeFor,
  budgetLinesToKeep,
  isBudgetCategoryName,
  contextCategories,
  contributionDescriptions,
  createDemoRepository,
  guideEntry,
  isBusinessAction,
  isBusinessProfile,
  meiLimit,
  newOperationKey,
  summarizeMonth,
  type FinancialRecord,
} from '../src';

/**
 * Espaço Negócio, D-121 (24/11/2026, a partir da pesquisa de 18/11): movimentos fora da operação, "Trazer dinheiro do Pessoal", o tipo do
 * negócio, as categorias novas, o limite do MEI e o resumo do ano. As mesmas regras da migração 0044.
 */

/** Termos que nenhum texto do app usa (o mesmo critério de copy.test.ts), travessões e a expressão proibida. */
const FORBIDDEN =
  /\b(recomendamos|recomendo|invista|aplique|tesouro|cdb|lci|lca|caixinha|cofrinho)\b|fundo de investimento|rentabilidade garantida|rendimento garantido|retorno garantido|enriquec|faz(er|endo)?\s+sentido|[\u2013\u2014]/i;
/** Julgamento, pressão e alerta: o negócio e o limite do MEI são mostrados só com fatos. */
const JUDGMENT = /\b(preju[ií]zo|lucro|cuidado|aten[cç][aã]o|alerta|ruim|bom|ótimo|parab[eé]ns|deveria|precisa|ultrapass|estourou|perigo)\b/i;
/** Nada de chamar o resumo de livro-caixa nem de declaração pronta, e nada de dizer o que declarar ou pagar. */
const NOT_TAX = /livro[- ]caixa|declara[cç][aã]o pronta|declare\b|pague\b|voc[eê] deve (declarar|pagar)/i;

const rec = (over: Partial<FinancialRecord>): FinancialRecord => ({
  id: over.id ?? `r-${Math.random().toString(36).slice(2, 10)}`,
  contextId: 'neg',
  accountId: 'acc',
  kind: 'despesa',
  status: 'realizado',
  amountCents: 1000,
  currency: 'BRL',
  occurredOn: '2026-10-05',
  description: 'x',
  category: null,
  commitmentId: null,
  invoice: null,
  receiptKey: null,
  createdBy: 'p',
  version: 1,
  createdAt: '2026-10-05T12:00:00.000Z',
  updatedAt: '2026-10-05T12:00:00.000Z',
  ...over,
});

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return 'passou';
  } catch (e) {
    return e instanceof RepoError ? e.code : String(e);
  }
};

/** Todos os textos de BUSINESS_TEXT, chamando as funções com valores de exemplo. */
function allTexts(): string[] {
  const samples: unknown[][] = [
    ['Sacolé da Mãe'],
    [12_345],
    [-12_345],
    [12_345, true, true],
    [-12_345, true, false],
    [2026],
    [2026, true],
    [meiLimit(2026, 6_000_000, 480_000)],
    [meiLimit(2026, 9_000_000, 0)],
    [{ kind: 'receita', category: CONTRIBUTION_BUSINESS_CATEGORY, cents: 50_000 }],
    [{ kind: 'despesa', category: 'Equipamento', cents: 120_000 }],
    ['Contas do ponto'],
    ['Equipamento'],
  ];
  return Object.values(BUSINESS_TEXT).flatMap((v) => {
    if (typeof v === 'string') return [v];
    if (typeof v !== 'function') return [];
    return samples.flatMap((args) => {
      try {
        const out = (v as (...a: unknown[]) => unknown)(...args);
        return typeof out === 'string' && !out.includes('undefined') && !out.includes('NaN') ? [out] : [];
      } catch {
        return [];
      }
    });
  });
}

describe('categorias (D-121)', () => {
  it('as novas de saída antes de "Outras saídas" e as de fora da operação no fim; o orçamento continua com as 9 de sempre', () => {
    // Decisão de 24/11/2026: a 0044 não muda o orçamento do negócio (o app publicado só lê as 9); as 3 saídas novas se anotam, mas entram
    // no orçamento numa migração depois.
    expect(BUSINESS_BUDGET_CATEGORIES).toEqual([
      'Material e mercadoria',
      'Peças e ferramentas',
      'Combustível e transporte',
      'Funcionários e ajudantes',
      'Impostos e DAS',
      'Aluguel do ponto',
      'Contas do ponto',
      'Taxas e maquininha',
      'Outras saídas',
    ]);
    for (const c of ['Divulgação', 'Contabilidade e sistemas', 'Juros e multas']) {
      expect(contextCategories('negocio', 'despesa')).toContain(c);
      expect(BUSINESS_BUDGET_CATEGORIES).not.toContain(c);
    }
    expect(contextCategories('negocio', 'despesa').indexOf('Juros e multas')).toBe(contextCategories('negocio', 'despesa').indexOf('Outras saídas') - 1);
    expect(budgetCategoriesFor('negocio')).toBe(BUSINESS_BUDGET_CATEGORIES);
    expect(budgetCategoriesFor('pessoal')).toBe(CATEGORIES.despesa);
    expect(budgetCategoriesFor('familia')).toBe(CATEGORIES.despesa);
    // As de fora da operação são de escolha (menos o dinheiro trazido do Pessoal, que só a ação grava) e ficam fora do orçamento.
    expect(BUSINESS_OUTSIDE_CATEGORIES).toEqual({ receita: ['Dinheiro do Pessoal', 'Empréstimo recebido'], despesa: ['Parcela de empréstimo', 'Equipamento'] });
    expect(contextCategories('negocio', 'receita')).toContain('Empréstimo recebido');
    for (const c of BUSINESS_OUTSIDE_CATEGORIES.despesa) {
      expect(contextCategories('negocio', 'despesa')).toContain(c);
      expect(BUSINESS_BUDGET_CATEGORIES).not.toContain(c);
    }
    // Os dois lados do dinheiro trazido do Pessoal nunca aparecem nas escolhas (nem no negócio, nem no Pessoal).
    for (const kind of ['receita', 'despesa'] as const) {
      for (const ctx of ['negocio', 'pessoal', 'familia'] as const) {
        expect(contextCategories(ctx, kind)).not.toContain(CONTRIBUTION_BUSINESS_CATEGORY);
        expect(contextCategories(ctx, kind)).not.toContain(CONTRIBUTION_PERSONAL_CATEGORY);
        expect(contextCategories(ctx, kind)).not.toContain(WITHDRAWAL_BUSINESS_CATEGORY);
      }
    }
    for (const c of [...BUSINESS_CATEGORIES.receita, ...BUSINESS_CATEGORIES.despesa, CONTRIBUTION_BUSINESS_CATEGORY, CONTRIBUTION_PERSONAL_CATEGORY]) {
      expect([...c].length).toBeLessThanOrEqual(40);
    }
  });

  it('a ajuda das categorias: "Contas do ponto" cobre a parte da casa usada no trabalho; as de fora da operação dizem por quê', () => {
    expect(BUSINESS_TEXT.categoryHint('Contas do ponto')).toBe('Luz, água, internet e gás do ponto, ou da parte da casa usada no trabalho.');
    for (const c of [...BUSINESS_OUTSIDE_CATEGORIES.despesa, 'Empréstimo recebido']) expect(BUSINESS_TEXT.categoryHint(c)).toContain('Fica fora da operação');
    for (const c of ['Divulgação', 'Contabilidade e sistemas', 'Juros e multas']) expect(BUSINESS_TEXT.categoryHint(c)).toBeTruthy();
    expect(BUSINESS_TEXT.categoryHint('Vendas')).toBeNull();
    expect(BUSINESS_TEXT.categoryHint(null)).toBeNull();
  });
});

describe('Seu negócio: a operação, fora da operação e o que ficou no negócio (D-121)', () => {
  const list = [
    rec({ kind: 'receita', amountCents: 120_000, category: 'Vendas' }),
    rec({ kind: 'receita', amountCents: 30_000, category: 'Serviços' }),
    rec({ amountCents: 40_000, category: 'Material e mercadoria' }),
    rec({ amountCents: 5_000, category: 'Divulgação' }),
    rec({ kind: 'receita', amountCents: 50_000, category: CONTRIBUTION_BUSINESS_CATEGORY, pairedRecordId: 'p1' }),
    rec({ kind: 'receita', amountCents: 200_000, category: 'Empréstimo recebido' }),
    rec({ amountCents: 25_000, category: 'Parcela de empréstimo' }),
    rec({ amountCents: 90_000, category: 'Equipamento' }),
    rec({ amountCents: 20_000, category: WITHDRAWAL_BUSINESS_CATEGORY, pairedRecordId: 'p2' }),
    rec({ amountCents: 1_000, category: 'Equipamento', status: 'previsto' as FinancialRecord['status'] }),
  ];

  it('cada lançamento no seu lugar: a operação, fora dela e as retiradas', () => {
    expect(businessFlowOf(rec({ kind: 'receita', category: 'Vendas' }))).toBe('operacao');
    expect(businessFlowOf(rec({ kind: 'receita', category: 'Empréstimo recebido' }))).toBe('fora');
    expect(businessFlowOf(rec({ kind: 'receita', category: CONTRIBUTION_BUSINESS_CATEGORY }))).toBe('fora');
    // A entrada ligada no negócio é o dinheiro trazido do Pessoal, mesmo sem a categoria; e continua fora depois de desligada.
    expect(businessFlowOf(rec({ kind: 'receita', category: null, pairedRecordId: 'x' }))).toBe('fora');
    expect(businessFlowOf(rec({ category: 'Equipamento' }))).toBe('fora');
    expect(businessFlowOf(rec({ category: 'Parcela de empréstimo' }))).toBe('fora');
    expect(businessFlowOf(rec({ category: WITHDRAWAL_BUSINESS_CATEGORY }))).toBe('retirada');
    expect(businessFlowOf(rec({ category: null, pairedRecordId: 'x' }))).toBe('retirada');
    expect(businessFlowOf(rec({ category: 'Juros e multas' }))).toBe('operacao');
    // Uma categoria de entrada como gasto (não existe, mas a regra é por tipo): continua na operação.
    expect(businessFlowOf(rec({ category: 'Empréstimo recebido' }))).toBe('operacao');
  });

  it('Entrou, Saiu e Sobrou só da operação; fora da operação à parte; Ficou no negócio soma tudo e bate com a Diferença do Resumo', () => {
    const m = businessMonth(list, 'neg', '2026-10');
    expect(m).toEqual({
      month: '2026-10',
      inCents: 150_000,
      outCents: 45_000,
      leftCents: 105_000,
      outsideInCents: 250_000,
      outsideOutCents: 115_000,
      outside: [
        { kind: 'receita', category: 'Dinheiro do Pessoal', cents: 50_000 },
        { kind: 'receita', category: 'Empréstimo recebido', cents: 200_000 },
        { kind: 'despesa', category: 'Parcela de empréstimo', cents: 25_000 },
        { kind: 'despesa', category: 'Equipamento', cents: 90_000 },
      ],
      withdrawnCents: 20_000,
      keptCents: 105_000 + 250_000 - 115_000 - 20_000,
      recordCount: 9,
    });
    // No Resumo, em Movimentos e nas Análises nada muda: o dinheiro entrou ou saiu de verdade.
    const s = summarizeMonth(list, 'neg', '2026-10');
    expect([s.receivedCents, s.paidCents, s.differenceCents]).toEqual([400_000, 180_000, m.keptCents]);
    // As maiores saídas: só as da operação.
    expect(businessTopOut(list, 'neg', '2026-10').map((l) => [l.category, l.cents])).toEqual([
      ['Material e mercadoria', 40_000],
      ['Divulgação', 5_000],
    ]);
    // As frases: a do mês é da operação; a do que ficou diz que conta com o de fora da operação.
    expect(BUSINESS_TEXT.keptLine(m.keptCents, true, true)).toBe('Ficou no negócio, com o que ficou fora da operação e depois das retiradas: R$ 2.200,00.');
    expect(BUSINESS_TEXT.keptLine(30_000, true, false)).toBe('Ficou no negócio, com o que ficou fora da operação: R$ 300,00.');
    expect(BUSINESS_TEXT.keptLine(-30_000, true, false)).toBe('Com o que ficou fora da operação, saiu R$ 300,00 a mais do que entrou.');
    // Sem nada fora da operação, as frases de sempre (D-113).
    expect(BUSINESS_TEXT.keptLine(4_200)).toBe('Ficou no negócio, depois das retiradas: R$ 42,00.');
    expect(BUSINESS_TEXT.keptLine(-4_200)).toBe('Depois das retiradas, saiu R$ 42,00 a mais do que entrou.');
    expect(BUSINESS_TEXT.outsideA11y(m.outside[3]!)).toBe('Equipamento: saiu R$ 900,00, fora da operação');
  });

  it('os últimos meses e a frase do período ficam com a operação', () => {
    const months = businessMonths(list, 'neg', '2026-10', 2);
    expect(months.map((m) => m.leftCents)).toEqual([0, 105_000]);
  });
});

describe('resumo do ano e limite do MEI (D-121)', () => {
  const year = [
    rec({ id: 'a', kind: 'receita', amountCents: 3_000_000, category: 'Vendas', occurredOn: '2026-03-10' }),
    rec({ id: 'b', kind: 'receita', amountCents: 1_000_000, category: 'Serviços', occurredOn: '2026-07-10' }),
    rec({ id: 'c', kind: 'receita', amountCents: 50_000, category: 'Outras entradas', occurredOn: '2026-07-11' }),
    rec({ id: 'd', kind: 'receita', amountCents: 100_000, category: 'Empréstimo recebido', occurredOn: '2026-02-01' }),
    rec({ id: 'e', amountCents: 400_000, category: 'Material e mercadoria', occurredOn: '2026-05-01' }),
    rec({ id: 'f', amountCents: 7_600, category: 'Impostos e DAS', occurredOn: '2026-05-20' }),
    rec({ id: 'g', amountCents: 60_000, category: null, occurredOn: '2026-06-02' }),
    rec({ id: 'h', amountCents: 80_000, category: 'Equipamento', occurredOn: '2026-06-03' }),
    rec({ id: 'i', amountCents: 100_000, category: WITHDRAWAL_BUSINESS_CATEGORY, occurredOn: '2026-08-01' }),
    // Outro ano, outro contexto e a mesma leitura duas vezes (o mesmo id) não contam.
    rec({ id: 'j', kind: 'receita', amountCents: 999_999, category: 'Vendas', occurredOn: '2025-12-31' }),
    rec({ id: 'k', kind: 'receita', amountCents: 999_999, category: 'Vendas', occurredOn: '2026-04-01', contextId: 'outro' }),
    rec({ id: 'a', kind: 'receita', amountCents: 3_000_000, category: 'Vendas', occurredOn: '2026-03-10' }),
  ];

  it('o ano por categoria (na ordem da lista do negócio), fora da operação, retiradas e o que ficou: a soma dos meses', () => {
    const y = businessYear(year, 'neg', 2026);
    expect(y.inLines).toEqual([
      { category: 'Vendas', cents: 3_000_000 },
      { category: 'Serviços', cents: 1_000_000 },
      { category: 'Outras entradas', cents: 50_000 },
    ]);
    expect(y.outLines).toEqual([
      { category: 'Material e mercadoria', cents: 400_000 },
      { category: 'Impostos e DAS', cents: 7_600 },
      { category: 'Sem categoria', cents: 60_000 },
    ]);
    expect([y.inCents, y.outCents, y.leftCents]).toEqual([4_050_000, 467_600, 3_582_400]);
    expect(y.outside).toEqual([
      { kind: 'receita', category: 'Empréstimo recebido', cents: 100_000 },
      { kind: 'despesa', category: 'Equipamento', cents: 80_000 },
    ]);
    expect([y.withdrawnCents, y.salesCents, y.servicesCents, y.recordCount]).toEqual([100_000, 3_000_000, 1_000_000, 9]);
    // O que ficou no ano é a soma do que ficou em cada mês (os mesmos números de "Seu negócio").
    const months = businessMonths(year.slice(0, -1), 'neg', '2026-12', 12);
    expect(y.keptCents).toBe(months.reduce((s, m) => s + m.keptCents, 0));
    expect(businessYear(year, 'neg', 2024).recordCount).toBe(0);
  });

  it('o limite do MEI: só Vendas e Serviços, a parte do limite para baixo, sem alerta; acima de 100%, o fato e a contabilidade', () => {
    expect(MEI_ANNUAL_LIMIT_CENTS).toBe(8_100_000);
    expect(MEI_MONTHLY_LIMIT_CENTS * 12).toBe(MEI_ANNUAL_LIMIT_CENTS);
    const y = businessYear(year, 'neg', 2026);
    const m = meiLimit(2026, y.salesCents, y.servicesCents);
    expect(m).toEqual({ year: 2026, revenueCents: 4_000_000, percent: 49, over: false });
    // O exemplo da pesquisa: R$ 64.800,00 são 80% do limite.
    expect(BUSINESS_TEXT.meiLine(meiLimit(2026, 6_000_000, 480_000))).toBe(
      'Vendas e serviços anotados em 2026: R$ 64.800,00, 80% do limite anual do MEI (R$ 81.000,00).',
    );
    expect(BUSINESS_TEXT.meiNote).toBe(
      'Os valores são os que você anotou. No ano em que o MEI foi aberto, o limite é proporcional aos meses (R$ 6.750,00 por mês).',
    );
    expect(BUSINESS_TEXT.meiLine(meiLimit(2026, 50_000, 0))).toContain('menos de 1% do limite');
    expect(BUSINESS_TEXT.meiNone(2026)).toBe('Nenhuma venda ou serviço anotado em 2026. O limite anual do MEI é R$ 81.000,00.');
    const over = meiLimit(2026, 9_000_000, 0);
    expect(over).toEqual({ year: 2026, revenueCents: 9_000_000, percent: 111, over: true });
    expect(BUSINESS_TEXT.meiLine(over)).toBe('Vendas e serviços anotados em 2026: R$ 90.000,00, 111% do limite anual do MEI (R$ 81.000,00).');
    expect(BUSINESS_TEXT.meiOver).toBe('Os valores são os que você anotou. Converse com a sua contabilidade.');
    expect(meiLimit(2026, 8_100_000, 0).over).toBe(false);
    // Com valores ocultos, sem a parte do limite (ela revelaria o valor).
    expect(BUSINESS_TEXT.meiLineHidden(m)).not.toMatch(/%/);
  });
});

describe('textos do D-121: fatos, sem julgamento, sem orientação de imposto', () => {
  it('nenhum termo proibido, travessão, julgamento, "livro-caixa" ou declaração pronta', () => {
    const all = [...allTexts(), ...Object.values(BUSINESS_ERROR_TEXT), ...Object.values(BUSINESS_PROFILE_LABEL), BUSINESS_PROFILE_NONE_LABEL];
    expect(all.length).toBeGreaterThan(150);
    for (const t of all) {
      expect(t, t).not.toMatch(FORBIDDEN);
      expect(t, t).not.toMatch(JUDGMENT);
      expect(t, t).not.toMatch(NOT_TAX);
    }
    // As frases pedidas.
    expect(BUSINESS_TEXT.yearMeiNote).toBe('Confira com a sua contabilidade antes de declarar.');
    expect(BUSINESS_TEXT.endKeep).toBe('Registros e comprovantes do negócio costumam precisar ser guardados por alguns anos. Converse com a sua contabilidade.');
    expect(BUSINESS_TEXT.endExport).toBe('Exportar os lançamentos');
    expect(BUSINESS_TEXT.notAdvice.startsWith('Os valores são os que você anotou.')).toBe(true);
    expect(businessErrorText('perfil_invalido')).toBe(BUSINESS_ERROR_TEXT.salvar_falhou);
    // O guia menciona as peças novas, com 3 a 6 passos e a frase das conversas no fim.
    const entry = guideEntry('negocio')!;
    const steps = entry.steps.join(' ');
    for (const piece of [BUSINESS_TEXT.contribute, BUSINESS_TEXT.outsideTitle, BUSINESS_TEXT.yearTitle, BUSINESS_TEXT.profileTitle]) expect(steps).toContain(piece);
    expect(entry.steps.length).toBeLessThanOrEqual(6);
    expect(entry.routes).toEqual(expect.arrayContaining(['/negocio/trazer', '/negocio/ano']));
    for (const t of entry.steps) {
      expect(t).not.toMatch(FORBIDDEN);
      expect(t).not.toMatch(NOT_TAX);
    }
  });

  it('o tipo do negócio: três valores do banco e o nulo', () => {
    expect(BUSINESS_PROFILES).toEqual(['sem_cnpj', 'mei', 'me_epp']);
    expect(BUSINESS_PROFILE_LABEL).toEqual({ sem_cnpj: 'Sem CNPJ (por conta própria)', mei: 'MEI', me_epp: 'Microempresa ou empresa de pequeno porte' });
    expect(BUSINESS_PROFILE_NONE_LABEL).toBe('Prefiro não dizer');
    expect(isBusinessProfile('mei')).toBe(true);
    expect(isBusinessProfile('MEI')).toBe(false);
    expect(businessProfileOf('me_epp')).toBe('me_epp');
    // A coluna ausente (banco antes da 0044) ou um valor desconhecido viram nulo.
    expect(businessProfileOf(undefined)).toBeNull();
    expect(businessProfileOf('outro')).toBeNull();
    expect(isBusinessAction('criar_aporte_negocio')).toBe(true);
    expect(isBusinessAction('definir_perfil_negocio')).toBe(true);
    // Trazer dinheiro do Pessoal é formulário (sem a barra); o resumo do ano é de consulta (com a barra).
    expect(barModeFor('/negocio/trazer')).toBe('formulario');
    expect(barModeFor('/negocio/ano')).toBe('consulta');
    expect(barModeFor('/negocio/retirada')).toBe('formulario');
  });

  it('o par ligado: retirada ou dinheiro trazido do Pessoal, pelo tipo e pelo espaço', () => {
    expect(businessPairKind('despesa', true)).toBe('retirada');
    expect(businessPairKind('receita', false)).toBe('retirada');
    expect(businessPairKind('receita', true)).toBe('aporte');
    expect(businessPairKind('despesa', false)).toBe('aporte');
    expect(contributionDescriptions('Sacolé da Mãe', null)).toEqual({ business: 'Dinheiro do Pessoal', personal: 'Dinheiro para Sacolé da Mãe' });
    expect(contributionDescriptions('Sacolé da Mãe', '  Capital de giro ')).toEqual({ business: 'Capital de giro', personal: 'Capital de giro' });
    expect([...contributionDescriptions('x'.repeat(80), '').personal].length).toBe(80);
  });
});

/** Repositório de uma pessoa com o Pessoal pronto (hoje 17/11/2026), num hub de negócios próprio ou compartilhado. */
async function person(actorId = 'bia', business?: MemoryBusinessHub) {
  const repo = new MemoryRepository({ actorId, displayName: actorId, today: () => '2026-11-17', ...(business ? { business } : {}) });
  const space = await repo.ensurePersonalSpace('Conta principal');
  return { repo, space, personal: space.personalContextId, personalAcc: space.accounts[0]!.id };
}

describe('trazer dinheiro do Pessoal na memória (create_business_contribution, 0044)', () => {
  it('os dois lados, ligados, cada um contando uma vez no próprio espaço; fora da operação em "Seu negócio"', async () => {
    const { repo, personal, personalAcc } = await person();
    const b = await repo.createBusiness(newOperationKey(), 'Sacolé da Bia');
    const acc = (await repo.listAccounts(b.id))[0]!.id;
    await repo.createRecord(newOperationKey(), b.id, 'receita', { accountId: acc, amountCents: 120_000, occurredOn: '2026-11-05', description: 'Vendas', category: 'Vendas' });
    const input = { businessAccountId: acc, personalAccountId: personalAcc, amountCents: 50_000, occurredOn: '2026-11-10', description: null };
    // As recusas da retirada.
    expect(await code(repo.createBusinessContribution(newOperationKey(), personal, input))).toBe('contexto_invalido');
    expect(await code(repo.createBusinessContribution(newOperationKey(), 'nada', input))).toBe('nao_encontrado');
    expect(await code(repo.createBusinessContribution(newOperationKey(), b.id, { ...input, personalAccountId: acc }))).toBe('conta_invalida');
    expect(await code(repo.createBusinessContribution(newOperationKey(), b.id, { ...input, occurredOn: '2026-11-18' }))).toBe('data_futura');
    expect(await code(repo.createBusinessContribution(newOperationKey(), b.id, { ...input, amountCents: 0 }))).toBe('valor_invalido');
    expect(await code(repo.createBusinessContribution(newOperationKey(), b.id, { ...input, description: 'x'.repeat(81) }))).toBe('descricao_longa');
    const key = newOperationKey();
    const c = await repo.createBusinessContribution(key, b.id, input);
    expect(c.businessRecord).toMatchObject({ contextId: b.id, kind: 'receita', category: 'Dinheiro do Pessoal', description: 'Dinheiro do Pessoal', amountCents: 50_000, pairedRecordId: c.personalRecord.id });
    expect(c.personalRecord).toMatchObject({ contextId: personal, kind: 'despesa', category: 'Dinheiro para o negócio', description: 'Dinheiro para Sacolé da Bia', pairedRecordId: c.businessRecord.id });
    // Repetir a mesma chave devolve o mesmo; outro conteúdo com a mesma chave, chave_reutilizada (também com a da retirada).
    expect(await repo.createBusinessContribution(key, b.id, input)).toEqual(c);
    expect(await code(repo.createBusinessContribution(key, b.id, { ...input, amountCents: 50_001 }))).toBe('chave_reutilizada');
    expect(await code(repo.createBusinessWithdrawal(key, b.id, input))).toBe('chave_reutilizada');
    // Conta como anotação na atividade do negócio (como a retirada).
    expect((repo as unknown as { activity: Map<string, unknown> }).activity.has(b.id)).toBe(true);
    // Cada lado uma vez: no Resumo do negócio, entrou; no Pessoal, saiu. Em "Seu negócio", fora da operação.
    const bRecords = await repo.listRecords(b.id, '2026-11');
    expect(summarizeMonth(bRecords, b.id, '2026-11')).toMatchObject({ receivedCents: 170_000, paidCents: 0 });
    expect(businessMonth(bRecords, b.id, '2026-11')).toMatchObject({ inCents: 120_000, outCents: 0, leftCents: 120_000, outsideInCents: 50_000, keptCents: 170_000 });
    expect(summarizeMonth(await repo.listRecords(personal, '2026-11'), personal, '2026-11')).toMatchObject({ receivedCents: 0, paidCents: 50_000 });
    // Travado nos dois lados: editar, excluir e mover.
    expect(
      await code(repo.updateRecord(newOperationKey(), c.personalRecord.id, 1, { accountId: personalAcc, amountCents: 1, occurredOn: '2026-11-10', description: 'x', category: null })),
    ).toBe('retirada_ligada');
    expect(await code(repo.deleteRecord(newOperationKey(), c.businessRecord.id, 1))).toBe('retirada_ligada');
    expect(await code(repo.moveRecord(newOperationKey(), c.businessRecord.id, 1, personal, personalAcc, null))).toBe('lancamento_ligado');
  });

  it('excluir pelo lado de qualquer espaço tira os dois; o lado do negócio é o do espaço negócio (retirada e dinheiro trazido)', async () => {
    const { repo, personal, personalAcc } = await person();
    const b = await repo.createBusiness(newOperationKey(), 'Sacolé da Bia');
    const acc = (await repo.listAccounts(b.id))[0]!.id;
    const input = { businessAccountId: acc, personalAccountId: personalAcc, amountCents: 30_000, occurredOn: '2026-11-10', description: 'Capital de giro' };
    const first = await repo.createBusinessContribution(newOperationKey(), b.id, input);
    expect(first.businessRecord.description).toBe('Capital de giro');
    // Pelo lado do Pessoal (o gasto).
    const delKey = newOperationKey();
    const gone = await repo.deleteBusinessWithdrawal(delKey, first.personalRecord.id, 1);
    expect([gone.businessRecord.id, gone.personalRecord.id]).toEqual([first.businessRecord.id, first.personalRecord.id]);
    expect([gone.businessRecord.version, gone.personalRecord.version]).toEqual([2, 2]);
    expect(await repo.getRecord(first.businessRecord.id)).toBeNull();
    expect(await repo.deleteBusinessWithdrawal(delKey, first.personalRecord.id, 1)).toEqual(gone);
    // Pelo lado do negócio (a entrada).
    const second = await repo.createBusinessContribution(newOperationKey(), b.id, input);
    const gone2 = await repo.deleteBusinessWithdrawal(newOperationKey(), second.businessRecord.id, 1);
    expect(gone2.businessRecord.contextId).toBe(b.id);
    expect(gone2.personalRecord.contextId).toBe(personal);
    // A retirada continua igual.
    const w = await repo.createBusinessWithdrawal(newOperationKey(), b.id, input);
    const gone3 = await repo.deleteBusinessWithdrawal(newOperationKey(), w.personalRecord.id, 1);
    expect([gone3.businessRecord.id, gone3.personalRecord.id]).toEqual([w.businessRecord.id, w.personalRecord.id]);
    expect(await repo.listRecords(b.id, '2026-11')).toEqual([]);
    expect(await repo.listRecords(personal, '2026-11')).toEqual([]);
  });

  it('encerrar o negócio desliga também o dinheiro trazido; o gasto do Pessoal fica como lançamento comum', async () => {
    const { repo, personalAcc } = await person();
    const b = await repo.createBusiness(newOperationKey(), 'Sacolé da Bia');
    const acc = (await repo.listAccounts(b.id))[0]!.id;
    const c = await repo.createBusinessContribution(newOperationKey(), b.id, { businessAccountId: acc, personalAccountId: personalAcc, amountCents: 10_000, occurredOn: '2026-11-10', description: null });
    await repo.endBusiness(newOperationKey(), b.id);
    const p = (await repo.getRecord(c.personalRecord.id))!;
    expect(p.pairedRecordId ?? null).toBeNull();
    expect(p.category).toBe(CONTRIBUTION_PERSONAL_CATEGORY);
    expect((await repo.deleteRecord(newOperationKey(), p.id, p.version)).id).toBe(p.id);
  });

  it('quem só vê o negócio não traz dinheiro; quem anota e vê traz para o próprio Pessoal', async () => {
    const hub = new MemoryBusinessHub({ plusOpen: true });
    const bia = await person('bia', hub);
    const caio = await person('caio', hub);
    const duda = await person('duda', hub);
    const b = await bia.repo.createBusiness(newOperationKey(), 'Sacolé da Bia');
    await caio.repo.acceptBusinessInvite(newOperationKey(), (await bia.repo.createBusinessInvite(newOperationKey(), b.id, 'leitor')).code!);
    await duda.repo.acceptBusinessInvite(newOperationKey(), (await bia.repo.createBusinessInvite(newOperationKey(), b.id, 'membro')).code!);
    const caioAcc = (await caio.repo.listAccounts(b.id))[0]!.id;
    const dudaAcc = (await duda.repo.listAccounts(b.id))[0]!.id;
    expect(
      await code(caio.repo.createBusinessContribution(newOperationKey(), b.id, { businessAccountId: caioAcc, personalAccountId: caio.personalAcc, amountCents: 1_000, occurredOn: '2026-11-10', description: null })),
    ).toBe('sem_permissao');
    const c = await duda.repo.createBusinessContribution(newOperationKey(), b.id, {
      businessAccountId: dudaAcc,
      personalAccountId: duda.personalAcc,
      amountCents: 1_000,
      occurredOn: '2026-11-10',
      description: null,
    });
    expect(c.personalRecord.contextId).toBe(duda.personal);
  });
});

describe('o tipo do negócio na memória (set_business_profile, 0044)', () => {
  it('nasce sem tipo; só quem administra muda; nulo limpa; repetição, chave e valor inválido; não conta como anotação', async () => {
    const hub = new MemoryBusinessHub({ plusOpen: true });
    const bia = await person('bia', hub);
    const caio = await person('caio', hub);
    const eva = await person('eva', hub);
    const b = await bia.repo.createBusiness(newOperationKey(), 'Sacolé da Bia');
    expect(b.businessProfile).toBeNull();
    expect((await bia.repo.getBusiness())!.businessProfile).toBeNull();
    const key = newOperationKey();
    const set = await bia.repo.setBusinessProfile(key, b.id, 'mei');
    expect(set).toMatchObject({ id: b.id, name: 'Sacolé da Bia', role: 'titular', businessProfile: 'mei' });
    expect((await bia.repo.getBusiness())!.businessProfile).toBe('mei');
    expect(await bia.repo.setBusinessProfile(key, b.id, 'mei')).toEqual(set);
    expect(await code(bia.repo.setBusinessProfile(key, b.id, 'me_epp'))).toBe('chave_reutilizada');
    expect(await code(bia.repo.setBusinessProfile(newOperationKey(), b.id, 'MEI' as never))).toBe('perfil_invalido');
    expect(await code(bia.repo.setBusinessProfile(newOperationKey(), bia.personal, 'mei'))).toBe('contexto_invalido');
    expect(await code(eva.repo.setBusinessProfile(newOperationKey(), b.id, 'mei'))).toBe('nao_encontrado');
    // Quem anota e vê lê o tipo, mas não muda.
    await caio.repo.acceptBusinessInvite(newOperationKey(), (await bia.repo.createBusinessInvite(newOperationKey(), b.id, 'membro')).code!);
    expect((await caio.repo.getBusiness())!.businessProfile).toBe('mei');
    expect(await code(caio.repo.setBusinessProfile(newOperationKey(), b.id, 'sem_cnpj'))).toBe('sem_permissao');
    expect((await bia.repo.setBusinessProfile(newOperationKey(), b.id, null)).businessProfile).toBeNull();
    expect((await caio.repo.getBusiness())!.businessProfile).toBeNull();
    // Definir o tipo não conta como anotação.
    expect((bia.repo as unknown as { activity: Map<string, unknown> }).activity.has(b.id)).toBe(false);
  });
});

describe('orçamento do negócio: as 9 de sempre, e a leitura defensiva de um banco com mais categorias (D-121)', () => {
  const lists = [CATEGORIES.despesa, BUSINESS_BUDGET_CATEGORIES];
  const rows = (cats: readonly string[], budgeted: readonly string[] = []) => cats.map((category) => ({ category, hasBudgetRow: budgeted.includes(category) }));
  const NEW = ['Divulgação', 'Contabilidade e sistemas', 'Juros e multas'];
  const twelve = [...BUSINESS_BUDGET_CATEGORIES.slice(0, 8), ...NEW, 'Outras saídas'];

  it('o banco de hoje (9 linhas no negócio, 7 no Pessoal): todas ficam, na ordem', () => {
    expect(budgetLinesToKeep(rows(BUSINESS_BUDGET_CATEGORIES), lists)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(budgetLinesToKeep(rows(CATEGORIES.despesa), lists)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('o banco de depois (9 + 3 linhas): as 3 que esta versão não orça saem sem orçamento gravado e ficam, só para mostrar, com orçamento', () => {
    expect(budgetLinesToKeep(rows(twelve), lists)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 11]);
    expect(budgetLinesToKeep(rows(twelve, ['Divulgação']), lists)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 11]);
    // As 3 no fim (outra ordem do banco) também servem: as conhecidas continuam todas e na ordem.
    expect(budgetLinesToKeep(rows([...BUSINESS_BUDGET_CATEGORIES, ...NEW]), lists)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('uma lista incompleta, fora de ordem, repetida, misturada, vazia ou com nome inválido nunca vira orçamento zerado', () => {
    expect(budgetLinesToKeep(rows(BUSINESS_BUDGET_CATEGORIES.slice(1)), lists)).toBeNull();
    expect(budgetLinesToKeep(rows([BUSINESS_BUDGET_CATEGORIES[1]!, BUSINESS_BUDGET_CATEGORIES[0]!, ...BUSINESS_BUDGET_CATEGORIES.slice(2)]), lists)).toBeNull();
    expect(budgetLinesToKeep(rows([...BUSINESS_BUDGET_CATEGORIES, 'Divulgação', 'Divulgação']), lists)).toBeNull();
    expect(budgetLinesToKeep(rows([...CATEGORIES.despesa, 'Impostos e DAS']), lists)).toBeNull();
    expect(budgetLinesToKeep(rows([...CATEGORIES.despesa, '']), lists)).toBeNull();
    expect(budgetLinesToKeep(rows([...CATEGORIES.despesa, 'x'.repeat(41)]), lists)).toBeNull();
    expect(budgetLinesToKeep([], lists)).toBeNull();
    expect(isBudgetCategoryName('Divulgação')).toBe(true);
    expect(isBudgetCategoryName('  ')).toBe(false);
  });

  it('na memória, o orçamento do negócio tem as 9 e recusa as 3 saídas novas (categoria_invalida), mas elas se anotam e contam na operação', async () => {
    const { repo } = await person();
    const b = await repo.createBusiness(newOperationKey(), 'Sacolé da Bia');
    const acc = (await repo.listAccounts(b.id))[0]!.id;
    for (const c of NEW) {
      await repo.createRecord(newOperationKey(), b.id, 'despesa', { accountId: acc, amountCents: 1_000, occurredOn: '2026-11-10', description: c, category: c });
      expect(await code(repo.setCategoryBudget(newOperationKey(), b.id, c, '2026-11', 0, 10_000))).toBe('categoria_invalida');
    }
    const budget = await repo.getMonthBudget(b.id, '2026-11');
    expect(budget.lines.map((l) => l.category)).toEqual(BUSINESS_BUDGET_CATEGORIES);
    expect(budget.lines.reduce((s, l) => s + l.usedCents, 0)).toBe(0);
    const m = businessMonth(await repo.listRecords(b.id, '2026-11'), b.id, '2026-11');
    expect([m.outCents, m.outsideOutCents]).toEqual([3_000, 0]);
    expect(businessTopOut(await repo.listRecords(b.id, '2026-11'), b.id, '2026-11').map((l) => l.category).sort()).toEqual([...NEW].sort());
  });
});

describe('demonstração: os números de sempre (D-113) não mudam', () => {
  it('"Sacolé da Maria" sem tipo, sem nada fora da operação; setembro e outubro iguais, e o que ficou é a Diferença do Resumo', async () => {
    const repo = await createDemoRepository({ scenario: 'negocio' });
    const b = (await repo.getBusiness())!;
    expect(b).toMatchObject({ name: DEMO_BUSINESS_NAME, businessProfile: null });
    const sep = await repo.listRecords(b.id, '2026-09');
    const oct = await repo.listRecords(b.id, '2026-10');
    expect(businessMonth(sep, b.id, '2026-09')).toMatchObject({ inCents: 176_000, outCents: 60_100, leftCents: 115_900, outside: [], withdrawnCents: 0, keptCents: 115_900 });
    expect(businessMonth(oct, b.id, '2026-10')).toMatchObject({ inCents: 76_000, outCents: 41_800, leftCents: 34_200, outside: [], withdrawnCents: 0, keptCents: 34_200 });
    const y = businessYear([...sep, ...oct], b.id, 2026);
    expect([y.salesCents, y.servicesCents, meiLimit(2026, y.salesCents, y.servicesCents).percent]).toEqual([252_000, 0, 3]);
    expect((await repo.getMonthBudget(b.id, '2026-10')).lines.map((l) => l.category)).toEqual(BUSINESS_BUDGET_CATEGORIES);
  });
});
