import { describe, expect, it } from 'vitest';
import {
  APP_SCREENS,
  BUSINESS_CATEGORIES,
  GUIDE_ENTRIES,
  RECORD_KIND_ERROR_TEXT,
  BUSINESS_ERROR_TEXT,
  BUSINESS_TEXT,
  CATEGORIES,
  DEMO_BUSINESS_NAME,
  DEMO_TODAY,
  MemoryFamilyHub,
  MemoryRepository,
  RepoError,
  WITHDRAWAL_BUSINESS_CATEGORY,
  WITHDRAWAL_PERSONAL_CATEGORY,
  budgetCategoriesFor,
  businessErrorText,
  businessMonth,
  businessMonths,
  businessNameError,
  businessPeriodText,
  businessResultText,
  businessTopOut,
  canMoveRecord,
  contextCategories,
  contextKindOfItem,
  contextLabelFor,
  contextName,
  createDemoRepository,
  demoScenarioFrom,
  guideEntry,
  isWithdrawal,
  newOperationKey,
  searchAppScreens,
  searchGuide,
  suggestMoveCategory,
  summarizeMonth,
  unsavedChangesText,
  validateWithdrawalDraft,
  withdrawalDescriptions,
  effectiveSearchCategory,
  moreFiltersActive,
  NO_CATEGORY_LABEL,
  searchCategoryOptions,
  searchFromDraft,
  type BusinessMonth,
  type FinancialRecord,
} from '../src';

/** Termos que nenhum texto do app usa (o mesmo critério de copy.test.ts). */
const FORBIDDEN =
  /\b(recomendamos|recomendo|invista|aplique|tesouro|cdb|lci|lca|caixinha|cofrinho)\b|fundo de investimento|rentabilidade garantida|rendimento garantido|retorno garantido|enriquec|faz(er|endo)?\s+sentido|[\u2013\u2014]/i;
/** Julgamento e cobrança: o negócio é mostrado só com fatos. */
const JUDGMENT = /\b(preju[ií]zo|lucro|cuidado|aten[cç][aã]o|alerta|ruim|bom|ótimo|parab[eé]ns|deveria|precisa)\b/i;

