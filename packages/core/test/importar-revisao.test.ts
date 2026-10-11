import { describe, expect, it } from 'vitest';
import {
  CATEGORIES,
  DUPLICATE_WINDOW_DAYS,
  IMPORT_BATCH,
  MEMORY_LIMIT,
  allSelected,
  buildReview,
  categoriesFor,
  categoryByRules,
  chunkItems,
  descriptionTokens,
  existingMonths,
  findLookalikes,
  importKey,
  importedSummary,
  includedLines,
  kindOf,
  lineProblem,
  looksLikeCardPaymentLine,
  looksLikeInvoicePayment,
  looksLikeOwnTransfer,
  memoryKey,
  normalizeDescription,
  occurrences,
  oldestCardDate,
  rememberCategories,
  reviewCounts,
  setAll,
  similarDescriptions,
  sha256Hex,
  suggestCategory,
  toImportItems,
  updateLine,
  type ImportParse,
  type ParsedLine,
  type ReviewInput,
} from '../src';

const TODAY = '2026-10-07';
const ACC = 'conta-iris';
const CARD = 'cartao-iris';

const line = (ordinal: number, date: string, description: string, amountCents: number, fitId: string | null = null): ParsedLine => ({
  ordinal,
  date,
  description,
  amountCents,
  fitId,
});
const parse = (lines: ParsedLine[], extra: Partial<ImportParse> = {}): ImportParse => ({
  source: 'ofx',
  statement: null,
  lines,
  ignored: 0,
  balanceIgnored: false,
  cardPositive: false,
  ...extra,
});
const input = (p: ImportParse, extra: Partial<ReviewInput> = {}): ReviewInput => ({
  parse: p,
  destination: 'conta',
  targetId: ACC,
  today: TODAY,
  invertSigns: false,
  memory: {},
  existing: [],
  importedKeys: new Set(),
  card: null,
  ...extra,
});
const cardInput = (p: ImportParse, paid: string[] = [], extra: Partial<ReviewInput> = {}): ReviewInput =>
  input(p, { destination: 'cartao', targetId: CARD, card: { days: { closingDay: 3, dueDay: 10 }, paidMonths: new Set(paid) }, ...extra });

describe('importar: chave de cada linha (import_key)', () => {
  const base = line(1, '2026-10-02', 'PADARIA SAO JOAO', -4590, 'F1');

  it('é um SHA-256 de 64 hexadecimais, estável e calculada só do que identifica a linha', () => {
    const k = importKey(ACC, base, 0);
    expect(k).toMatch(/^[0-9a-f]{64}$/);
    expect(importKey(ACC, { ...base }, 0)).toBe(k);
    expect(k).toBe(sha256Hex(`imp1|${ACC}|f|F1|2026-10-02|-4590|0`));
    // A descrição não entra na chave quando a linha tem identificador; a ordem no arquivo também não.
    expect(importKey(ACC, { ...base, description: 'OUTRA COISA' }, 0)).toBe(k);
    expect(importKey(ACC, { ...base, ordinal: 99 } as ParsedLine, 0)).toBe(k);
  });

  it('muda com a conta, o dia, o valor e o identificador; o identificador repetido em outro dia ou valor não colide', () => {
    const k = importKey(ACC, base, 0);
    expect(importKey('outra-conta', base, 0)).not.toBe(k);
    expect(importKey(ACC, { ...base, date: '2026-10-03' }, 0)).not.toBe(k);
    expect(importKey(ACC, { ...base, amountCents: -4591 }, 0)).not.toBe(k);
    expect(importKey(ACC, { ...base, fitId: 'F2' }, 0)).not.toBe(k);
    expect(importKey(ACC, base, 1)).not.toBe(k);
  });

  it('sem identificador: dia, valor, descrição normalizada e ordem entre as iguais', () => {
    const a = line(1, '2026-10-02', 'Padaria São João', -4590);
    const k = importKey(ACC, a, 0);
    expect(k).toBe(sha256Hex(`imp1|${ACC}|d|2026-10-02|-4590|padaria sao joao|0`));
    expect(importKey(ACC, { ...a, description: '  PADARIA   SAO JOAO ' }, 0)).toBe(k);
    expect(importKey(ACC, { ...a, description: 'Padaria Sao Joaquim' }, 0)).not.toBe(k);
    expect(importKey(ACC, a, 1)).not.toBe(k);
  });

  it('duas linhas iguais no mesmo arquivo recebem ordens diferentes', () => {
    const lines = [
      line(1, '2026-10-02', 'Cafe', -500),
      line(2, '2026-10-02', 'CAFE', -500),
      line(3, '2026-10-02', 'Cafe', -600),
      line(4, '2026-10-02', 'Cafe', -500),
      line(5, '2026-10-02', 'x', -500, 'A'),
      line(6, '2026-10-02', 'y', -500, 'A'),
    ];
    expect(occurrences(lines)).toEqual([0, 1, 0, 2, 0, 1]);
    const keys = lines.map((l, i) => importKey(ACC, l, occurrences(lines)[i]!));
    expect(new Set(keys).size).toBe(lines.length);
  });

  it('o mesmo extrato lido duas vezes dá as mesmas chaves; uma linha nova no meio não muda as outras', () => {
    const first = [line(1, '2026-10-01', 'A', -100, 'x1'), line(2, '2026-10-02', 'B', -200, 'x2')];
    const second = [line(1, '2026-10-01', 'A', -100, 'x1'), line(2, '2026-10-01', 'NOVA', -50, 'x9'), line(3, '2026-10-02', 'B', -200, 'x2')];
    const keysOf = (ls: ParsedLine[]) => ls.map((l, i) => importKey(ACC, l, occurrences(ls)[i]!));
    const [a, b] = keysOf(first);
    const other = keysOf(second);
    expect(other).toContain(a);
    expect(other).toContain(b);
    expect(other).toHaveLength(3);
  });
});

