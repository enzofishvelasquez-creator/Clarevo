import { describe, expect, it } from 'vitest';
import {
  buildReview,
  canFlipLine,
  cardCreditWords,
  keepReviewEdits,
  lineDirection,
  parseCsvText,
  parseOfxText,
  statementFromPdfItems,
  toImportItems,
  toggleFlipped,
  unmarkedDirection,
  wordsDirection,
  type ImportParse,
  type ParsedLine,
  type PdfTextItem,
  type ReviewInput,
} from '../src';

/**
 * Gasto ou recebimento na importação (D-108, retorno do teste: "ENTRADA REND PAGO APLIC AUT APR" de R$ 0,01 entrou como gasto, e era
 * o rendimento da aplicação automática). Tudo fictício.
 */
const TODAY = '2026-11-17';

describe('palavras da descrição num extrato de conta', () => {
  it('entram: o caso do retorno e as palavras de entrada', () => {
    for (const d of [
      'ENTRADA REND PAGO APLIC AUT APR',
      'REND PAGO APLIC AUT MAIS',
      'RENDIMENTO POUPANÇA',
      'RENDIMENTOS',
      'CRÉDITO',
      'TED CREDITO FULANO',
      'ESTORNO TARIFA',
      'Estornado: compra cancelada',
      'PIX RECEBIDO MARIA EXEMPLO',
      'Pix recebido',
      'TED RECEBIDA',
      'TRANSFERÊNCIA RECEBIDA',
      'SALÁRIO EMPRESA EXEMPLO',
      'CRED SALARIO',
      'DEPÓSITO EM DINHEIRO',
      'REEMBOLSO DE VIAGEM',
      'DEVOLUÇÃO PIX',
      'RESGATE APLIC AUT',
      'PAGAMENTO RECEBIDO',
      'Entrada de dinheiro',
    ]) {
      expect(wordsDirection(d), d).toBe('entrada');
    }
  });

  it('saem: pagamento, compra, tarifa, aplicação, imposto e o crédito do cartão ou do empréstimo', () => {
    for (const d of [
      'PAGTO CARTAO DE CREDITO',
      'PAG BOLETO LUZ',
      'BOLETO PAGO',
      'COMPRA CARTAO DEBITO MERCADO',
      'TARIFA PACOTE',
      'SAQUE 24H',
      'PIX ENVIADO JOAO EXEMPLO',
      'TED ENVIADA',
      'APLICACAO AUT MAIS',
      'APL APLIC AUT',
      'IR S/ RENDIMENTO',
      'IOF S/ RESGATE',
      'PARCELA CREDITO PESSOAL',
      'PAGAMENTO FATURA',
      'JUROS CHEQUE ESPECIAL',
    ]) {
      expect(wordsDirection(d), d).toBe('saida');
    }
  });

  it('sem palavra que decida: null', () => {
    for (const d of ['MERCADO EXEMPLO', 'PIX TRANSF FULANO 16/11', 'CREDITO PESSOAL', 'TRANSFERENCIA', '']) expect(wordsDirection(d), d).toBeNull();
  });

  it('fatura do cartão: estorno, pagamento, crédito e devolução são crédito; o resto, compra', () => {
    expect(cardCreditWords('ESTORNO LOJA EXEMPLO')).toBe(true);
    expect(cardCreditWords('PAGAMENTO EFETUADO')).toBe(true);
    expect(cardCreditWords('Devolução de compra')).toBe(true);
    expect(cardCreditWords('IOF COMPRA INTERNACIONAL')).toBe(false);
    expect(cardCreditWords('ANUIDADE')).toBe(false);
  });
});