const rec = (over: Partial<FinancialRecord>): FinancialRecord => ({
  id: over.id ?? `r-${Math.random().toString(36).slice(2, 8)}`,
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

const texts = (o: Record<string, unknown>): string[] =>
  Object.values(o).flatMap((v) => {
    if (typeof v === 'string') return [v];
    if (typeof v === 'function') {
      try {
        const out = (v as (...a: unknown[]) => unknown)('Sacolé da Mãe', 12345);
        return typeof out === 'string' ? [out] : [];
      } catch {
        return [];
      }
    }
    return [];
  });

describe('Espaço Negócio: categorias e regras puras (D-113)', () => {
  it('as categorias do negócio, as do Pessoal e as do orçamento', () => {
    // D-121: "Empréstimo recebido" nas entradas; "Divulgação", "Contabilidade e sistemas" e "Juros e multas" antes de "Outras saídas";
    // "Parcela de empréstimo" e "Equipamento" no fim (fora da operação e fora do orçamento).
    expect(BUSINESS_CATEGORIES.receita).toEqual(['Vendas', 'Serviços', 'Outras entradas', 'Empréstimo recebido']);
    expect(BUSINESS_CATEGORIES.despesa).toEqual([
      'Material e mercadoria',
      'Peças e ferramentas',
      'Combustível e transporte',
      'Funcionários e ajudantes',
      'Impostos e DAS',
      'Aluguel do ponto',
      'Contas do ponto',
      'Taxas e maquininha',
      'Divulgação',
      'Contabilidade e sistemas',
      'Juros e multas',
      'Outras saídas',
      'Parcela de empréstimo',
      'Equipamento',
    ]);
    expect(contextCategories('negocio', 'despesa')).toBe(BUSINESS_CATEGORIES.despesa);
    expect(contextCategories('pessoal', 'receita')).toBe(CATEGORIES.receita);
    expect(contextCategories('familia', 'despesa')).toBe(CATEGORIES.despesa);
    // O orçamento do negócio: as 9 de sempre, na ordem do banco (a 0044 não muda o orçamento; as 3 saídas novas ficam fora dele por enquanto).
    expect(budgetCategoriesFor('negocio')).toHaveLength(9);
    expect(budgetCategoriesFor('negocio')).toEqual(
      BUSINESS_CATEGORIES.despesa.filter((c) => !['Divulgação', 'Contabilidade e sistemas', 'Juros e multas', 'Parcela de empréstimo', 'Equipamento'].includes(c)),
    );
    expect(budgetCategoriesFor('pessoal')).toEqual(CATEGORIES.despesa);
    for (const c of [...BUSINESS_CATEGORIES.receita, ...BUSINESS_CATEGORIES.despesa, WITHDRAWAL_BUSINESS_CATEGORY, WITHDRAWAL_PERSONAL_CATEGORY]) {
      expect([...c].length).toBeLessThanOrEqual(40);
    }
    // A retirada não é uma categoria de escolha.
    expect(BUSINESS_CATEGORIES.despesa).not.toContain(WITHDRAWAL_BUSINESS_CATEGORY);
    expect(CATEGORIES.receita).not.toContain(WITHDRAWAL_PERSONAL_CATEGORY);
  });

  it('nome do negócio: 1 a 60 caracteres depois de aparar', () => {
    expect(businessNameError('  ')).toBe('nome_do_negocio_invalido');
    expect(businessNameError('a'.repeat(61))).toBe('nome_do_negocio_invalido');
    expect(businessNameError(' Sacolé da Mãe ')).toBeNull();
    expect(businessNameError('a'.repeat(60))).toBeNull();
  });

  it('descrições da retirada: a da pessoa nos dois lados ou as padrão', () => {
    expect(withdrawalDescriptions('Sacolé da Mãe', null)).toEqual({ business: 'Retirada para o Pessoal', personal: 'Retirada de Sacolé da Mãe' });
    expect(withdrawalDescriptions('Sacolé da Mãe', '  Pró-labore ')).toEqual({ business: 'Pró-labore', personal: 'Pró-labore' });
    expect([...withdrawalDescriptions('x'.repeat(60), '').personal].length).toBeLessThanOrEqual(80);
  });

  it('o preenchimento da retirada', () => {
    const base = { amountText: '500,00', dateText: '15/11/2026', description: '', businessAccountId: 'b', personalAccountId: 'p' };
    expect(validateWithdrawalDraft(base, '2026-11-17')).toEqual({
      ok: true,
      input: { businessAccountId: 'b', personalAccountId: 'p', amountCents: 50_000, occurredOn: '2026-11-15', description: null },
    });
    const bad = validateWithdrawalDraft({ ...base, amountText: '0', dateText: '18/11/2026', personalAccountId: '', description: 'x'.repeat(81) }, '2026-11-17');
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.errors).toEqual({
        amountText: 'Informe um valor maior que zero, como 80,00.',
        dateText: 'Use uma data até hoje. Aqui entram só valores já pagos ou recebidos.',
        personalAccountId: 'Escolha o banco ou a carteira.',
        description: 'Use no máximo 80 caracteres.',
      });
    }
    const ok = validateWithdrawalDraft({ ...base, description: '  Pró-labore ' }, '2026-11-17');
    expect(ok.ok && ok.input.description).toBe('Pró-labore');
  });

  it('o que pode mudar de espaço e a categoria sugerida', () => {
    expect(canMoveRecord(rec({}))).toBe(true);
    expect(canMoveRecord(rec({ commitmentId: 'c' }))).toBe(false);
    expect(canMoveRecord(rec({ invoice: { cardId: 'k', month: '2026-11' } }))).toBe(false);
    expect(canMoveRecord(rec({ kind: 'receita', investmentId: 'i', investmentMovementId: 'm' }))).toBe(false);
    expect(canMoveRecord(rec({ pairedRecordId: 'p' }))).toBe(false);
    expect(isWithdrawal(rec({ pairedRecordId: 'p' }))).toBe(true);
    expect(isWithdrawal(rec({ pairedRecordId: null }))).toBe(false);
    expect(suggestMoveCategory('Transporte', 'despesa', 'negocio')).toBe('Combustível e transporte');
    expect(suggestMoveCategory('Combustível e transporte', 'despesa', 'pessoal')).toBe('Transporte');
    expect(suggestMoveCategory('Mercado', 'despesa', 'negocio')).toBeNull();
    expect(suggestMoveCategory('Vendas', 'receita', 'pessoal')).toBeNull();
    expect(suggestMoveCategory(null, 'despesa', 'negocio')).toBeNull();
  });

  it('nome do espaço nas pílulas e no seletor', () => {
    expect(contextName('negocio', 'Sacolé da Mãe')).toBe('Sacolé da Mãe');
    expect(contextName('negocio')).toBe('Negócio');
    expect(contextName('familia')).toBe('Família');
    expect(contextName('pessoal', 'Sacolé')).toBe('Pessoal');
    expect(contextLabelFor('Salvando em Pessoal', 'negocio', 'Sacolé da Mãe')).toBe('Salvando em Sacolé da Mãe');
    expect(contextLabelFor('Salvando em Pessoal', 'familia')).toBe('Salvando em Família');
    expect(contextLabelFor('Salvando em Pessoal', 'pessoal', 'Sacolé')).toBe('Salvando em Pessoal');
    expect(unsavedChangesText('negocio', 'Sacolé da Mãe')).toBe('Você tem alterações que ainda não foram salvas em Sacolé da Mãe.');
    expect(contextKindOfItem('neg', 'pes', 'fam', 'neg')).toBe('negocio');
    expect(contextKindOfItem('neg', 'pes', 'fam')).toBeNull();
    expect(contextKindOfItem('pes', 'pes', null, 'neg')).toBe('pessoal');
  });
});