describe('importar: "Já anotado" por semelhança', () => {
  it('normaliza sem acento e tira as palavras comuns de banco', () => {
    expect(normalizeDescription('  PADARIA  São João - 12/10 ')).toBe('padaria sao joao 12 10');
    expect(descriptionTokens('COMPRA NO DEBITO PADARIA SAO JOAO 1234')).toEqual(['padaria', 'sao', 'joao']);
    expect(descriptionTokens('PIX')).toEqual([]);
  });

  it('descrições parecidas: palavras em comum, uma dentro da outra, começo de palavra', () => {
    expect(similarDescriptions('Mercado', 'COMPRA NO DEBITO MERCADO EXTRA 1234')).toBe(true);
    expect(similarDescriptions('Padaria São João', 'PADARIA SAO JOAO LTDA')).toBe(true);
    expect(similarDescriptions('Mercado Extra', 'MERCADO')).toBe(true);
    expect(similarDescriptions('Farmácia', 'Farmacia Central')).toBe(true);
    expect(similarDescriptions('Mercad', 'Mercado do bairro')).toBe(true);
    expect(similarDescriptions('Mer', 'Mercado do bairro')).toBe(false);
    expect(similarDescriptions('Mercado', 'Posto de combustível')).toBe(false);
    expect(similarDescriptions('Mercado Livre Loja', 'Padaria Loja Nova')).toBe(false);
    expect(similarDescriptions('', 'Mercado')).toBe(false);
    expect(similarDescriptions('Pix', 'pix')).toBe(true);
    expect(similarDescriptions('Pix', 'Pagamento')).toBe(false);
  });

  it('mesmo tipo e valor, a até 3 dias, descrição parecida; cada registro cobre uma linha só', () => {
    const existing = [{ date: '2026-10-03', amountCents: 4590, description: 'Padaria', kind: 'despesa' as const }];
    const lines = [
      { date: '2026-10-02', amountCents: 4590, description: 'COMPRA PADARIA SAO JOAO', kind: 'despesa' as const },
      { date: '2026-10-02', amountCents: 4590, description: 'COMPRA PADARIA SAO JOAO', kind: 'despesa' as const },
    ];
    expect(findLookalikes(lines, existing)).toEqual([true, false]);
    expect(DUPLICATE_WINDOW_DAYS).toBe(3);
    const at = (date: string) => findLookalikes([{ ...lines[0]!, date }], existing)[0];
    expect(at('2026-09-30')).toBe(true);
    expect(at('2026-10-06')).toBe(true);
    expect(at('2026-09-29')).toBe(false);
    expect(at('2026-10-07')).toBe(false);
    expect(findLookalikes([{ ...lines[0]!, amountCents: 4591 }], existing)).toEqual([false]);
    expect(findLookalikes([{ ...lines[0]!, kind: 'receita' }], existing)).toEqual([false]);
    expect(findLookalikes([{ ...lines[0]!, description: 'Posto de combustível' }], existing)).toEqual([false]);
  });

  it('a linha mais próxima no dia leva o registro', () => {
    const existing = [{ date: '2026-10-05', amountCents: 1000, description: 'Lanche', kind: 'despesa' as const }];
    const lines = [
      { date: '2026-10-02', amountCents: 1000, description: 'Lanche', kind: 'despesa' as const },
      { date: '2026-10-05', amountCents: 1000, description: 'Lanche', kind: 'despesa' as const },
    ];
    expect(findLookalikes(lines, existing)).toEqual([false, true]);
  });
});