describe('a direção de uma linha: marca, palavras, costume do arquivo e o padrão', () => {
  it('a marca do valor vence as palavras', () => {
    expect(lineDirection('conta', 'menos', 'PIX RECEBIDO')).toBe('saida');
    expect(lineDirection('conta', 'D', 'SALARIO')).toBe('saida');
    expect(lineDirection('conta', 'mais', 'TARIFA')).toBe('entrada');
    expect(lineDirection('conta', 'C', 'COMPRA')).toBe('entrada');
  });

  it('sem marca: as palavras; sem elas, o costume do arquivo; sem nada, saída', () => {
    expect(lineDirection('conta', null, 'ENTRADA REND PAGO APLIC AUT APR')).toBe('entrada');
    expect(lineDirection('conta', null, 'ENTRADA REND PAGO APLIC AUT APR', 'saida')).toBe('entrada');
    expect(lineDirection('conta', null, 'TARIFA', 'entrada')).toBe('saida');
    expect(lineDirection('conta', null, 'PIX TRANSF FULANO', 'entrada')).toBe('entrada');
    expect(lineDirection('conta', null, 'PIX TRANSF FULANO', 'saida')).toBe('saida');
    expect(lineDirection('conta', null, 'MERCADO EXEMPLO')).toBe('saida');
    // "Crédito" sozinho entra, mas perde para o costume do arquivo.
    expect(lineDirection('conta', null, 'CREDITO')).toBe('entrada');
    expect(lineDirection('conta', null, 'CREDITO', 'saida')).toBe('saida');
  });

  it('fatura: compra sem marca; "-", "C" ou palavra de crédito é crédito; "D" é compra', () => {
    expect(lineDirection('cartao', null, 'LOJA EXEMPLO')).toBe('saida');
    expect(lineDirection('cartao', 'menos', 'LOJA EXEMPLO')).toBe('entrada');
    expect(lineDirection('cartao', 'C', 'AJUSTE')).toBe('entrada');
    expect(lineDirection('cartao', null, 'ESTORNO LOJA')).toBe('entrada');
    expect(lineDirection('cartao', 'D', 'ESTORNO LOJA')).toBe('saida');
  });

  it('costume do arquivo: só saídas marcadas, o sem marca entra; só entradas marcadas, sai; as duas ou nenhuma, nada', () => {
    expect(unmarkedDirection(['menos', null, 'menos'])).toBe('entrada');
    expect(unmarkedDirection(['D', null])).toBe('entrada');
    expect(unmarkedDirection(['mais', null])).toBe('saida');
    expect(unmarkedDirection(['C', null])).toBe('saida');
    expect(unmarkedDirection(['menos', 'C', null])).toBeNull();
    expect(unmarkedDirection([null, null])).toBeNull();
  });
});

const item = (str: string, x: number, y: number): PdfTextItem => ({ str, x, y, width: str.length * 5, page: 1 });
const row = (y: number, cols: [string, number][]) => cols.map(([s, x]) => item(s, x, y));

describe('extrato em PDF (D-108)', () => {
  it('o caso do retorno: no extrato em que as saídas vêm com "-", "ENTRADA REND PAGO APLIC AUT APR 0,01" é recebimento', () => {
    const items = [
      ...row(800, [['Extrato de conta corrente', 40]]),
      ...row(700, [['14/11', 40], ['PIX TRANSF MARIA EX 14/11', 100], ['-50,00', 380]]),
      ...row(680, [['16/11', 40], ['ENTRADA REND PAGO APLIC AUT APR', 100], ['0,01', 380]]),
      ...row(660, [['16/11', 40], ['PIX TRANSF JOAO EX 16/11', 100], ['200,00', 380]]),
      ...row(640, [['16/11', 40], ['TARIFA PACOTE', 100], ['-30,00', 380]]),
    ];
    const r = statementFromPdfItems(items, TODAY)!;
    expect(r.lines.map((l) => [l.description, l.amountCents])).toEqual([
      ['PIX TRANSF MARIA EX 14/11', -5_000],
      ['ENTRADA REND PAGO APLIC AUT APR', 1],
      // Sem palavra que decida, o costume do arquivo: as saídas trazem "-", então o valor sem marca entrou.
      ['PIX TRANSF JOAO EX 16/11', 20_000],
      ['TARIFA PACOTE', -3_000],
    ]);
  });

  it('o mesmo extrato sem nenhuma marca: as palavras decidem e o rendimento continua recebimento', () => {
    const items = [
      ...row(700, [['16/11/2026', 40], ['ENTRADA REND PAGO APLIC AUT APR', 100], ['0,01', 380]]),
      ...row(680, [['16/11/2026', 40], ['MERCADO EXEMPLO', 100], ['54,90', 380]]),
    ];
    expect(statementFromPdfItems(items, TODAY)!.lines.map((l) => l.amountCents)).toEqual([1, -5_490]);
  });
});

