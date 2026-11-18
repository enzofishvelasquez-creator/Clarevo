import { describe, expect, it } from 'vitest';
import { IMPORT_MAX_IMAGES, buildReview, statementFromImageTexts, toImportItems, type ReviewInput } from '../src';

/** Importar por print (D-108): o texto que o leitor de imagem devolve vira as linhas da conferência. Tudo fictício. */
const TODAY = '2026-11-17';
const rows = (r: ReturnType<typeof statementFromImageTexts>) => r!.lines.map((l) => [l.date, l.description, l.amountCents]);

describe('print do extrato da conta', () => {
  it('linha inteira com a data no começo; o rendimento sem sinal, num print em que as saídas têm "-", é recebimento', () => {
    const text = ['11:49 54%', 'Extrato', 'Saldo disponível R$ 1.234,56', '14/11 PIX TRANSF MARIA EX -R$ 50,00', '16/11 ENTRADA REND PAGO APLIC AUT APR R$ 0,01', '16/11 TARIFA PACOTE - R$ 30,00'].join('\n');
    const r = statementFromImageTexts([text], TODAY)!;
    expect(r.source).toBe('imagem');
    expect(r.statement).toBe('conta');
    expect(r.balanceIgnored).toBe(true);
    expect(r.repeated).toBe(0);
    expect(rows(r)).toEqual([
      ['2026-11-14', 'PIX TRANSF MARIA EX', -5_000],
      ['2026-11-16', 'ENTRADA REND PAGO APLIC AUT APR', 1],
      ['2026-11-16', 'TARIFA PACOTE', -3_000],
    ]);
  });

  it('cabeçalho do dia ("Hoje", "Ontem", "16 de novembro") e a descrição em duas linhas acima do valor', () => {
    const text = [
      'Hoje',
      'Transferência recebida',
      'Ana Exemplo',
      'R$ 120,00',
      'Pix',
      'Ontem',
      'Compra no débito',
      'Padaria Central',
      'R$ 12,30',
      'Domingo, 15 de novembro',
      'Pagamento de boleto',
      'R$ 89,90',
    ].join('\n');
    const r = statementFromImageTexts([text], TODAY)!;
    expect(rows(r)).toEqual([
      ['2026-11-17', 'Transferência recebida Ana Exemplo', 12_000],
      // "Pix" ficou antes do cabeçalho "Ontem": é da linha de cima, e sai da descrição.
      ['2026-11-16', 'Compra no débito Padaria Central', -1_230],
      ['2026-11-15', 'Pagamento de boleto', -8_990],
    ]);
  });

  it('as descrições todas e depois os valores todos (blocos do leitor do celular): casam na ordem', () => {
    const text = ['16 NOV', 'Mercado Exemplo', 'Farmácia Central', 'Posto Exemplo', '-R$ 80,50', '-R$ 25,00', '-R$ 150,00'].join('\n');
    expect(rows(statementFromImageTexts([text], TODAY))).toEqual([
      ['2026-11-16', 'Mercado Exemplo', -8_050],
      ['2026-11-16', 'Farmácia Central', -2_500],
      ['2026-11-16', 'Posto Exemplo', -15_000],
    ]);
  });

  it('o valor antes da descrição', () => {
    const text = ['16/11/2026', 'R$ 80,50', 'Mercado Exemplo', 'R$ 12,00', 'Padaria'].join('\n');
    expect(rows(statementFromImageTexts([text], TODAY))).toEqual([
      ['2026-11-16', 'Mercado Exemplo', -8_050],
      ['2026-11-16', 'Padaria', -1_200],
    ]);
  });

  it('valores com "+", com "C" e "D" e com o ponto no lugar da vírgula; hora e "às" saem da descrição', () => {
    const text = ['16/11 Pix recebido às 14:32 +R$ 0,50', '16/11 TED 1.250,00 C', '16/11 Saque 24h 100,00 D', '16/11 Lanchonete R$ 18.90'].join('\n');
    expect(rows(statementFromImageTexts([text], TODAY))).toEqual([
      ['2026-11-16', 'Pix recebido', 50],
      ['2026-11-16', 'TED', 125_000],
      ['2026-11-16', 'Saque 24h', -10_000],
      ['2026-11-16', 'Lanchonete', -1_890],
    ]);
  });

  it('sem ano: o de hoje, e um dia depois de hoje volta um ano (print de dezembro lido em janeiro)', () => {
    expect(rows(statementFromImageTexts([['20 DEZ', 'Mercado Exemplo', 'R$ 54,90'].join('\n')], '2027-01-10'))).toEqual([['2026-12-20', 'Mercado Exemplo', -5_490]]);
  });

  it('nenhum lançamento (só saldo, botões, texto sem valor ou sem data): null', () => {
    expect(statementFromImageTexts([['Saldo R$ 100,00', 'Pagar fatura', 'Mercado Exemplo'].join('\n')], TODAY)).toBeNull();
    expect(statementFromImageTexts([['Mercado Exemplo', 'R$ 54,90'].join('\n')], TODAY)).toBeNull();
    expect(statementFromImageTexts([''], TODAY)).toBeNull();
    expect(statementFromImageTexts([], TODAY)).toBeNull();
  });
});