describe('importar: categorias sugeridas', () => {
  it('regras por palavra em português, sem marcas; sem pista, nenhuma', () => {
    const cases: [string, 'despesa' | 'receita', string | null][] = [
      ['COMPRA PADARIA SAO JOAO', 'despesa', 'Mercado'],
      ['Supermercado do Bairro', 'despesa', 'Mercado'],
      ['FARMACIA CENTRAL', 'despesa', 'Saúde'],
      ['Consulta dentista', 'despesa', 'Saúde'],
      ['Mensalidade escolar', 'despesa', 'Educação'],
      ['Aluguel outubro', 'despesa', 'Moradia'],
      ['Conta de luz', 'despesa', 'Moradia'],
      ['Energia eletrica', 'despesa', 'Moradia'],
      ['POSTO COMBUSTIVEL', 'despesa', 'Transporte'],
      ['Estacionamento', 'despesa', 'Transporte'],
      ['Restaurante Sabor', 'despesa', 'Lazer'],
      ['Cinema', 'despesa', 'Lazer'],
      ['Tarifa de manutenção', 'despesa', null],
      ['XPTO 123', 'despesa', null],
      ['', 'despesa', null],
      ['SALARIO EMPRESA EXEMPLO', 'receita', 'Salário'],
      ['Reembolso de viagem', 'receita', 'Reembolso'],
      ['Estorno de compra', 'receita', 'Reembolso'],
      ['Freelance site', 'receita', 'Renda extra'],
      ['Pix recebido', 'receita', null],
    ];
    for (const [text, kind, expected] of cases) expect(categoryByRules(text, kind), text).toBe(expected);
    // Palavra inteira: "bar" não está em "barato" nem "gas" em "gasolina" (esta tem a própria regra).
    expect(categoryByRules('Loja barata', 'despesa')).toBeNull();
    expect(categoryByRules('Gasolina', 'despesa')).toBe('Transporte');
    // Plural simples.
    expect(categoryByRules('Padarias reunidas', 'despesa')).toBe('Mercado');
    // Toda categoria das regras existe no app.
    for (const [text, kind] of cases) {
      const c = categoryByRules(text, kind);
      if (c) expect(CATEGORIES[kind]).toContain(c);
    }
  });

  it('a memória do aparelho vem antes das regras, e só vale se a categoria ainda serve ao tipo', () => {
    expect(memoryKey('COMPRA NO DEBITO PADARIA SAO JOAO 1234')).toBe('padaria sao joao');
    expect(memoryKey('Pix 12')).toBeNull();
    const memory = { 'padaria sao joao': 'Lazer' };
    expect(suggestCategory('Padaria São João 99', 'despesa', memory)).toEqual({ category: 'Lazer', source: 'memoria' });
    expect(suggestCategory('Padaria Central', 'despesa', memory)).toEqual({ category: 'Mercado', source: 'regra' });
    expect(suggestCategory('Padaria São João', 'receita', memory)).toEqual({ category: null, source: null });
    expect(suggestCategory('Qualquer coisa', 'despesa', {})).toEqual({ category: null, source: null });
    expect(suggestCategory('Padaria São João', 'despesa', { 'padaria sao joao': 'Categoria que saiu' })).toEqual({ category: 'Mercado', source: 'regra' });
  });

  it('lembra a última escolha de cada descrição, esquece "Sem categoria" e guarda no máximo 300', () => {
    const m1 = rememberCategories({}, [
      { description: 'Padaria São João', category: 'Mercado' },
      { description: 'Livraria Exemplo', category: 'Educação' },
      { description: 'Pix', category: 'Lazer' },
    ]);
    expect(m1).toEqual({ 'padaria sao joao': 'Mercado', 'livraria exemplo': 'Educação' });
    const m2 = rememberCategories(m1, [{ description: 'Padaria São João', category: null }, { description: 'Livraria Exemplo', category: 'Lazer' }]);
    expect(m2).toEqual({ 'livraria exemplo': 'Lazer' });
    let big = {};
    for (let i = 0; i < MEMORY_LIMIT + 20; i++) big = rememberCategories(big, [{ description: `Loja ${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + ((i / 26) | 0))}x`, category: 'Lazer' }]);
    expect(Object.keys(big)).toHaveLength(MEMORY_LIMIT);
    // O que ficou são os mais recentes.
    expect(Object.keys(big)).toContain('loja ajx'.replace('ajx', `${String.fromCharCode(97 + ((MEMORY_LIMIT + 19) % 26))}${String.fromCharCode(97 + (((MEMORY_LIMIT + 19) / 26) | 0))}x`));
  });
});

