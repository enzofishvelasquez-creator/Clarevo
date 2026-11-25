import { describe, expect, it } from 'vitest';
import {
  APP_SCREENS,
  CSV_BUSINESS_RECORD_HEADER,
  CSV_EOL,
  CSV_RECORD_HEADER,
  EXPORT_TEXT,
  MEI_REMINDER_ID_PREFIX,
  MEI_REMINDER_LIMIT,
  MEI_REMINDER_TEXT,
  MemoryBusinessHub,
  MemoryRepository,
  NO_MEI_REMINDERS,
  NO_RECORD_MARKS,
  PAYER_KIND_LABEL,
  RECEIVABLE_CATEGORIES,
  RECEIVABLE_ERROR_TEXT,
  RECEIVABLE_KINDS,
  RECEIVABLE_KIND_HINT,
  RECEIVABLE_KIND_LABEL,
  RECEIVABLE_TEXT,
  RECORD_MARKS_TEXT,
  REMINDER_LIMIT,
  ROUTINE_REMINDER_LIMIT,
  RepoError,
  anyMeiReminder,
  barModeFor,
  buildExportFiles,
  buildRecordsCsv,
  businessMonth,
  businessYearMarks,
  canMoveRecord,
  createDemoRepository,
  exportRows,
  guideEntry,
  isRoutineReminderId,
  meiReminderPlan,
  newOperationKey,
  openReceivables,
  parseMeiReminderChoices,
  receivableCaption,
  receivableDateText,
  receivableErrorText,
  receivableInputError,
  receivableSituation,
  receivablesSummary,
  recentReceived,
  summarizeMonth,
  validateReceivableDraft,
  validateReceiveDraft,
  type FinancialRecord,
  type Receivable,
  type ReceivableInput,
} from '../src';

/**
 * Espaço Negócio, D-122 (25/11/2026, a partir da pesquisa de 18/11, itens 3, 8 e 9): "A receber" (fiado, venda no cartão que ainda vai cair
 * e outro valor), as marcas da entrada do negócio (nota fiscal e quem pagou) e os lembretes do MEI. As mesmas regras da migração 0045.
 */

/** Termos que nenhum texto do app usa (o mesmo critério de copy.test.ts), travessões e a expressão proibida. */
const FORBIDDEN =
  /\b(recomendamos|recomendo|invista|aplique|tesouro|cdb|lci|lca|caixinha|cofrinho)\b|fundo de investimento|rentabilidade garantida|rendimento garantido|retorno garantido|enriquec|faz(er|endo)?\s+sentido|[–—]/i;
/** Julgamento, pressão, cobrança e alerta: o que falta receber e o que passou da data são só fatos. */
const JUDGMENT =
  /\b(preju[ií]zo|lucro|cuidado|aten[cç][aã]o|alerta|ruim|ótimo|parab[eé]ns|deveria|precisa|urgente|atrasad\w*|caloteir\w*|inadimpl\w*|devedor\w*|cobr(e|ar|an[cç]a)|ultrapass|estourou|perigo)\b/i;
/** Nada de orientação de imposto: não diz o que declarar nem o que pagar. */
const NOT_TAX = /livro[- ]caixa|declara[cç][aã]o pronta|antes de declarar|declare\b|pague\b|voc[eê] deve (declarar|pagar)|sua contabilidade|calcul\w* (o|do) (das|imposto)/i;

const TODAY = '2026-11-17';

async function person(actorId = 'bia', business?: MemoryBusinessHub, today = TODAY) {
  const repo = new MemoryRepository({ actorId, displayName: actorId, today: () => today, ...(business ? { business } : {}) });
  const space = await repo.ensurePersonalSpace('Conta principal');
  return { repo, space, personal: space.personalContextId, personalAcc: space.accounts[0]!.id };
}

async function withBusiness(actorId = 'bia', business?: MemoryBusinessHub) {
  const p = await person(actorId, business);
  const b = await p.repo.createBusiness(newOperationKey(), 'Sacolé da Bia');
  const acc = (await p.repo.listAccounts(b.id))[0]!.id;
  return { ...p, b, acc };
}

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return 'passou';
  } catch (e) {
    return e instanceof RepoError ? e.code : String(e);
  }
};

const fiado = (over: Partial<ReceivableInput> = {}): ReceivableInput => ({
  kind: 'fiado',
  description: '10 sacolés',
  amountCents: 3_000,
  expectedOn: '2026-11-25',
  category: 'Vendas',
  debtor: 'Ana',
  ...over,
});

const rec = (over: Partial<FinancialRecord>): FinancialRecord => ({
  id: over.id ?? `r-${Math.random().toString(36).slice(2, 10)}`,
  contextId: 'neg',
  accountId: 'acc',
  kind: 'receita',
  status: 'realizado',
  amountCents: 1000,
  currency: 'BRL',
  occurredOn: '2026-10-05',
  description: 'x',
  category: 'Vendas',
  commitmentId: null,
  invoice: null,
  receiptKey: null,
  createdBy: 'p',
  version: 1,
  createdAt: '2026-10-05T12:00:00.000Z',
  updatedAt: '2026-10-05T12:00:00.000Z',
  ...over,
});