describe('print da fatura do cartão (a do mês atual, que ainda não dá para baixar)', () => {
  const FATURA = [
    'Fatura aberta',
    'R$ 708,90',
    'Vence em 10 DEZ',
    'Limite disponível R$ 2.000,00',
    'Pagar fatura',
    '16 NOV',
    'Mercado Exemplo R$ 80,50',
    'Padaria Central R$ 12,30',
    '15 NOV',
    'Loja de Roupas Exemplo',
    'Parcela 3 de 4',
    'R$ 50,00',
    'Estorno Loja Exemplo -R$ 10,00',
    'Pagamento recebido -R$ 500,00',
  ].join('\n');

  it('pelas palavras é fatura; compra sem sinal, "-" é crédito; a parcela vira "PARC 3/4"; total, vencimento e limite ficam de fora', () => {
    const r = statementFromImageTexts([FATURA], TODAY)!;
    expect(r.statement).toBe('cartao');
    expect(rows(r)).toEqual([
      ['2026-11-16', 'Mercado Exemplo', -8_050],
      ['2026-11-16', 'Padaria Central', -1_230],
      ['2026-11-15', 'Loja de Roupas Exemplo PARC 3/4', -5_000],
      ['2026-11-15', 'Estorno Loja Exemplo', 1_000],
      ['2026-11-15', 'Pagamento recebido', 50_000],
    ]);
  });

  it('"Parcela 3 de 4 de R$ 50,00" na linha de baixo da descrição: o "de" solto não vira descrição', () => {
    const r = statementFromImageTexts([['16 NOV', 'Loja de Móveis', 'Parcela 3 de 4 de R$ 50,00'].join('\n')], TODAY, 'cartao')!;
    expect(rows(r)).toEqual([['2026-11-16', 'Loja de Móveis PARC 3/4', -5_000]]);
  });

  it('vindo de "Importar fatura", o destino cartão vale mesmo sem a palavra "fatura" no print; "3/4" sozinho numa linha também é a parcela', () => {
    const r = statementFromImageTexts([['16 NOV', 'Mercado Exemplo', 'R$ 80,50', 'Loja de Móveis', '3/4', 'R$ 120,00'].join('\n')], TODAY, 'cartao')!;
    expect(r.statement).toBe('cartao');
    expect(rows(r)).toEqual([
      ['2026-11-16', 'Mercado Exemplo', -8_050],
      ['2026-11-16', 'Loja de Móveis PARC 3/4', -12_000],
    ]);
  });

  it('na conferência: as compras entram na fatura aberta, a parcela em andamento vem marcada, o pagamento fica de fora e tudo diz "lido de imagem"', () => {
    const parse = statementFromImageTexts([FATURA], TODAY)!;
    const input: ReviewInput = {
      parse,
      destination: 'cartao',
      targetId: 'cartao-x',
      today: TODAY,
      invertSigns: false,
      memory: {},
      existing: [],
      importedKeys: new Set(),
      card: { days: { closingDay: 3, dueDay: 10 }, paidMonths: new Set() },
    };
    const lines = buildReview(input);
    expect(lines.every((l) => l.fromImage)).toBe(true);
    expect(lines.map((l) => [l.kind, l.label, l.include])).toEqual([
      ['compra', null, true],
      ['compra', null, true],
      ['compra', 'parcela', true],
      ['estorno', null, false],
      ['pagamento', 'pagamento_recebido', false],
    ]);
    // Compra de 16/11 num cartão que fecha no dia 3: fatura aberta, com vencimento em dezembro; a parcela 3 de 4 nela e a 4 na seguinte.
    expect(lines[2]!.hint).toBe('Parcela 3 de 4: entra na fatura de dezembro de 2026 e a última na seguinte.');
    expect(toImportItems(lines).map((i) => [i.kind, i.amountCents, i.installment ?? null])).toEqual([
      ['compra', 8_050, null],
      ['compra', 1_230, null],
      ['compra', 5_000, { number: 3, count: 4 }],
    ]);
  });
});