describe('importar: marcas por palavra', () => {
  it('pagamento de fatura de cartão no extrato da conta', () => {
    for (const text of ['PAGAMENTO FATURA CARTAO', 'Pagto fatura cartão de crédito', 'PGTO FATURA', 'Pagamento de fatura', 'DEB AUT FATURA CARTAO', 'Pagamento cartão de crédito']) {
      expect(looksLikeInvoicePayment(text), text).toBe(true);
    }
    for (const text of ['Padaria', 'Fatura de luz', 'Conta de luz', 'Cartão de visita gráfica', 'Pagamento aluguel']) {
      expect(looksLikeInvoicePayment(text), text).toBe(false);
    }
  });

  it('transferência entre contas do próprio titular', () => {
    for (const text of ['TRANSFERENCIA ENTRE CONTAS', 'Transf mesma titularidade', 'TRANSFERENCIA PARA CONTA PROPRIA', 'Entre contas']) {
      expect(looksLikeOwnTransfer(text), text).toBe(true);
    }
    for (const text of ['Transferência enviada pelo Pix FULANO', 'PIX RECEBIDO', 'Padaria']) {
      expect(looksLikeOwnTransfer(text), text).toBe(false);
    }
  });

  it('pagamento dentro da própria fatura do cartão', () => {
    for (const text of ['Pagamento recebido', 'PAGTO EFETUADO', 'Pagamento de fatura', 'Obrigado pelo pagamento']) expect(looksLikeCardPaymentLine(text), text).toBe(true);
    for (const text of ['Estorno de compra', 'Devolução Cinema', 'Crédito loja']) expect(looksLikeCardPaymentLine(text), text).toBe(false);
  });

  it('tipo da linha no destino', () => {
    expect(kindOf('conta', -100, 'x')).toBe('despesa');
    expect(kindOf('conta', 100, 'x')).toBe('receita');
    expect(kindOf('cartao', -100, 'x')).toBe('compra');
    expect(kindOf('cartao', 100, 'Estorno')).toBe('estorno');
    expect(kindOf('cartao', 100, 'Pagamento recebido')).toBe('pagamento');
  });
});