describe('Seu negócio: entrou, saiu e sobrou', () => {
  const list = [
    rec({ kind: 'receita', amountCents: 120_000, category: 'Vendas' }),
    rec({ amountCents: 30_000, category: 'Material e mercadoria' }),
    rec({ amountCents: 7_600, category: 'Impostos e DAS' }),
    rec({ amountCents: 5_000, category: null }),
    rec({ amountCents: 50_000, category: WITHDRAWAL_BUSINESS_CATEGORY, pairedRecordId: 'p1' }),
    rec({ amountCents: 9_999, occurredOn: '2026-09-30', category: 'Material e mercadoria' }),
    rec({ contextId: 'outro', amountCents: 77_777 }),
  ];

  it('as retiradas ficam fora de Saiu e o que ficou bate com a Diferença do Resumo', () => {
    const m = businessMonth(list, 'neg', '2026-10');
    expect(m).toEqual({
      month: '2026-10',
      inCents: 120_000,
      outCents: 42_600,
      leftCents: 77_400,
      outsideInCents: 0,
      outsideOutCents: 0,
      outside: [],
      withdrawnCents: 50_000,
      keptCents: 27_400,
      recordCount: 5,
    });
    expect(summarizeMonth(list, 'neg', '2026-10').differenceCents).toBe(m.keptCents);
  });

  it('as maiores saídas, sem as retiradas, com "Sem categoria"', () => {
    const top = businessTopOut(list, 'neg', '2026-10');
    expect(top.map((l) => [l.category, l.cents])).toEqual([
      ['Material e mercadoria', 30_000],
      ['Impostos e DAS', 7_600],
      ['Sem categoria', 5_000],
    ]);
    expect(top[0]!.share).toBeCloseTo(30_000 / 42_600);
    expect(businessTopOut(list, 'neg', '2026-10', 1)).toHaveLength(1);
    expect(businessTopOut([], 'neg', '2026-10')).toEqual([]);
  });

  it('as frases, de fato e sem julgamento', () => {
    // D-121: a frase diz "na operação" (Entrou, Saiu e Sobrou de "Seu negócio" não contam o que fica fora da operação nem as retiradas).
    expect(businessResultText(businessMonth(list, 'neg', '2026-10'))).toBe('Neste mês, na operação, entrou R$ 774,00 a mais do que saiu.');
    expect(businessResultText(businessMonth([rec({ amountCents: 30_000 })], 'neg', '2026-10'))).toBe('Neste mês, na operação, saiu R$ 300,00 a mais do que entrou.');
    expect(businessResultText(businessMonth([rec({ amountCents: 100 }), rec({ kind: 'receita', amountCents: 100 })], 'neg', '2026-10'))).toBe(
      'Neste mês, na operação, entrou o mesmo que saiu.',
    );
    expect(businessResultText(businessMonth([], 'neg', '2026-10'))).toBe('Nada anotado neste mês.');
    for (const t of [businessResultText(businessMonth([rec({ amountCents: 30_000 })], 'neg', '2026-10')), BUSINESS_TEXT.keptLine(-500), BUSINESS_TEXT.withdrawnLine(500)]) {
      expect(t).not.toMatch(JUDGMENT);
      expect(t).not.toMatch(FORBIDDEN);
    }
  });

  it('os últimos meses e a pergunta "rende mais do que custa?" respondida com fato', () => {
    const months = businessMonths(list, 'neg', '2026-10', 3);
    expect(months.map((m) => [m.month, m.leftCents])).toEqual([
      ['2026-08', 0],
      ['2026-09', -9_999],
      ['2026-10', 77_400],
    ]);
    expect(businessPeriodText(months)).toBe(
      'De agosto a outubro de 2026, entrou mais do que saiu em 1 dos 2 meses com anotações. Somando, entrou R$ 674,01 a mais do que saiu.',
    );
    expect(businessPeriodText(businessMonths([], 'neg', '2026-10'))).toBeNull();
    expect(businessPeriodText(businessMonths([rec({ amountCents: 500 })], 'neg', '2026-10', 2))).toBe(
      'De setembro a outubro de 2026, só um mês tem anotações. Somando, saiu R$ 5,00 a mais do que entrou.',
    );
  });

  it('todos os textos sem termos proibidos, sem travessão e sem julgamento', () => {
    const all = [...texts(BUSINESS_TEXT), ...Object.values(BUSINESS_ERROR_TEXT)];
    expect(all.length).toBeGreaterThan(60);
    for (const t of all) {
      expect(t).not.toMatch(FORBIDDEN);
      expect(t).not.toMatch(JUDGMENT);
    }
    expect(businessErrorText('ja_tem_negocio')).toBe('Você já tem um espaço Negócio. O plano inclui um negócio por pessoa.');
    expect(businessErrorText('qualquer')).toBe(BUSINESS_ERROR_TEXT.salvar_falhou);
    // A mesma frase da retirada travada no detalhe e na recusa do formulário de gasto e recebimento.
    // D-121: genérica, para a retirada e para o dinheiro trazido do Pessoal.
    expect(RECORD_KIND_ERROR_TEXT.retirada_ligada).toBe(BUSINESS_TEXT.pairLocked);
    expect(BUSINESS_ERROR_TEXT.retirada_ligada).toBe(BUSINESS_TEXT.pairLocked);
    expect(BUSINESS_TEXT.pairLocked).not.toMatch(/retirada/i);
    expect(BUSINESS_ERROR_TEXT.nao_e_retirada).not.toMatch(/retirada/i);
    // A entrada do guia (no grupo "Conta e privacidade", logo depois da Família) e a tela no índice "No app" da busca de Aprender.
    const entry = guideEntry('negocio')!;
    const guideTexts = [entry.title, entry.purpose, ...entry.steps];
    for (const g of guideTexts) {
      expect(g).not.toMatch(FORBIDDEN);
      expect(g).not.toMatch(JUDGMENT);
    }
    expect(entry.steps.length).toBeGreaterThanOrEqual(3);
    expect(entry.steps.length).toBeLessThanOrEqual(6);
    expect(entry.routes).toContain('/negocio');
    expect(entry.screenshot).toBe('730_negocio_como_esta.png');
    expect(entry.group).toBe('conta-e-privacidade');
    const ids = GUIDE_ENTRIES.map((e) => e.id);
    expect(ids.indexOf('negocio')).toBe(ids.indexOf('familia') + 1);
    expect(searchGuide('cnpj').map((e) => e.id)).toContain('negocio');
    expect(searchGuide('negócio')[0]?.id).toBe('negocio');
    expect(searchGuide('trabalho por conta').map((e) => e.id)).toEqual(['negocio']);
    const screen = APP_SCREENS.find((s) => s.id === 'negocio')!;
    expect(screen.href).toBe('/negocio');
    expect(screen.title).toBe(BUSINESS_TEXT.accountTitle);
    for (const t of [screen.title, screen.caption]) {
      expect(t).not.toMatch(FORBIDDEN);
      expect(t).not.toMatch(JUDGMENT);
    }
    expect(searchAppScreens('cnpj').map((s) => s.id)).toEqual(['negocio']);
    expect(searchAppScreens('negócio')[0]?.id).toBe('negocio');
    // Quem tem CNPJ ou trabalha por conta: a frase que explica para que serve aparece em Conta e na criação.
    expect(BUSINESS_TEXT.accountHintNone).toContain('CNPJ ou trabalha por conta');
    expect(BUSINESS_TEXT.intro).toContain('CNPJ ou trabalha por conta');
  });
});