describe('texto como o leitor da web devolve (tesseract.js, print gerado com quatro linhas de fatura)', () => {
  const EXPECTED = [
    ['2026-10-06', 'Mercado Exemplo', -8_050],
    ['2026-10-06', 'Padaria Central', -1_230],
    ['2026-10-05', 'Loja de Roupas Exemplo PARC 3/4', -5_000],
    ['2026-10-05', 'Estorno Cinema Centro', 1_000],
  ];
  it('modo automático: a coluna das descrições e depois a dos valores', () => {
    const text = 'Fatura aberta\n06 OUT\nMercado Exemplo\n\nPadaria Central\n\n05 OUT\n\nLoja de Roupas Exemplo\nParcela 3 de 4\n\nEstorno Cinema Centro\n\nR$ 80,50\nR$ 12,30\n\nR$ 50,00\n\n-R$ 10,00\n';
    expect(rows(statementFromImageTexts([text], '2026-10-07', 'cartao'))).toEqual(EXPECTED);
  });
  it('uma coluna: cada linha com o valor, e a parcela na linha de baixo', () => {
    const text = 'Fatura aberta\n\n06 OUT\nMercado Exemplo R$ 80,50\nPadaria Central R$ 12,30\n05 OUT\n\nLoja de Roupas Exemplo R$ 50,00\nParcela 3 de 4\n\nEstorno Cinema Centro -R$ 10,00\n';
    expect(rows(statementFromImageTexts([text], '2026-10-07', 'cartao'))).toEqual(EXPECTED);
  });
});

describe('texto como o leitor da web devolve os prints do teste de telas (D-108)', () => {
  it('a descrição comprida em maiúsculas quebrada em duas linhas continua o lançamento de cima', () => {
    const text = 'Extrato\n06 OUT\n\nENTRADA REND PAGO R$ 0,01\nAPLIC AUT APR\n\nTRANSF MARIA EXEMPLO -R$ 50,00\n\nTARIFA PACOTE -R$ 30,00\n05 OUT\nTED RECEBIDA ANA R$ 120,00\n\nEXEMPLO\n';
    const r = statementFromImageTexts([text], '2026-10-07')!;
    expect(r.statement).toBe('conta');
    expect(rows(r)).toEqual([
      ['2026-10-06', 'ENTRADA REND PAGO APLIC AUT APR', 1],
      ['2026-10-06', 'TRANSF MARIA EXEMPLO', -5_000],
      ['2026-10-06', 'TARIFA PACOTE', -3_000],
      ['2026-10-05', 'TED RECEBIDA ANA EXEMPLO', 12_000],
    ]);
  });

  it('a linha em minúsculas logo abaixo (detalhe do app) não entra na descrição, e a linha seguinte de valor sozinho a usa', () => {
    const r = statementFromImageTexts([['06 OUT', 'Mercado Exemplo R$ 80,50', 'Débito', 'PADARIA CENTRAL R$ 12,30', 'FARMACIA', 'R$ 25,00'].join('\n')], '2026-10-07', 'cartao')!;
    expect(rows(r)).toEqual([
      ['2026-10-06', 'Mercado Exemplo', -8_050],
      ['2026-10-06', 'PADARIA CENTRAL', -1_230],
      ['2026-10-06', 'FARMACIA', -2_500],
    ]);
  });

  it('os dois prints da fatura e o print sem lançamento', () => {
    const f1 = 'Fatura aberta\n\n06 OUT\nMercado Exemplo R$ 80,50\nPadaria Central R$ 12,30\n05 OUT\n\nLoja de Roupas Exemplo R$ 50,00\nParcela 3 de 4\n';
    const f2 = 'Fatura aberta\n05 OUT\n\nLoja de Roupas Exemplo R$ 50,00\nParcela 3 de 4\n\nEstorno Cinema Centro -R$ 10,00\n\n04 OUT\nFarmácia Central R$ 25,00\n';
    const r = statementFromImageTexts([f1, f2], '2026-10-07', 'cartao')!;
    expect(r.repeated).toBe(1);
    expect(rows(r)).toEqual([
      ['2026-10-06', 'Mercado Exemplo', -8_050],
      ['2026-10-06', 'Padaria Central', -1_230],
      ['2026-10-05', 'Loja de Roupas Exemplo PARC 3/4', -5_000],
      ['2026-10-05', 'Estorno Cinema Centro', 1_000],
      ['2026-10-04', 'Farmácia Central', -2_500],
    ]);
    expect(statementFromImageTexts(['Saldo disponível\nConta corrente R$ 1.234,56\n\nVer mais\n'], '2026-10-07')).toBeNull();
  });
});