describe('importar: a revisão da conta', () => {
  const lines = [
    line(1, '2026-10-02', 'COMPRA PADARIA SAO JOAO', -4590, 'F1'),
    line(2, '2026-10-05', 'SALARIO EMPRESA EXEMPLO', 500000, 'F2'),
    line(3, '2026-10-06', 'PAGAMENTO FATURA CARTAO', -123456, 'F3'),
    line(4, '2026-10-06', 'TRANSFERENCIA ENTRE CONTAS', -50000, 'F4'),
    line(5, '2026-10-06', 'LANCHE', -2500, 'F5'),
    line(6, '2026-10-08', 'FUTURO', -100, 'F6'),
    line(7, '2026-10-01', 'JA IMPORTADA', -700, 'F7'),
  ];

  it('tipo, valor positivo, categoria sugerida e o que vem marcado', () => {
    const importedKeys = new Set([importKey(ACC, lines[6]!, 0)]);
    const review = buildReview(input(parse(lines), { importedKeys, existing: [{ date: '2026-10-06', amountCents: 2500, description: 'Lanche', kind: 'despesa' }] }));
    expect(review.map((l) => [l.id, l.kind, l.amountCents, l.category, l.label, l.importable, l.include])).toEqual([
      ['l1', 'despesa', 4590, 'Mercado', null, true, true],
      ['l2', 'receita', 500000, 'Salário', null, true, true],
      ['l3', 'despesa', 123456, null, 'pagamento_fatura', true, false],
      ['l4', 'despesa', 50000, null, 'transferencia', true, false],
      ['l5', 'despesa', 2500, 'Lazer', 'ja_anotado', true, false],
      ['l6', 'despesa', 100, null, 'data_futura', false, false],
      ['l7', 'despesa', 700, null, 'ja_anotado', false, false],
    ]);
    expect(review[0]!.categorySource).toBe('regra');
    expect(review[6]!.keyExists).toBe(true);
    expect(review[4]!.keyExists).toBe(false);
    expect(reviewCounts(review)).toEqual({ total: 7, included: 2, alreadyNoted: 2 });
    expect(review.every((l) => /^[0-9a-f]{64}$/.test(l.key))).toBe(true);
    expect(new Set(review.map((l) => l.key)).size).toBe(7);
  });

  it('a memória do aparelho define a categoria antes das regras', () => {
    const review = buildReview(input(parse([lines[0]!]), { memory: { 'padaria sao joao': 'Lazer' } }));
    expect([review[0]!.category, review[0]!.categorySource]).toEqual(['Lazer', 'memoria']);
  });

  it('inverter entradas e saídas troca o tipo e não muda a chave', () => {
    const normal = buildReview(input(parse([lines[0]!])));
    const flipped = buildReview(input(parse([lines[0]!]), { invertSigns: true }));
    expect([flipped[0]!.kind, flipped[0]!.amountCents]).toEqual(['receita', 4590]);
    expect(flipped[0]!.key).toBe(normal[0]!.key);
    expect(flipped[0]!.category).toBeNull();
  });

  it('valor acima do limite do app não entra', () => {
    const review = buildReview(input(parse([line(1, '2026-10-02', 'Gigante', -1_000_000_000)])));
    expect([review[0]!.label, review[0]!.importable, review[0]!.include]).toEqual(['valor_alto', false, false]);
  });

  it('a linha já importada ocupa o registro que a importou: outra linha igual ainda não importada não é marcada por semelhança', () => {
    const a = line(1, '2026-10-02', 'CAFE CENTRAL', -500, 'x1');
    const b = line(2, '2026-10-02', 'CAFE CENTRAL', -500, 'x2');
    const existing = [{ date: '2026-10-02', amountCents: 500, description: 'Cafe central', kind: 'despesa' as const }];
    const review = buildReview(input(parse([a, b]), { existing, importedKeys: new Set([importKey(ACC, a, 0)]) }));
    expect(review.map((l) => [l.label, l.keyExists, l.importable, l.include])).toEqual([
      ['ja_anotado', true, false, false],
      [null, false, true, true],
    ]);
    // Sem a chave em comum, a primeira linha é a marcada por semelhança e a segunda segue livre.
    expect(buildReview(input(parse([a, b]), { existing })).map((l) => l.label)).toEqual(['ja_anotado', null]);
  });

  it('seleção: marcar tudo só marca o que pode entrar; editar descrição e categoria; itens para o banco', () => {
    let review = buildReview(input(parse(lines)));
    expect(allSelected(review)).toBe(false);
    review = setAll(review, true);
    expect(review.filter((l) => l.include).map((l) => l.id)).toEqual(['l1', 'l2', 'l3', 'l4', 'l5', 'l7']);
    expect(allSelected(review)).toBe(true);
    review = setAll(review, false);
    expect(includedLines(review)).toEqual([]);
    review = updateLine(review, 'l6', { include: true });
    expect(review.find((l) => l.id === 'l6')!.include).toBe(false);
    review = updateLine(review, 'l1', { include: true, description: '  Padaria do Zé  ', category: 'Mercado' });
    review = updateLine(review, 'l2', { include: true, category: 'Categoria inventada' });
    const items = toImportItems(review);
    expect(items).toEqual([
      { importKey: review[0]!.key, kind: 'despesa', amountCents: 4590, occurredOn: '2026-10-02', description: 'Padaria do Zé', category: 'Mercado' },
      { importKey: review[1]!.key, kind: 'receita', amountCents: 500000, occurredOn: '2026-10-05', description: 'SALARIO EMPRESA EXEMPLO', category: null },
    ]);
  });

  it('problema da linha marcada: descrição vazia ou longa; linha desmarcada não bloqueia', () => {
    const base = { include: true, importable: true };
    expect(lineProblem({ ...base, description: '   ' })).toBe('descricao_obrigatoria');
    expect(lineProblem({ ...base, description: 'x'.repeat(81) })).toBe('descricao_longa');
    expect(lineProblem({ ...base, description: 'x'.repeat(80) })).toBeNull();
    expect(lineProblem({ include: false, importable: true, description: '' })).toBeNull();
    expect(lineProblem({ include: true, importable: false, description: '' })).toBeNull();
  });

  it('lotes de até 500 e meses a ler para achar o que já existe', () => {
    expect(IMPORT_BATCH).toBe(500);
    const items = Array.from({ length: 1201 }, (_, i) => i);
    expect(chunkItems(items).map((c) => c.length)).toEqual([500, 500, 201]);
    expect(chunkItems([])).toEqual([]);
    expect(chunkItems([1, 2, 3], 2)).toEqual([[1, 2], [3]]);
    expect(existingMonths([{ date: '2026-10-02' }, { date: '2026-10-20' }, { date: '2026-12-31' }])).toEqual(['2026-09', '2026-10', '2026-12', '2027-01']);
    expect(existingMonths([])).toEqual([]);
  });

  it('categorias por tipo', () => {
    expect(categoriesFor('despesa')).toEqual(CATEGORIES.despesa);
    expect(categoriesFor('compra')).toEqual(CATEGORIES.despesa);
    expect(categoriesFor('estorno')).toEqual(CATEGORIES.despesa);
    expect(categoriesFor('receita')).toEqual(CATEGORIES.receita);
    expect(categoriesFor('pagamento')).toEqual([]);
  });
});