/** Repositório de uma pessoa com o Pessoal pronto (hoje 17/11/2026). */
async function person(actorId = 'bia', family?: MemoryFamilyHub) {
  const repo = new MemoryRepository({ actorId, displayName: actorId, today: () => '2026-11-17', ...(family ? { family } : {}) });
  const space = await repo.ensurePersonalSpace('Conta principal');
  return { repo, space, personal: space.personalContextId, personalAcc: space.accounts[0]!.id };
}

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return 'passou';
  } catch (e) {
    return e instanceof RepoError ? e.code : String(e);
  }
};

describe('Espaço Negócio na memória (as mesmas regras da migração 0042)', () => {
  it('criar: sem Pessoal, nome, repetição, chave reutilizada e um por pessoa', async () => {
    const empty = new MemoryRepository({ actorId: 'x', displayName: 'X', today: () => '2026-11-17' });
    expect(await code(empty.createBusiness(newOperationKey(), 'Sacolé'))).toBe('sem_permissao');
    const { repo, personal } = await person();
    expect(await repo.getBusiness()).toBeNull();
    expect(await code(repo.createBusiness(newOperationKey(), '   '))).toBe('nome_do_negocio_invalido');
    const key = newOperationKey();
    const b = await repo.createBusiness(key, '  Sacolé da Bia ');
    expect(b.name).toBe('Sacolé da Bia');
    expect(await repo.createBusiness(key, 'Sacolé da Bia')).toEqual(b);
    expect(await code(repo.createBusiness(key, 'Outro'))).toBe('chave_reutilizada');
    expect(await code(repo.createBusiness(newOperationKey(), 'Segundo'))).toBe('ja_tem_negocio');
    expect(await repo.getBusiness()).toEqual(b);
    const accounts = await repo.listAccounts(b.id);
    expect(accounts.map((a) => [a.name, a.isDefault, a.kind])).toEqual([['Conta do negócio', true, 'banco']]);
    // O Pessoal continua com as contas dele.
    expect((await repo.getSpace())!.accounts.map((a) => a.contextId)).toEqual([personal]);
    // Criar não conta como anotação na atividade.
    expect((repo as unknown as { activity: Map<string, unknown> }).activity.has(b.id)).toBe(false);
  });

  it('lançamentos, orçamento e cartão no negócio; metas e investimentos não; quem é de fora não lê', async () => {
    const hub = new MemoryFamilyHub();
    const { repo, personal } = await person('bia', hub);
    const caio = await person('caio', hub);
    const b = await repo.createBusiness(newOperationKey(), 'Sacolé da Bia');
    const acc = (await repo.listAccounts(b.id))[0]!.id;
    await repo.createRecord(newOperationKey(), b.id, 'receita', { accountId: acc, amountCents: 120_000, occurredOn: '2026-11-05', description: 'Vendas', category: 'Vendas' });
    await repo.createRecord(newOperationKey(), b.id, 'despesa', {
      accountId: acc,
      amountCents: 30_000,
      occurredOn: '2026-11-06',
      description: 'Frutas',
      category: 'Material e mercadoria',
    });
    expect(summarizeMonth(await repo.listRecords(b.id, '2026-11'), b.id, '2026-11').differenceCents).toBe(90_000);
    expect(await repo.listRecords(personal, '2026-11')).toEqual([]);
    expect(await code(repo.createRecord(newOperationKey(), b.id, 'despesa', { accountId: caio.personalAcc, amountCents: 1, occurredOn: '2026-11-06', description: 'x', category: null }))).toBe(
      'conta_invalida',
    );
    // Orçamento com as categorias do negócio.
    const budget = await repo.getMonthBudget(b.id, '2026-11');
    expect(budget.lines.map((l) => l.category)).toEqual(budgetCategoriesFor('negocio'));
    expect(budget.lines.find((l) => l.category === 'Material e mercadoria')!.usedCents).toBe(30_000);
    await repo.setCategoryBudget(newOperationKey(), b.id, 'Material e mercadoria', '2026-11', 0, 40_000);
    expect(await code(repo.setCategoryBudget(newOperationKey(), b.id, 'Moradia', '2026-11', 0, 40_000))).toBe('categoria_invalida');
    expect(await code(repo.setCategoryBudget(newOperationKey(), personal, 'Impostos e DAS', '2026-11', 0, 40_000))).toBe('categoria_invalida');
    expect((await repo.getMonthBudget(personal, '2026-11')).lines.map((l) => l.category)).toEqual(CATEGORIES.despesa);
    // Um cartão do negócio.
    const card = await repo.createCard(newOperationKey(), b.id, { name: 'Cartão do negócio', lastDigits: '4321', closingDay: 3, dueDay: 10, limitCents: 300_000 });
    expect(card.card.contextId).toBe(b.id);
    // Metas e investimentos: fora do negócio.
    expect(
      await code(
        repo.createGoal(newOperationKey(), b.id, {
          goalType: 'objetivo',
          name: 'Freezer',
          targetCents: 300_000,
          targetMonth: '2027-06',
          plannedMonthlyCents: null,
          essentialBaseCents: null,
          essentialMonths: null,
          essentialBaseSource: null,
          initialCents: null,
          initialOn: null,
        }),
      ),
    ).toBe('contexto_invalido');
    expect(await code(repo.createInvestment(newOperationKey(), b.id, { name: 'Caixa', kind: 'renda_fixa', investedCents: 1000, startOn: '2026-11-01', currentCents: null }))).toBe(
      'contexto_invalido',
    );
    // O Caio não lê nem anota no negócio da Bia.
    expect(await caio.repo.getBusiness()).toBeNull();
    expect(await caio.repo.listRecords(b.id, '2026-11')).toEqual([]);
    expect(await caio.repo.listAccounts(b.id)).toEqual([]);
    expect(await code(caio.repo.createRecord(newOperationKey(), b.id, 'receita', { accountId: acc, amountCents: 1, occurredOn: '2026-11-06', description: 'x', category: null }))).toBe(
      'sem_permissao',
    );
    expect(await code(caio.repo.renameBusiness(newOperationKey(), b.id, 'Meu'))).toBe('nao_encontrado');
    expect(await code(repo.renameBusiness(newOperationKey(), personal, 'Meu'))).toBe('contexto_invalido');
  });

  it('retirada para o Pessoal: ligada nos dois lados, cada lado uma vez, travada e excluída junto', async () => {
    const { repo, personal, personalAcc } = await person();
    const b = await repo.createBusiness(newOperationKey(), 'Sacolé da Bia');
    const acc = (await repo.listAccounts(b.id))[0]!.id;
    await repo.createRecord(newOperationKey(), b.id, 'receita', { accountId: acc, amountCents: 120_000, occurredOn: '2026-11-05', description: 'Vendas', category: 'Vendas' });
    const input = { businessAccountId: acc, personalAccountId: personalAcc, amountCents: 50_000, occurredOn: '2026-11-15', description: null };
    expect(await code(repo.createBusinessWithdrawal(newOperationKey(), b.id, { ...input, businessAccountId: personalAcc }))).toBe('conta_invalida');
    expect(await code(repo.createBusinessWithdrawal(newOperationKey(), b.id, { ...input, occurredOn: '2026-11-18' }))).toBe('data_futura');
    expect(await code(repo.createBusinessWithdrawal(newOperationKey(), personal, input))).toBe('contexto_invalido');
    const key = newOperationKey();
    const w = await repo.createBusinessWithdrawal(key, b.id, input);
    expect(w.businessRecord).toMatchObject({ contextId: b.id, kind: 'despesa', category: 'Retirada para o Pessoal', description: 'Retirada para o Pessoal', pairedRecordId: w.personalRecord.id });
    expect(w.personalRecord).toMatchObject({ contextId: personal, kind: 'receita', category: 'Retirada do negócio', description: 'Retirada de Sacolé da Bia', pairedRecordId: w.businessRecord.id });
    expect(await repo.createBusinessWithdrawal(key, b.id, input)).toEqual(w);
    expect(await code(repo.createBusinessWithdrawal(key, b.id, { ...input, amountCents: 50_001 }))).toBe('chave_reutilizada');
    // Cada lado conta uma vez, no próprio espaço; em "Seu negócio", a retirada fica fora de Saiu.
    const bRecords = await repo.listRecords(b.id, '2026-11');
    expect(summarizeMonth(bRecords, b.id, '2026-11')).toMatchObject({ receivedCents: 120_000, paidCents: 50_000 });
    expect(businessMonth(bRecords, b.id, '2026-11')).toMatchObject({ outCents: 0, leftCents: 120_000, withdrawnCents: 50_000, keptCents: 70_000 });
    expect(summarizeMonth(await repo.listRecords(personal, '2026-11'), personal, '2026-11')).toMatchObject({ receivedCents: 50_000, paidCents: 0 });
    // Travada: editar, excluir, mover e ligar.
    const p = w.personalRecord;
    expect(await code(repo.updateRecord(newOperationKey(), p.id, 1, { accountId: personalAcc, amountCents: 60_000, occurredOn: '2026-11-15', description: 'x', category: null }))).toBe(
      'retirada_ligada',
    );
    expect(await code(repo.deleteRecord(newOperationKey(), w.businessRecord.id, 1))).toBe('retirada_ligada');
    expect(await code(repo.moveRecord(newOperationKey(), p.id, 1, b.id, acc, null))).toBe('lancamento_ligado');
    // Excluir pelo lado do Pessoal: os dois saem.
    const plain = bRecords.find((r) => r.kind === 'receita')!;
    expect(await code(repo.deleteBusinessWithdrawal(newOperationKey(), plain.id, 1))).toBe('nao_e_retirada');
    expect(await code(repo.deleteBusinessWithdrawal(newOperationKey(), p.id, 2))).toBe('versao_desatualizada');
    const gone = await repo.deleteBusinessWithdrawal(newOperationKey(), p.id, 1);
    expect([gone.businessRecord.version, gone.personalRecord.version]).toEqual([2, 2]);
    expect(await repo.getRecord(p.id)).toBeNull();
    expect(await repo.getRecord(w.businessRecord.id)).toBeNull();
    expect(summarizeMonth(await repo.listRecords(personal, '2026-11'), personal, '2026-11').receivedCents).toBe(0);
  });

  it('mover entre o Pessoal e o negócio, e as recusas', async () => {
    const { repo, personal, personalAcc } = await person();
    const b = await repo.createBusiness(newOperationKey(), 'Sacolé da Bia');
    const acc = (await repo.listAccounts(b.id))[0]!.id;
    const r = await repo.createRecord(newOperationKey(), personal, 'despesa', {
      accountId: personalAcc,
      amountCents: 4_500,
      occurredOn: '2026-11-12',
      description: 'Gasolina da entrega',
      category: 'Transporte',
      subcategory: 'Combustível',
    });
    expect(await code(repo.moveRecord(newOperationKey(), r.id, 2, b.id, acc, 'Combustível e transporte'))).toBe('versao_desatualizada');
    expect(await code(repo.moveRecord(newOperationKey(), r.id, 1, personal, personalAcc, null))).toBe('contexto_invalido');
    expect(await code(repo.moveRecord(newOperationKey(), r.id, 1, b.id, personalAcc, null))).toBe('conta_invalida');
    const key = newOperationKey();
    const moved = await repo.moveRecord(key, r.id, 1, b.id, acc, ' Combustível e transporte ');
    expect(moved).toMatchObject({ contextId: b.id, accountId: acc, kind: 'despesa', amountCents: 4_500, description: 'Gasolina da entrega', category: 'Combustível e transporte', version: 1 });
    expect(moved.subcategory ?? null).toBeNull();
    expect(moved.id).not.toBe(r.id);
    expect(await repo.getRecord(r.id)).toBeNull();
    expect(await repo.moveRecord(key, r.id, 1, b.id, acc, ' Combustível e transporte ')).toEqual(moved);
    const back = await repo.moveRecord(newOperationKey(), moved.id, 1, personal, personalAcc, null);
    expect(back).toMatchObject({ contextId: personal, category: null });
    // Pagamento de conta a pagar não muda de espaço.
    const c = await repo.createCommitment(newOperationKey(), personal, { description: 'Internet', amountCents: 9_900, dueOn: '2026-11-10', category: 'Moradia' });
    const paid = await repo.payCommitment(newOperationKey(), c.commitment.id, c.commitment.version, { accountId: personalAcc, amountCents: 9_900, paidOn: '2026-11-10', category: 'Moradia' });
    expect(await code(repo.moveRecord(newOperationKey(), paid.record!.id, 1, b.id, acc, null))).toBe('lancamento_ligado');
  });

  it('renomear, encerrar (desliga as retiradas) e criar outro; excluir a conta apaga o negócio', async () => {
    const { repo, personal, personalAcc } = await person();
    const b = await repo.createBusiness(newOperationKey(), 'Sacolé da Bia');
    const acc = (await repo.listAccounts(b.id))[0]!.id;
    expect(await code(repo.renameBusiness(newOperationKey(), b.id, ''))).toBe('nome_do_negocio_invalido');
    expect((await repo.renameBusiness(newOperationKey(), b.id, 'Sacolés da Bia')).name).toBe('Sacolés da Bia');
    const w = await repo.createBusinessWithdrawal(newOperationKey(), b.id, {
      businessAccountId: acc,
      personalAccountId: personalAcc,
      amountCents: 1_000,
      occurredOn: '2026-11-16',
      description: 'Pró-labore',
    });
    const endKey = newOperationKey();
    await repo.endBusiness(endKey, b.id);
    await repo.endBusiness(endKey, b.id);
    expect(await repo.getBusiness()).toBeNull();
    expect(await repo.listRecords(b.id, '2026-11')).toEqual([]);
    const p = (await repo.getRecord(w.personalRecord.id))!;
    expect(p.pairedRecordId ?? null).toBeNull();
    expect((await repo.updateRecord(newOperationKey(), p.id, p.version, { accountId: personalAcc, amountCents: 1_200, occurredOn: '2026-11-16', description: 'Pró-labore', category: 'Retirada do negócio' })).amountCents).toBe(1_200);
    const again = await repo.createBusiness(newOperationKey(), 'Conserto de ar-condicionado');
    expect(again.id).not.toBe(b.id);
    expect(summarizeMonth(await repo.listRecords(personal, '2026-11'), personal, '2026-11').receivedCents).toBe(1_200);
    await repo.deleteMyAccount('EXCLUIR', newOperationKey());
    expect(await repo.getBusiness()).toBeNull();
  });
});