describe('vários prints na mesma conferência', () => {
  const PRINT_1 = ['16 NOV', 'Mercado Exemplo R$ 80,50', 'Café Central R$ 6,00', 'Café Central R$ 6,00', '15 NOV', 'Farmácia Central R$ 25,00'].join('\n');
  // O segundo print, rolando a tela, repete o fim do primeiro (com uma diferença de leitura: "Farmacia").
  const PRINT_2 = ['15 NOV', 'Farmacia Central R$ 25,00', 'Posto Exemplo R$ 150,00', '14 NOV', 'Padaria R$ 9,90'].join('\n');

  it('juntam as linhas, tiram as repetidas entre prints e mantêm as iguais do mesmo print', () => {
    const r = statementFromImageTexts([PRINT_1, PRINT_2], TODAY, 'cartao')!;
    expect(r.repeated).toBe(1);
    expect(rows(r)).toEqual([
      ['2026-11-16', 'Mercado Exemplo', -8_050],
      ['2026-11-16', 'Café Central', -600],
      ['2026-11-16', 'Café Central', -600],
      ['2026-11-15', 'Farmácia Central', -2_500],
      ['2026-11-15', 'Posto Exemplo', -15_000],
      ['2026-11-14', 'Padaria', -990],
    ]);
    expect(r.lines.map((l) => l.ordinal)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('na ordem contrária dá as mesmas linhas; o mesmo print duas vezes conta uma vez', () => {
    const r = statementFromImageTexts([PRINT_2, PRINT_1], TODAY, 'cartao')!;
    expect(r.repeated).toBe(1);
    expect(r.lines).toHaveLength(6);
    const twice = statementFromImageTexts([PRINT_1, PRINT_1], TODAY, 'cartao')!;
    expect(twice.repeated).toBe(4);
    expect(twice.lines).toHaveLength(4);
  });

  it('as linhas do topo de um print, antes de qualquer data, ficam com a última data do print anterior', () => {
    const r = statementFromImageTexts([['16 NOV', 'Mercado Exemplo R$ 80,50'].join('\n'), ['Padaria R$ 9,90', '15 NOV', 'Posto R$ 150,00'].join('\n')], TODAY, 'cartao')!;
    expect(rows(r)).toEqual([
      ['2026-11-16', 'Mercado Exemplo', -8_050],
      ['2026-11-16', 'Padaria', -990],
      ['2026-11-15', 'Posto', -15_000],
    ]);
  });

  it('o limite de prints por vez é 10', () => {
    expect(IMPORT_MAX_IMAGES).toBe(10);
  });
});