describe('OFX (D-108)', () => {
  const ofx = (body: string, card = false) =>
    `<OFX><${card ? 'CREDITCARDMSGSRSV1' : 'BANKMSGSRSV1'}><${card ? 'CCSTMTRS' : 'STMTRS'}><CURDEF>BRL<BANKTRANLIST>${body}</BANKTRANLIST></${card ? 'CCSTMTRS' : 'STMTRS'}></${card ? 'CREDITCARDMSGSRSV1' : 'BANKMSGSRSV1'}></OFX>`;
  const trn = (type: string, date: string, amount: string, memo: string) => `<STMTTRN><TRNTYPE>${type}<DTPOSTED>${date}<TRNAMT>${amount}<FITID>${memo.slice(0, 6)}<MEMO>${memo}</STMTTRN>`;

  it('o sinal do TRNAMT continua valendo quando o arquivo tem valores negativos', () => {
    const r = parseOfxText(ofx(trn('CREDIT', '20261116', '0.01', 'ENTRADA REND PAGO APLIC AUT APR') + trn('DEBIT', '20261116', '-30.00', 'TARIFA')));
    expect(r.ok && r.parse.lines.map((l) => l.amountCents)).toEqual([1, -3_000]);
  });

  it('extrato sem nenhum valor negativo, com TRNTYPE de débito: o TRNTYPE decide, e nos outros tipos, a descrição', () => {
    const r = parseOfxText(
      ofx(
        trn('DEBIT', '20261114', '50.00', 'PIX ENVIADO MARIA') +
          trn('CREDIT', '20261116', '0.01', 'ENTRADA REND PAGO APLIC AUT APR') +
          trn('OTHER', '20261116', '12.00', 'TARIFA AVULSA') +
          trn('OTHER', '20261116', '80.00', 'PIX RECEBIDO JOAO'),
      ),
    );
    expect(r.ok && r.parse.lines.map((l) => l.amountCents)).toEqual([-5_000, 1, -1_200, 8_000]);
    expect(r.ok && r.parse.cardPositive).toBe(false);
  });

  it('extrato sem nenhum valor negativo e sem TRNTYPE de débito: fica como está (tudo entrada)', () => {
    const r = parseOfxText(ofx(trn('CREDIT', '20261116', '0.01', 'REND') + trn('OTHER', '20261116', '10.00', 'X')));
    expect(r.ok && r.parse.lines.map((l) => l.amountCents)).toEqual([1, 1_000]);
  });

  it('fatura sem nenhum valor negativo: a compra é o valor positivo (o destino cartão inverte)', () => {
    const r = parseOfxText(ofx(trn('DEBIT', '20261110', '80.50', 'MERCADO EXEMPLO'), true));
    expect(r.ok && r.parse.cardPositive).toBe(true);
  });
});

const ACC = 'conta-x';
const CARD = 'cartao-x';
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

describe('planilha sem sinal e sem coluna de tipo (D-108)', () => {
  const csv = parseCsvText(
    ['Data;Descrição;Valor', '16/11/2026;ENTRADA REND PAGO APLIC AUT APR;0,01', '16/11/2026;PADARIA;33,30', '15/11/2026;SALARIO EMPRESA;4321,00', '14/11/2026;PIX RECEBIDO ANA;50,00', ''].join('\n'),
  );

  it('é marcada como sem sinal, e o valor da linha continua como veio (a chave não muda)', () => {
    expect(csv.kind).toBe('ok');
    if (csv.kind !== 'ok') return;
    expect(csv.parse.unsigned).toBe(true);
    expect(csv.parse.lines.map((l) => l.amountCents)).toEqual([1, 3_330, 432_100, 5_000]);
  });

  it('no extrato da conta, a descrição decide cada linha', () => {
    if (csv.kind !== 'ok') throw new Error('csv');
    const lines = buildReview(input(csv.parse));
    expect(lines.map((l) => [l.description, l.kind])).toEqual([
      ['ENTRADA REND PAGO APLIC AUT APR', 'receita'],
      ['PADARIA', 'despesa'],
      ['SALARIO EMPRESA', 'receita'],
      ['PIX RECEBIDO ANA', 'receita'],
    ]);
  });

  it('na fatura do cartão, tudo é compra (como antes)', () => {
    if (csv.kind !== 'ok') throw new Error('csv');
    const lines = buildReview(input(csv.parse, { destination: 'cartao', targetId: CARD, card: { days: { closingDay: 3, dueDay: 10 }, paidMonths: new Set() } }));
    expect(lines.every((l) => l.kind === 'compra')).toBe(true);
  });

  it('planilha com sinal ou com coluna de tipo não é "sem sinal"', () => {
    const signed = parseCsvText(['Data;Descrição;Valor', '16/11/2026;PADARIA;-33,30', '16/11/2026;SALARIO;10,00', ''].join('\n'));
    expect(signed.kind === 'ok' && signed.parse.unsigned).toBe(false);
    const typed = parseCsvText(['Data;Descrição;Valor;Tipo', '16/11/2026;PADARIA;33,30;D', '16/11/2026;SALARIO;10,00;C', ''].join('\n'));
    expect(typed.kind === 'ok' && typed.parse.unsigned).toBe(false);
  });
});