describe('importar: a revisão do cartão', () => {
  // Fecha dia 3, vence dia 10: 20/09 e 03/10 caem na fatura de outubro; 04/10 em diante, na de novembro.
  const lines = [
    line(1, '2026-09-20', 'Livraria Exemplo', 20000, 'c1'),
    line(2, '2026-10-03', 'Mercado do bairro', 8050, 'c2'),
    line(3, '2026-10-04', 'Cinema', 15990, 'c3'),
    line(4, '2026-10-05', 'Estorno Cinema', -4000, 'c4'),
    line(5, '2026-10-05', 'Pagamento recebido', -150000, 'c5'),
  ];

  it('planilha de valor positivo: a compra é o valor positivo; estorno e pagamento vêm desmarcados ou fora', () => {
    const p = parse(lines, { source: 'csv', cardPositive: true });
    const review = buildReview(cardInput(p));
    expect(review.map((l) => [l.kind, l.amountCents, l.label, l.importable, l.include])).toEqual([
      ['compra', 20000, null, true, true],
      ['compra', 8050, null, true, true],
      ['compra', 15990, null, true, true],
      ['estorno', 4000, null, true, false],
      ['pagamento', 150000, 'pagamento_recebido', false, false],
    ]);
  });

  it('OFX de cartão: a compra é o valor negativo', () => {
    const ofx = parse(lines.map((l) => ({ ...l, amountCents: -l.amountCents })), { statement: 'cartao' });
    const review = buildReview(cardInput(ofx));
    expect(review.map((l) => [l.kind, l.amountCents])).toEqual([
      ['compra', 20000],
      ['compra', 8050],
      ['compra', 15990],
      ['estorno', 4000],
      ['pagamento', 150000],
    ]);
    // O botão de inverter conserta quando o banco traz o contrário.
    expect(buildReview(cardInput(ofx, [], { invertSigns: true })).map((l) => l.kind)).toEqual(['estorno', 'estorno', 'estorno', 'compra', 'compra']);
  });

  it('fatura já paga: a linha que cai nela não entra', () => {
    const p = parse(lines, { source: 'csv', cardPositive: true });
    const review = buildReview(cardInput(p, ['2026-10']));
    expect(review.map((l) => [l.label, l.importable, l.include])).toEqual([
      ['fatura_paga', false, false],
      ['fatura_paga', false, false],
      [null, true, true],
      [null, true, false],
      ['pagamento_recebido', false, false],
    ]);
  });

  it('data de mais de 48 meses, futura e valor alto não entram; o limite é o primeiro dia do mês', () => {
    expect(oldestCardDate(TODAY)).toBe('2022-10-01');
    const p = parse([line(1, '2022-09-30', 'Antiga', 100), line(2, '2022-10-01', 'No limite', 100), line(3, '2026-10-08', 'Futura', 100), line(4, '2026-10-01', 'Alta', 1_000_000_000)], {
      source: 'csv',
      cardPositive: true,
    });
    const review = buildReview(cardInput(p));
    expect(review.map((l) => [l.label, l.importable])).toEqual([
      ['data_antiga', false],
      [null, true],
      ['data_futura', false],
      ['valor_alto', false],
    ]);
  });

  it('já anotado no cartão: compra igual do mesmo cartão a até 3 dias, com descrição parecida', () => {
    const p = parse([line(1, '2026-10-04', 'CINEMA CENTRO', 15990)], { source: 'csv', cardPositive: true });
    const review = buildReview(cardInput(p, [], { existing: [{ date: '2026-10-02', amountCents: 15990, description: 'Cinema', kind: 'compra' }] }));
    expect([review[0]!.label, review[0]!.importable, review[0]!.include]).toEqual(['ja_anotado', true, false]);
    // No cartão, o pagamento da fatura nunca é tratado como semelhante a nada.
    const q = buildReview(cardInput(parse([line(1, '2026-10-04', 'Pagamento recebido', -15990)], { source: 'csv', cardPositive: true }), [], {
      existing: [{ date: '2026-10-04', amountCents: 15990, description: 'Pagamento recebido', kind: 'estorno' }],
    }));
    expect(q[0]!.label).toBe('pagamento_recebido');
  });

  it('itens do cartão: compra e estorno, categorias de gasto', () => {
    const p = parse(lines.slice(0, 4), { source: 'csv', cardPositive: true });
    let review = buildReview(cardInput(p));
    review = setAll(review, true);
    review = updateLine(review, 'l3', { category: 'Lazer' });
    expect(toImportItems(review).map((i) => [i.kind, i.amountCents, i.occurredOn, i.category])).toEqual([
      ['compra', 20000, '2026-09-20', 'Educação'],
      ['compra', 8050, '2026-10-03', 'Mercado'],
      ['compra', 15990, '2026-10-04', 'Lazer'],
      ['estorno', 4000, '2026-10-05', 'Lazer'],
    ]);
  });
});

describe('importar: texto do resultado', () => {
  it('"18 lançamentos importados, 4 já estavam anotados." e as variações', () => {
    expect(importedSummary(18, 4)).toBe('18 lançamentos importados, 4 já estavam anotados.');
    expect(importedSummary(1, 1)).toBe('1 lançamento importado, 1 já estava anotado.');
    expect(importedSummary(18, 0)).toBe('18 lançamentos importados.');
    expect(importedSummary(0, 4)).toBe('Nenhum lançamento novo. 4 já estavam anotados.');
    expect(importedSummary(0, 1)).toBe('Nenhum lançamento novo. 1 já estava anotado.');
    expect(importedSummary(0, 0)).toBe('Nenhum lançamento novo.');
  });
});