describe('demonstração: o negócio de exemplo não muda o Pessoal', () => {
  it('a demonstração padrão não tem negócio, mas deixa criar um, só na memória', async () => {
    const repo = await createDemoRepository();
    expect(await repo.getBusiness()).toBeNull();
    const b = await repo.createBusiness(newOperationKey(), 'Brigadeiros da Maria');
    expect((await repo.getBusiness())!.name).toBe('Brigadeiros da Maria');
    const space = (await repo.getSpace())!;
    const s = summarizeMonth(await repo.listRecords(space.personalContextId, '2026-10'), space.personalContextId, '2026-10');
    expect([s.receivedCents, s.paidCents]).toEqual([600_000, 390_000]);
    expect(await repo.listRecords(b.id, '2026-10')).toEqual([]);
  });

  it('cenário "negocio": "Sacolé da Maria" com setembro e outubro, e o Pessoal com os totais de sempre', async () => {
    expect(demoScenarioFrom('negocio')).toBe('negocio');
    const repo = await createDemoRepository({ scenario: 'negocio' });
    const b = (await repo.getBusiness())!;
    expect(b.name).toBe(DEMO_BUSINESS_NAME);
    expect(DEMO_BUSINESS_NAME).toBe('Sacolé da Maria');
    const sep = await repo.listRecords(b.id, '2026-09');
    const oct = await repo.listRecords(b.id, '2026-10');
    expect(businessMonth(sep, b.id, '2026-09')).toMatchObject({ inCents: 176_000, outCents: 60_100, leftCents: 115_900, withdrawnCents: 0 });
    expect(businessMonth(oct, b.id, '2026-10')).toMatchObject({ inCents: 76_000, outCents: 41_800, leftCents: 34_200, withdrawnCents: 0 });
    expect(businessTopOut(oct, b.id, '2026-10')[0]).toMatchObject({ category: 'Material e mercadoria', cents: 28_000 });
    for (const r of [...sep, ...oct]) expect(contextCategories('negocio', r.kind)).toContain(r.category);
    // O Pessoal: R$ 6.000 recebidos e R$ 3.900 pagos em outubro, como sempre; as contas do Pessoal não ganham a do negócio.
    const space = (await repo.getSpace())!;
    const s = summarizeMonth(await repo.listRecords(space.personalContextId, '2026-10'), space.personalContextId, '2026-10');
    expect([s.receivedCents, s.paidCents, s.differenceCents]).toEqual([600_000, 390_000, 210_000]);
    expect(space.accounts.map((a) => a.name)).toEqual(['Conta principal', 'Carteira']);
    expect(DEMO_TODAY).toBe('2026-10-07');
    // Os cenários de retorno e da Evolução não têm negócio.
    expect(await (await createDemoRepository({ scenario: 'retorno' })).getBusiness()).toBeNull();
    expect(await (await createDemoRepository({ scenario: 'evolucao' })).getBusiness()).toBeNull();
  });
});