describe('trocar gasto e recebimento numa linha, antes de importar (D-108)', () => {
  const line = (ordinal: number, description: string, amountCents: number): ParsedLine => ({ ordinal, date: '2026-11-16', description, amountCents, fitId: null });
  const p: ImportParse = {
    source: 'pdf',
    statement: 'conta',
    lines: [line(1, 'ENTRADA ALGO SEM PALAVRA', -1), line(2, 'FARMACIA CENTRAL', -8_990), line(3, 'REEMBOLSO DE VIAGEM', 25_000)],
    ignored: 0,
    balanceIgnored: false,
    cardPositive: false,
  };

  it('a linha trocada vira recebimento, com a categoria do recebimento, e a chave não muda', () => {
    const before = buildReview(input(p));
    expect(before[1]!.kind).toBe('despesa');
    expect(before[1]!.category).toBe('Saúde');
    const flipped = toggleFlipped(new Set(), 'l2');
    const after = buildReview(input(p, { flipped }));
    expect(after[1]!.kind).toBe('receita');
    expect(after[1]!.flipped).toBe(true);
    expect(after[1]!.category).toBeNull();
    expect(after[1]!.key).toBe(before[1]!.key);
    expect(after[0]!.kind).toBe('despesa');
    expect(after[2]!.kind).toBe('receita');
    // Trocar de novo desfaz.
    expect(toggleFlipped(flipped, 'l2').has('l2')).toBe(false);
  });

  it('as escolhas da pessoa ficam: descrição, seleção e a categoria que ainda serve', () => {
    const before = buildReview(input(p)).map((l) => (l.id === 'l2' ? { ...l, description: 'Farmácia do bairro', include: true } : l.id === 'l3' ? { ...l, category: 'Renda extra' } : l));
    const after = keepReviewEdits(buildReview(input(p, { flipped: new Set(['l2']) })), before);
    expect(after[1]!.description).toBe('Farmácia do bairro');
    expect(after[1]!.include).toBe(true);
    // "Saúde" não é categoria de recebimento: fica a sugerida (nenhuma).
    expect(after[1]!.category).toBeNull();
    expect(after[2]!.category).toBe('Renda extra');
    const items = toImportItems(after);
    expect(items.find((i) => i.description === 'Farmácia do bairro')).toMatchObject({ kind: 'receita', amountCents: 8_990, category: null });
  });

  it('no cartão: compra vira estorno (e o estorno, que vem desmarcado, fica marcado ao virar compra); a categoria fica', () => {
    const cardParse: ImportParse = { ...p, statement: 'cartao', lines: [line(1, 'FARMACIA CENTRAL', -8_990), line(2, 'ESTORNO PADARIA', 1_200)] };
    const cardInput = (flipped: Set<string>) =>
      input(cardParse, { destination: 'cartao', targetId: CARD, card: { days: { closingDay: 3, dueDay: 10 }, paidMonths: new Set() }, flipped });
    const before = buildReview(cardInput(new Set()));
    expect(before.map((l) => [l.kind, l.include])).toEqual([
      ['compra', true],
      ['estorno', false],
    ]);
    const after = keepReviewEdits(buildReview(cardInput(new Set(['l1', 'l2']))), before);
    expect(after.map((l) => [l.kind, l.include, l.category])).toEqual([
      ['estorno', true, 'Saúde'],
      ['compra', true, 'Mercado'],
    ]);
  });

  it('o pagamento da fatura dentro da própria fatura e as linhas que não entram não trocam de tipo', () => {
    expect(canFlipLine({ importable: true, kind: 'despesa' })).toBe(true);
    expect(canFlipLine({ importable: true, kind: 'pagamento' })).toBe(false);
    expect(canFlipLine({ importable: false, kind: 'compra' })).toBe(false);
  });
});