const open = (over: Partial<Receivable> = {}): Receivable => ({
  id: 'rec-1',
  contextId: 'neg',
  kind: 'fiado',
  description: '10 sacolés',
  amountCents: 3_000,
  expectedOn: '2026-11-25',
  category: 'Vendas',
  debtor: null,
  status: 'aberto',
  received: null,
  createdBy: 'bia',
  version: 1,
  createdAt: '2026-11-10T12:00:00.000Z',
  updatedAt: '2026-11-10T12:00:00.000Z',
  ...over,
});

/** Todos os textos de um objeto de textos, chamando as funções com valores de exemplo. */
function textsOf(obj: Record<string, unknown>, samples: unknown[][]): string[] {
  return Object.values(obj).flatMap((v) => {
    if (typeof v === 'string') return [v];
    if (typeof v === 'object' && v !== null) return textsOf(v as Record<string, unknown>, samples);
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

describe('textos do D-122: fatos, numa cor só, sem cobrança e sem orientação de imposto', () => {
  const samples: unknown[][] = [[3, '2026-11-20', TODAY], [1, null, TODAY], [12_345], [2], [open(), TODAY], [open({ kind: 'cartao' })], ['fiado'], ['cartao'], [null], [true], [false]];
  const all = [
    ...textsOf(RECEIVABLE_TEXT as unknown as Record<string, unknown>, samples),
    ...textsOf(RECEIVABLE_ERROR_TEXT as unknown as Record<string, unknown>, samples),
    ...textsOf(RECORD_MARKS_TEXT as unknown as Record<string, unknown>, samples),
    ...textsOf(MEI_REMINDER_TEXT as unknown as Record<string, unknown>, samples),
    ...Object.values(RECEIVABLE_KIND_LABEL),
    ...Object.values(RECEIVABLE_KIND_HINT),
    ...Object.values(PAYER_KIND_LABEL),
    EXPORT_TEXT.contentCsvBusiness,
  ];

  it('nenhum termo proibido, travessão, julgamento, cobrança ou orientação de imposto', () => {
    expect(all.length).toBeGreaterThan(80);
    for (const t of all) {
      expect(t, t).not.toMatch(FORBIDDEN);
      expect(t, t).not.toMatch(JUDGMENT);
      expect(t, t).not.toMatch(NOT_TAX);
    }
  });

  it('o nome de quem deve: só o nome, com a dica de não escrever CPF nem outros dados; "Os valores são os que você anotou."', () => {
    expect(RECEIVABLE_TEXT.debtorLabel).toBe('Quem deve (opcional)');
    expect(RECEIVABLE_TEXT.debtorHint).toBe('Só o nome ou um apelido. Não escreva CPF, telefone nem outros dados da pessoa.');
    expect(RECEIVABLE_TEXT.notAdvice).toBe('Os valores são os que você anotou.');
    expect(RECEIVABLE_KIND_LABEL).toEqual({ fiado: 'Venda no fiado', cartao: 'Venda no cartão', outro: 'Outro valor a receber' });
    expect(RECEIVABLE_KINDS).toEqual(['fiado', 'cartao', 'outro']);
    expect(RECEIVABLE_CATEGORIES).toEqual(['Vendas', 'Serviços', 'Outras entradas']);
    // Não entra em total nenhum: a frase do cartão e do formulário.
    expect(RECEIVABLE_TEXT.cardNote).toBe('Não entra em Entrou nem em Saiu: o dinheiro entra quando você marca como recebido.');
  });

  it('os lembretes do MEI: datas simples, com o texto da especificação', () => {
    expect(MEI_REMINDER_TEXT.kinds.das).toMatchObject({ toggle: 'DAS do mês', body: 'O DAS do MEI vence no dia 20.' });
    expect(MEI_REMINDER_TEXT.kinds.declaracao).toMatchObject({ toggle: 'Declaração anual do MEI', body: 'A declaração anual do MEI vai até 31 de maio.' });
    expect(MEI_REMINDER_TEXT.intro).toContain('a Clarevo não calcula imposto');
  });

  it('as marcas: "Teve nota fiscal?" e "Quem pagou", com Pessoa física, Empresa e Exterior', () => {
    expect(RECORD_MARKS_TEXT.section).toBe('Mais detalhes (opcional)');
    expect(RECORD_MARKS_TEXT.invoiceLabel).toBe('Teve nota fiscal?');
    expect(RECORD_MARKS_TEXT.payerLabel).toBe('Quem pagou');
    expect(PAYER_KIND_LABEL).toEqual({ pf: 'Pessoa física', pj: 'Empresa', exterior: 'Exterior' });
  });

  it('o guia do negócio ensina o "A receber", as marcas e os lembretes do MEI, sem passar de 6 passos', () => {
    const entry = guideEntry('negocio')!;
    const steps = entry.steps.join(' ');
    for (const piece of [RECEIVABLE_TEXT.cardTitle, RECEIVABLE_TEXT.receive, RECORD_MARKS_TEXT.section, MEI_REMINDER_TEXT.title]) expect(steps).toContain(piece);
    expect(entry.steps.length).toBeLessThanOrEqual(6);
    expect(entry.routes).toEqual(expect.arrayContaining(['/negocio/a-receber', '/negocio/a-receber/[id]']));
    for (const t of entry.steps) {
      expect(t).not.toMatch(FORBIDDEN);
      expect(t).not.toMatch(NOT_TAX);
    }
    const screen = APP_SCREENS.find((s) => s.id === 'a-receber')!;
    expect(screen).toMatchObject({ title: 'A receber', href: '/negocio/a-receber' });
  });

  it('as telas: a lista e o detalhe são de consulta (com a barra); anotar, editar e "Recebi" são formulários', () => {
    expect(barModeFor('/negocio/a-receber')).toBe('consulta');
    expect(barModeFor('/negocio/a-receber/abc')).toBe('consulta');
    expect(barModeFor('/negocio/a-receber/novo')).toBe('formulario');
    expect(barModeFor('/negocio/a-receber/abc/editar')).toBe('formulario');
    expect(barModeFor('/negocio/a-receber/abc/receber')).toBe('formulario');
  });
});

describe('regras do "a receber" (as do banco, clarevo_check_receivable)', () => {
  it('os campos, na ordem do banco', () => {
    expect(receivableInputError(fiado())).toBeNull();
    expect(receivableInputError(fiado({ kind: 'pix' as never }))).toBe('tipo_invalido');
    expect(receivableInputError(fiado({ description: '' }))).toBe('descricao_invalida');
    expect(receivableInputError(fiado({ description: 'x'.repeat(81) }))).toBe('descricao_invalida');
    expect(receivableInputError(fiado({ description: 'x'.repeat(80) }))).toBeNull();
    expect(receivableInputError(fiado({ amountCents: 0 }))).toBe('valor_invalido');
    expect(receivableInputError(fiado({ amountCents: 1_000_000_000 }))).toBe('valor_invalido');
    expect(receivableInputError(fiado({ expectedOn: '1999-12-31' }))).toBe('data_invalida');
    expect(receivableInputError(fiado({ expectedOn: '2101-01-01' }))).toBe('data_invalida');
    expect(receivableInputError(fiado({ expectedOn: '2026-02-30' }))).toBe('data_invalida');
    expect(receivableInputError(fiado({ category: 'Empréstimo recebido' }))).toBe('categoria_invalida');
    expect(receivableInputError(fiado({ debtor: 'x'.repeat(61) }))).toBe('nome_invalido');
    // Uma data que já passou vale (o fiado combinado para a semana passada).
    expect(receivableInputError(fiado({ expectedOn: '2026-11-01' }))).toBeNull();
  });

  it('o preenchimento: valor e data como a pessoa digita; o nome de quem deve não vai no cartão', () => {
    const ok = validateReceivableDraft({ kind: 'cartao', description: ' Feira ', amountText: '1.234,56', dateText: '15/12/2026', category: 'Vendas', debtor: 'Ana' });
    expect(ok).toEqual({ ok: true, input: { kind: 'cartao', description: 'Feira', amountCents: 123_456, expectedOn: '2026-12-15', category: 'Vendas', debtor: null } });
    const blank = validateReceivableDraft({ kind: 'fiado', description: 'x', amountText: '30', dateText: '20/11/2026', category: 'Serviços', debtor: '   ' });
    expect(blank.ok && blank.input.debtor).toBeNull();
    const bad = validateReceivableDraft({ kind: null, description: '', amountText: '', dateText: '31/02/2026', category: null, debtor: '' });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(Object.keys(bad.errors).sort()).toEqual(['amountText', 'category', 'dateText', 'description', 'kind']);
  });

  it('"Recebi": valor, data até hoje e a conta', () => {
    expect(validateReceiveDraft({ amountText: '28,50', dateText: '17/11/2026', accountId: 'acc' }, TODAY)).toEqual({
      ok: true,
      input: { accountId: 'acc', amountCents: 2_850, receivedOn: TODAY },
    });
    const bad = validateReceiveDraft({ amountText: '0', dateText: '18/11/2026', accountId: '' }, TODAY);
    expect(bad.ok ? null : bad.errors).toEqual({ amountText: expect.any(String), dateText: RECEIVABLE_ERROR_TEXT.data_futura, accountId: expect.any(String) });
  });

  it('a situação e a legenda: "Passou da data combinada" é texto neutro; o cartão diz "prevista"', () => {
    expect(receivableSituation(open({ expectedOn: '2026-11-20' }), TODAY)).toBe('a_receber');
    expect(receivableSituation(open({ expectedOn: TODAY }), TODAY)).toBe('hoje');
    expect(receivableSituation(open({ expectedOn: '2026-11-05' }), TODAY)).toBe('passou');
    expect(receivableSituation(open({ status: 'recebido', expectedOn: '2026-11-05' }), TODAY)).toBe('recebido');
    expect(receivableDateText(open({ expectedOn: '2026-11-20' }), TODAY)).toBe('Combinada para 20/11');
    expect(receivableDateText(open({ expectedOn: TODAY }), TODAY)).toBe('Combinada para hoje');
    expect(receivableDateText(open({ expectedOn: '2026-11-05' }), TODAY)).toBe('Passou da data combinada (05/11)');
    expect(receivableDateText(open({ kind: 'cartao', expectedOn: '2026-11-05' }), TODAY)).toBe('Passou da data prevista (05/11)');
    expect(receivableDateText(open({ kind: 'cartao', expectedOn: '2027-01-05' }), TODAY)).toBe('Prevista para 05/01/2027');
    expect(receivableDateText(open({ status: 'recebido', received: { recordId: 'r', amountCents: 2_800, receivedOn: '2026-11-16', accountId: 'a' } }), TODAY)).toBe('Recebido em 16/11');
    expect(receivableCaption(open({ debtor: 'Ana', expectedOn: '2026-11-20' }), TODAY)).toBe('Fiado · Ana · Combinada para 20/11');
    expect(receivableCaption(open({ kind: 'outro', expectedOn: '2026-11-20' }), TODAY)).toBe('Outro valor · Combinada para 20/11');
  });

  it('o resumo do cartão: total em aberto, quantos, a próxima data e quantos passaram da data; os recebidos ficam de fora', () => {
    const list = [
      open({ id: 'a', amountCents: 1_000, expectedOn: '2026-11-05' }),
      open({ id: 'b', amountCents: 2_000, expectedOn: '2026-11-25' }),
      open({ id: 'c', amountCents: 3_000, expectedOn: '2026-11-19' }),
      open({ id: 'd', amountCents: 9_000, status: 'recebido', expectedOn: '2026-11-18' }),
    ];
    expect(receivablesSummary(list, TODAY)).toEqual({ openCents: 6_000, openCount: 3, nextOn: '2026-11-19', pastCount: 1 });
    expect(receivablesSummary([open({ expectedOn: '2026-11-05' })], TODAY).nextOn).toBe('2026-11-05');
    expect(receivablesSummary([], TODAY)).toEqual({ openCents: 0, openCount: 0, nextOn: null, pastCount: 0 });
    expect(openReceivables(list).map((r) => r.id)).toEqual(['a', 'c', 'b']);
    expect(RECEIVABLE_TEXT.cardCount(3, '2026-11-19', TODAY)).toBe('3 valores · próxima data: 19/11');
    expect(RECEIVABLE_TEXT.cardCount(1, TODAY, TODAY)).toBe('1 valor · data: hoje');
    expect(RECEIVABLE_TEXT.cardPast(1)).toBe('1 passou da data.');
    const received = [
      open({ id: 'x', status: 'recebido', received: { recordId: 'r1', amountCents: 1, receivedOn: '2026-11-02', accountId: 'a' } }),
      open({ id: 'y', status: 'recebido', received: { recordId: 'r2', amountCents: 1, receivedOn: '2026-11-15', accountId: 'a' } }),
    ];
    // Sem a entrada lida, vale o dia da última mudança (10/11 para "d").
    expect(recentReceived([...list, ...received]).map((r) => r.id)).toEqual(['y', 'd', 'x']);
  });

  it('erros: os do banco com texto próprio; o resto cai em "Não foi possível salvar"', () => {
    expect(receivableErrorText('ja_recebido')).toBe('Este valor já foi marcado como recebido. Atualize a tela.');
    expect(receivableErrorText('recebimento_ligado')).toContain('continua entrada');
    expect(receivableErrorText('qualquer')).toBe(RECEIVABLE_ERROR_TEXT.salvar_falhou);
  });
});

describe('"a receber" na memória (as quatro funções da 0045)', () => {
  it('anotar: recusas, repetição pela chave e o "a receber" fora de qualquer total', async () => {
    const { repo, personal, b } = await withBusiness();
    expect(await code(repo.createReceivable(newOperationKey(), personal, fiado()))).toBe('contexto_invalido');
    expect(await code(repo.createReceivable(newOperationKey(), 'nada', fiado()))).toBe('nao_encontrado');
    expect(await code(repo.createReceivable(newOperationKey(), b.id, fiado({ description: ' ' })))).toBe('descricao_invalida');
    expect(await code(repo.createReceivable(newOperationKey(), b.id, fiado({ category: 'Outras saídas' })))).toBe('categoria_invalida');
    const key = newOperationKey();
    const r = await repo.createReceivable(key, b.id, fiado({ description: ' 10 sacolés ', debtor: ' Ana ' }));
    expect(r).toMatchObject({ contextId: b.id, kind: 'fiado', description: '10 sacolés', debtor: 'Ana', status: 'aberto', received: null, createdBy: 'bia', version: 1 });
    expect(await repo.createReceivable(key, b.id, fiado({ description: '10 sacolés', debtor: 'Ana' }))).toEqual(r);
    expect(await code(repo.createReceivable(key, b.id, fiado({ amountCents: 3_001 })))).toBe('chave_reutilizada');
    expect(await repo.listReceivables(b.id)).toEqual([r]);
    expect(await repo.getReceivable(r.id)).toEqual(r);
    expect(await repo.listReceivables(personal)).toEqual([]);
    // Nada muda nos lançamentos nem nos totais do negócio.
    expect(await repo.listRecords(b.id, '2026-11')).toEqual([]);
    // Conta como anotação na atividade do negócio.
    expect((repo as unknown as { activity: Map<string, unknown> }).activity.has(b.id)).toBe(true);
  });

  it('alterar e excluir: só em aberto, com versão; repetir devolve o mesmo', async () => {
    const { repo, b } = await withBusiness();
    const r = await repo.createReceivable(newOperationKey(), b.id, fiado());
    expect(await code(repo.updateReceivable(newOperationKey(), r.id, 9, fiado()))).toBe('versao_desatualizada');
    const err = await repo.updateReceivable(newOperationKey(), r.id, 9, fiado()).catch((e: RepoError) => e);
    expect((err as RepoError).detail).toBe('versao_atual=1');
    const key = newOperationKey();
    const u = await repo.updateReceivable(key, r.id, 1, fiado({ kind: 'outro', amountCents: 4_000, debtor: null }));
    expect(u).toMatchObject({ kind: 'outro', amountCents: 4_000, debtor: null, version: 2 });
    expect(await repo.updateReceivable(key, r.id, 1, fiado({ kind: 'outro', amountCents: 4_000, debtor: null }))).toEqual(u);
    const d = await repo.deleteReceivable(newOperationKey(), r.id, 2);
    expect(d.version).toBe(3);
    expect(await repo.getReceivable(r.id)).toBeNull();
    expect(await repo.listReceivables(b.id)).toEqual([]);
    expect(await code(repo.deleteReceivable(newOperationKey(), r.id, 3))).toBe('nao_encontrado');
  });

  it('"Recebi": uma entrada comum no negócio, pela data em que entrou; o "a receber" passa a recebido e não muda mais', async () => {
    const { repo, personalAcc, b, acc } = await withBusiness();
    const r = await repo.createReceivable(newOperationKey(), b.id, fiado({ kind: 'cartao', description: 'Feira no cartão', amountCents: 50_000, debtor: null }));
    const bad = { accountId: acc, amountCents: 48_500, receivedOn: TODAY };
    expect(await code(repo.receiveReceivable(newOperationKey(), r.id, 1, { ...bad, accountId: personalAcc }))).toBe('conta_invalida');
    expect(await code(repo.receiveReceivable(newOperationKey(), r.id, 1, { ...bad, receivedOn: '2026-11-18' }))).toBe('data_futura');
    expect(await code(repo.receiveReceivable(newOperationKey(), r.id, 1, { ...bad, amountCents: 0 }))).toBe('valor_invalido');
    expect(await code(repo.receiveReceivable(newOperationKey(), r.id, 2, bad))).toBe('versao_desatualizada');
    const key = newOperationKey();
    const w = await repo.receiveReceivable(key, r.id, 1, bad);
    expect(w.record).toMatchObject({ contextId: b.id, kind: 'receita', amountCents: 48_500, occurredOn: TODAY, description: 'Feira no cartão', category: 'Vendas', receivableId: r.id });
    expect(w.receivable).toMatchObject({ status: 'recebido', version: 2, received: { recordId: w.record.id, amountCents: 48_500, receivedOn: TODAY, accountId: acc } });
    expect(await repo.receiveReceivable(key, r.id, 1, bad)).toEqual(w);
    expect(await code(repo.receiveReceivable(newOperationKey(), r.id, 2, bad))).toBe('ja_recebido');
    expect(await code(repo.updateReceivable(newOperationKey(), r.id, 2, fiado()))).toBe('ja_recebido');
    expect(await code(repo.deleteReceivable(newOperationKey(), r.id, 2))).toBe('ja_recebido');
    // A entrada conta como sempre: em Entrou de "Seu negócio" e no Recebido do Resumo do negócio.
    const records = await repo.listRecords(b.id, '2026-11');
    expect(businessMonth(records, b.id, '2026-11')).toMatchObject({ inCents: 48_500, outCents: 0 });
    expect(summarizeMonth(records, b.id, '2026-11')).toMatchObject({ receivedCents: 48_500 });
  });

  it('desfazer é excluir a entrada (a exclusão de sempre): o "a receber" volta para aberto; a entrada não vira gasto nem muda de espaço', async () => {
    const { repo, personal, personalAcc, b, acc } = await withBusiness();
    const r = await repo.createReceivable(newOperationKey(), b.id, fiado());
    const w = await repo.receiveReceivable(newOperationKey(), r.id, 1, { accountId: acc, amountCents: 3_000, receivedOn: '2026-11-16' });
    expect(canMoveRecord(w.record)).toBe(false);
    expect(await code(repo.moveRecord(newOperationKey(), w.record.id, 1, personal, personalAcc, null))).toBe('lancamento_ligado');
    const asExpense = { accountId: acc, amountCents: 3_000, occurredOn: '2026-11-16', description: '10 sacolés', category: null, kind: 'despesa' as const };
    expect(await code(repo.updateRecord(newOperationKey(), w.record.id, 1, asExpense))).toBe('recebimento_ligado');
    // Editar o valor e a data continua valendo (o recebido mostra o novo).
    const edited = await repo.updateRecord(newOperationKey(), w.record.id, 1, { accountId: acc, amountCents: 2_900, occurredOn: '2026-11-15', description: '10 sacolés', category: 'Vendas' });
    expect(edited.receivableId).toBe(r.id);
    expect((await repo.getReceivable(r.id))!.received).toMatchObject({ amountCents: 2_900, receivedOn: '2026-11-15' });
    const gone = await repo.deleteRecord(newOperationKey(), w.record.id, edited.version);
    expect(gone.receivableId).toBe(r.id);
    const back = (await repo.getReceivable(r.id))!;
    expect(back).toMatchObject({ status: 'aberto', received: null, version: 3 });
    // Recebe de novo, com a versão nova.
    const again = await repo.receiveReceivable(newOperationKey(), r.id, 3, { accountId: acc, amountCents: 3_000, receivedOn: TODAY });
    expect(again.receivable.status).toBe('recebido');
    expect(await repo.listRecords(b.id, '2026-11')).toHaveLength(1);
  });

  it('papéis (D-120): quem só vê não anota nem recebe; quem anota e vê altera só o que anotou e recebe qualquer um; quem administra altera tudo', async () => {
    const hub = new MemoryBusinessHub({ plusOpen: true });
    const bia = await withBusiness('bia', hub);
    const caio = await person('caio', hub);
    const duda = await person('duda', hub);
    await caio.repo.acceptBusinessInvite(newOperationKey(), (await bia.repo.createBusinessInvite(newOperationKey(), bia.b.id, 'leitor')).code!);
    await duda.repo.acceptBusinessInvite(newOperationKey(), (await bia.repo.createBusinessInvite(newOperationKey(), bia.b.id, 'membro')).code!);
    expect(await code(caio.repo.createReceivable(newOperationKey(), bia.b.id, fiado()))).toBe('sem_permissao');
    // Quem anota e vê anota e altera o que anotou.
    const own = await duda.repo.createReceivable(newOperationKey(), bia.b.id, fiado({ description: 'Bolo' }));
    expect((await duda.repo.updateReceivable(newOperationKey(), own.id, 1, fiado({ description: 'Bolo grande' }))).description).toBe('Bolo grande');
    // Na memória, cada pessoa guarda o que anota: o "a receber" de outra pessoa entra aqui com a autoria dela.
    const other = await duda.repo.createReceivable(newOperationKey(), bia.b.id, fiado({ description: 'Da Bia' }));
    const store = (duda.repo as unknown as { receivables: Map<string, { createdBy: string }> }).receivables;
    store.set(other.id, { ...store.get(other.id)!, createdBy: 'bia' });
    expect(await code(duda.repo.updateReceivable(newOperationKey(), other.id, 1, fiado()))).toBe('sem_permissao');
    expect(await code(duda.repo.deleteReceivable(newOperationKey(), other.id, 1))).toBe('sem_permissao');
    const dudaAcc = (await duda.repo.listAccounts(bia.b.id))[0]!.id;
    const got = await duda.repo.receiveReceivable(newOperationKey(), other.id, 1, { accountId: dudaAcc, amountCents: 3_000, receivedOn: TODAY });
    expect(got.receivable.status).toBe('recebido');
    // Quem administra altera o que outra pessoa anotou.
    const fromDuda = await bia.repo.createReceivable(newOperationKey(), bia.b.id, fiado({ description: 'Da Duda' }));
    const biaStore = (bia.repo as unknown as { receivables: Map<string, { createdBy: string }> }).receivables;
    biaStore.set(fromDuda.id, { ...biaStore.get(fromDuda.id)!, createdBy: 'duda' });
    expect((await bia.repo.deleteReceivable(newOperationKey(), fromDuda.id, 1)).id).toBe(fromDuda.id);
  });

  it('a lista: os em aberto pela data, e os recebidos mudados por último', async () => {
    const { repo, b, acc } = await withBusiness();
    const a = await repo.createReceivable(newOperationKey(), b.id, fiado({ description: 'A', expectedOn: '2026-11-30' }));
    const c = await repo.createReceivable(newOperationKey(), b.id, fiado({ description: 'C', expectedOn: '2026-11-02' }));
    const d = await repo.createReceivable(newOperationKey(), b.id, fiado({ description: 'D', expectedOn: '2026-11-20' }));
    await repo.receiveReceivable(newOperationKey(), d.id, 1, { accountId: acc, amountCents: 3_000, receivedOn: TODAY });
    expect((await repo.listReceivables(b.id)).map((r) => r.description)).toEqual(['C', 'A', 'D']);
    expect(a.id).not.toBe(c.id);
  });
});

describe('marcas da entrada do negócio (p_marks, 0045)', () => {
  it('só na entrada do negócio; ao criar, nulo é sem marcas; marcas fora da entrada do negócio, marcas_invalidas', async () => {
    const { repo, personal, personalAcc, b, acc } = await withBusiness();
    const base = { accountId: acc, amountCents: 10_000, occurredOn: TODAY, description: 'Vendas', category: 'Vendas' };
    const r = await repo.createRecord(newOperationKey(), b.id, 'receita', { ...base, marks: { hasInvoice: true, payerKind: 'pj' } });
    expect(r).toMatchObject({ hasInvoice: true, payerKind: 'pj' });
    const plain = await repo.createRecord(newOperationKey(), b.id, 'receita', { ...base, marks: null });
    expect('hasInvoice' in plain || 'payerKind' in plain).toBe(false);
    expect(await code(repo.createRecord(newOperationKey(), b.id, 'despesa', { ...base, category: null, marks: { hasInvoice: true, payerKind: null } }))).toBe('marcas_invalidas');
    expect(await code(repo.createRecord(newOperationKey(), personal, 'receita', { ...base, accountId: personalAcc, category: null, marks: { hasInvoice: null, payerKind: 'pf' } }))).toBe(
      'marcas_invalidas',
    );
    expect(await code(repo.createRecord(newOperationKey(), b.id, 'receita', { ...base, marks: { hasInvoice: null, payerKind: 'cpf' as never } }))).toBe('marcas_invalidas');
    // Os dois nulos valem em qualquer lançamento (nada é marcado).
    expect((await repo.createRecord(newOperationKey(), personal, 'receita', { ...base, accountId: personalAcc, category: null, marks: NO_RECORD_MARKS })).id).toBeTruthy();
  });

  it('ao editar: ausente mantém; um objeto troca; trocar para saída tira; mover para o Pessoal não leva as marcas', async () => {
    const { repo, personal, personalAcc, b, acc } = await withBusiness();
    const base = { accountId: acc, amountCents: 10_000, occurredOn: TODAY, description: 'Serviço', category: 'Serviços' };
    const r = await repo.createRecord(newOperationKey(), b.id, 'receita', { ...base, marks: { hasInvoice: false, payerKind: 'pf' } });
    const kept = await repo.updateRecord(newOperationKey(), r.id, 1, { ...base, amountCents: 11_000 });
    expect(kept).toMatchObject({ amountCents: 11_000, hasInvoice: false, payerKind: 'pf' });
    const changed = await repo.updateRecord(newOperationKey(), r.id, 2, { ...base, marks: { hasInvoice: true, payerKind: null } });
    expect(changed.hasInvoice).toBe(true);
    expect(changed.payerKind ?? null).toBeNull();
    const expense = await repo.updateRecord(newOperationKey(), r.id, 3, { ...base, category: null, kind: 'despesa' });
    expect(expense.kind).toBe('despesa');
    expect(expense.hasInvoice ?? null).toBeNull();
    const other = await repo.createRecord(newOperationKey(), b.id, 'receita', { ...base, marks: { hasInvoice: true, payerKind: 'exterior' } });
    const moved = await repo.moveRecord(newOperationKey(), other.id, 1, personal, personalAcc, null);
    expect(moved.hasInvoice ?? null).toBeNull();
    expect(moved.payerKind ?? null).toBeNull();
  });

  it('o resumo do ano por marca: só as entradas da operação, pelo mês em que contam; sem marca, "Não marcado"', () => {
    const records = [
      rec({ id: '1', amountCents: 10_000, hasInvoice: true, payerKind: 'pj' }),
      rec({ id: '2', amountCents: 5_000, hasInvoice: false, payerKind: 'pf' }),
      rec({ id: '3', amountCents: 2_000 }),
      rec({ id: '4', amountCents: 1_000, payerKind: 'exterior', category: 'Serviços' }),
      // Fora da operação, gasto, outro espaço e outro ano ficam de fora.
      rec({ id: '5', amountCents: 99_000, category: 'Empréstimo recebido', hasInvoice: true }),
      rec({ id: '6', amountCents: 99_000, kind: 'despesa', category: null }),
      rec({ id: '7', amountCents: 99_000, contextId: 'outro', hasInvoice: true }),
      rec({ id: '8', amountCents: 99_000, occurredOn: '2025-12-10', hasInvoice: true }),
      rec({ id: '1', amountCents: 10_000, hasInvoice: true, payerKind: 'pj' }),
    ];
    const m = businessYearMarks(records, 'neg', 2026);
    expect(m.anyMarked).toBe(true);
    expect(m.totalCents).toBe(18_000);
    expect(m.invoice.map((l) => [l.label, l.cents])).toEqual([
      ['Com nota', 10_000],
      ['Sem nota', 5_000],
      ['Não marcado', 3_000],
    ]);
    expect(m.payer.map((l) => [l.label, l.cents])).toEqual([
      ['De pessoa física', 5_000],
      ['De empresa', 10_000],
      ['Do exterior', 1_000],
      ['Não marcado', 2_000],
    ]);
    expect(businessYearMarks([rec({ id: 'z' })], 'neg', 2026).anyMarked).toBe(false);
  });

  it('exportar o negócio: as colunas Nota fiscal e Quem pagou no fim; o Pessoal continua como antes; a origem "A receber"', () => {
    const rows = exportRows(
      [
        rec({ id: 'a', occurredOn: '2026-10-01', description: 'Vendas', hasInvoice: true, payerKind: 'pj' }),
        rec({ id: 'b', occurredOn: '2026-10-02', description: 'Fiado da Ana', receivableId: 'rec-1' }),
        rec({ id: 'c', occurredOn: '2026-10-03', description: 'Frutas', kind: 'despesa', category: 'Material e mercadoria' }),
      ],
      { accounts: [{ id: 'acc', name: 'Conta do negócio', status: 'ativa' }], cards: [], commitments: new Map() },
    );
    const business = buildRecordsCsv(rows, { business: true }).slice(1).split(CSV_EOL);
    expect(business[0]).toBe('Data;Tipo;Descrição;Categoria;Subcategoria;Valor (R$);Banco ou carteira;Origem;Mês do resumo;Nota fiscal;Quem pagou');
    expect(CSV_BUSINESS_RECORD_HEADER).toEqual([...CSV_RECORD_HEADER, 'Nota fiscal', 'Quem pagou']);
    expect(business[1]).toBe('01/10/2026;Recebimento;Vendas;Vendas;;10,00;Conta do negócio;Anotado;10/2026;Sim;Empresa');
    expect(business[2]).toBe('02/10/2026;Recebimento;Fiado da Ana;Vendas;;10,00;Conta do negócio;A receber;10/2026;;');
    expect(business[3]).toBe('03/10/2026;Gasto;Frutas;Material e mercadoria;;10,00;Conta do negócio;Anotado;10/2026;;');
    const personal = buildRecordsCsv(rows).slice(1).split(CSV_EOL);
    expect(personal[0]).toBe(CSV_RECORD_HEADER.join(';'));
    expect(personal[1]!.split(';')).toHaveLength(9);
    // Pelo arquivo montado: a fonte com `business` leva as colunas.
    const files = buildExportFiles(
      {
        contextId: 'neg',
        period: 'tudo',
        today: '2026-10-07',
        records: [rec({ id: 'a', hasInvoice: false })],
        purchases: [],
        accounts: [],
        cards: [],
        commitments: new Map(),
        invoices: [],
        business: true,
      },
      'csv',
    );
    expect(files.files[0]!.content.split(CSV_EOL)[1]).toMatch(/;Não;$/);
  });
});

describe('lembretes do MEI (D-122): opcionais, desligados por padrão, só com o tipo MEI', () => {
  it('as escolhas: só true liga', () => {
    expect(parseMeiReminderChoices(undefined)).toEqual(NO_MEI_REMINDERS);
    expect(parseMeiReminderChoices({ das: true, declaracao: 'sim' })).toEqual({ das: true, declaracao: false });
    expect(anyMeiReminder(NO_MEI_REMINDERS)).toBe(false);
    expect(anyMeiReminder({ das: false, declaracao: true })).toBe(true);
  });

  it('o DAS no dia 15 do mês atual (se ainda cabe) e do seguinte; a declaração em 2 de maio; nada sem o tipo MEI', () => {
    const both = { das: true, declaracao: true };
    expect(meiReminderPlan(both, '2026-11-10', 20, { mei: false })).toEqual([]);
    expect(meiReminderPlan(NO_MEI_REMINDERS, '2026-11-10', 20, { mei: true })).toEqual([]);
    const plan = meiReminderPlan(both, '2026-11-10', 20, { mei: true });
    expect(plan.map((i) => [i.kind, i.date, i.fireAt])).toEqual([
      ['das', '2026-11-15', '2026-11-15T20:00'],
      ['das', '2026-12-15', '2026-12-15T20:00'],
      ['declaracao', '2027-05-02', '2027-05-02T20:00'],
    ]);
    expect(plan[0]).toMatchObject({ title: 'Seu negócio', body: 'O DAS do MEI vence no dia 20.', route: '/negocio' });
    expect(plan[2]!.body).toBe('A declaração anual do MEI vai até 31 de maio.');
    for (const i of plan) {
      expect(i.id.startsWith(MEI_REMINDER_ID_PREFIX)).toBe(true);
      expect(isRoutineReminderId(i.id)).toBe(true);
    }
    expect(new Set(plan.map((i) => i.id)).size).toBe(plan.length);
    // Passado o dia 15 (ou o horário de hoje), só o do mês seguinte; antes de 2 de maio, a deste ano.
    expect(meiReminderPlan({ das: true, declaracao: false }, '2026-11-16', 20, { mei: true }).map((i) => i.date)).toEqual(['2026-12-15']);
    expect(meiReminderPlan({ das: true, declaracao: false }, '2026-11-15', 20, { mei: true, nowMinutes: 20 * 60 }).map((i) => i.date)).toEqual(['2026-12-15']);
    expect(meiReminderPlan({ das: true, declaracao: false }, '2026-11-15', 20, { mei: true, nowMinutes: 19 * 60 }).map((i) => i.date)).toEqual(['2026-11-15', '2026-12-15']);
    expect(meiReminderPlan({ das: false, declaracao: true }, '2027-04-30', 12, { mei: true }).map((i) => i.date)).toEqual(['2027-05-02']);
    expect(meiReminderPlan({ das: false, declaracao: true }, '2027-05-02', 12, { mei: true, nowMinutes: 13 * 60 }).map((i) => i.date)).toEqual(['2028-05-02']);
    // Hoje inválido ou hora fora da lista: nada.
    expect(meiReminderPlan(both, 'ontem', 20, { mei: true })).toEqual([]);
    expect(meiReminderPlan(both, '2026-11-10', 7 as never, { mei: true })).toEqual([]);
  });

  it('dentro do teto do iOS junto com os de vencimento, os do dia a dia e o do nível', () => {
    expect(meiReminderPlan({ das: true, declaracao: true }, '2026-04-01', 20, { mei: true }).length).toBeLessThanOrEqual(MEI_REMINDER_LIMIT);
    expect(REMINDER_LIMIT + ROUTINE_REMINDER_LIMIT + MEI_REMINDER_LIMIT + 1).toBeLessThan(64);
  });
});

describe('demonstração: os números de sempre não mudam e não há "a receber" de exemplo', () => {
  it('no padrão e nos cenários do negócio, nenhum "a receber"', async () => {
    for (const scenario of ['padrao', 'negocio', 'negocio-plus', 'negocio-plus-membro'] as const) {
      const repo = await createDemoRepository({ scenario });
      const business = await repo.getBusiness();
      if (business) expect(await repo.listReceivables(business.id), scenario).toEqual([]);
    }
  });
});