describe('correções da revisão independente (D-113a)', () => {
  const month = (leftCents: number): BusinessMonth => ({
    month: '2026-10',
    inCents: 10_000,
    outCents: 10_000 - leftCents,
    leftCents,
    outsideInCents: 0,
    outsideOutCents: 0,
    outside: [],
    withdrawnCents: 0,
    keptCents: leftCents,
    recordCount: 2,
  });

  it('valores ocultos: o nome acessível da linha do mês não diz "menos" (o valor vira "valor oculto" na tela)', () => {
    expect(BUSINESS_TEXT.monthRowA11y(month(-30_000))).toBe('outubro de 2026: entrou R$ 100,00, saiu R$ 400,00, sobrou menos R$ 300,00');
    const hidden = BUSINESS_TEXT.monthRowA11y(month(-30_000), true);
    expect(hidden).not.toContain('menos');
    expect(hidden).toBe('outubro de 2026: entrou R$ 100,00, saiu R$ 400,00, sobrou R$ 300,00');
    expect(BUSINESS_TEXT.monthRowA11y(month(5_000), true)).toBe(BUSINESS_TEXT.monthRowA11y(month(5_000)));
  });

  it('a busca no negócio oferece as categorias do negócio, e uma categoria do Pessoal não vale lá', () => {
    expect(searchCategoryOptions('despesa', 'negocio')).toEqual([...BUSINESS_CATEGORIES.despesa, NO_CATEGORY_LABEL]);
    expect(searchCategoryOptions('receita', 'negocio')).toEqual([...BUSINESS_CATEGORIES.receita, NO_CATEGORY_LABEL]);
    expect(searchCategoryOptions('todos', 'negocio')).toEqual([...BUSINESS_CATEGORIES.despesa, ...BUSINESS_CATEGORIES.receita, NO_CATEGORY_LABEL]);
    expect(searchCategoryOptions('despesa', 'familia')).toEqual(searchCategoryOptions('despesa'));
    expect(effectiveSearchCategory('despesa', 'Mercado', 'negocio')).toBeNull();
    expect(effectiveSearchCategory('despesa', 'Impostos e DAS', 'negocio')).toBe('Impostos e DAS');
    expect(effectiveSearchCategory('despesa', 'Impostos e DAS')).toBeNull();
    const draft = { text: '', kind: 'despesa' as const, period: '3m' as const, category: 'Impostos e DAS', accountId: null, min: '', max: '' };
    const inBusiness = searchFromDraft(draft, 'negocio');
    expect(inBusiness.ok && inBusiness.params.category).toBe('Impostos e DAS');
    const inPersonal = searchFromDraft(draft);
    expect(inPersonal.ok && inPersonal.params.category).toBeNull();
    expect(moreFiltersActive(draft, 'negocio')).toBe(1);
    expect(moreFiltersActive(draft)).toBe(0);
  });

  it('"Descartar o preenchimento?" no negócio diz o nome do negócio', () => {
    expect(unsavedChangesText('negocio', 'Sacolé da Mãe')).toBe('Você tem alterações que ainda não foram salvas em Sacolé da Mãe.');
    expect(unsavedChangesText('negocio', null)).toBe('Você tem alterações que ainda não foram salvas em Negócio.');
    expect(unsavedChangesText('pessoal')).toBe('Você tem alterações que ainda não foram salvas em Pessoal.');
  });

  it('WhatsApp e Telegram: o canal continua ligado ao Pessoal ou à Família (o código de ligar recusa o negócio); a palavra "negócio" anota no negócio de quem administra (27/11/2026)', async () => {
    // Quem administra: a palavra "negócio" no começo da mensagem (migração 0049). No negócio de outra pessoa (Plus, desligado), a frase de antes.
    expect(BUSINESS_TEXT.chatNoteOwner).toBe('Pelo Telegram, comece a mensagem com a palavra negócio para anotar no espaço Negócio, como negócio material 120.');
    expect(BUSINESS_TEXT.chatNote).toBe('O WhatsApp e o Telegram não anotam no espaço Negócio.');
    const entry = guideEntry('negocio')!;
    expect(entry.steps.at(-1)).toContain(BUSINESS_TEXT.chatNoteOwner);
    expect(entry.steps.join(' ')).not.toContain(BUSINESS_TEXT.chatNote);
    expect(guideEntry('telegram')!.steps.join(' ')).toContain('Com o espaço Negócio, comece com a palavra negócio para anotar nele, como negócio material 120.');
    for (const t of [BUSINESS_TEXT.chatNote, BUSINESS_TEXT.chatNoteOwner, ...entry.steps]) {
      expect(t).not.toContain('vão para o Pessoal');
      expect(t).not.toMatch(FORBIDDEN);
      expect(t).not.toMatch(JUDGMENT);
    }
    const { repo, personal } = await person();
    const b = await repo.createBusiness(newOperationKey(), 'Sacolé da Bia');
    expect(await code(repo.createChatCode('telegram', newOperationKey(), b.id))).toBe('contexto_invalido');
    expect(await code(repo.createChatCode('whatsapp', newOperationKey(), b.id))).toBe('contexto_invalido');
    expect((await repo.createChatCode('telegram', newOperationKey(), personal)).contextId).toBe(personal);
  });
});
