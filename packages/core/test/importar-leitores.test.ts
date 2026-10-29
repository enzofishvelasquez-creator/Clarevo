import { describe, expect, it } from 'vitest';
import {
  IMPORT_MAX_BYTES,
  IMPORT_MAX_LINES,
  applyMapping,
  cleanDescription,
  decodeEntities,
  decodeImportBytes,
  decodeUtf8Strict,
  decodeWindows1252,
  detectColumns,
  detectDecimal,
  detectDelimiter,
  detectMapping,
  headerKey,
  looksLikeOfx,
  ofxDescription,
  parseAmountCents,
  parseCsvBytes,
  parseCsvText,
  parseFileDate,
  parseOfxAmount,
  ofxDate,
  parseOfxBytes,
  parseOfxText,
  readCsvTable,
  readImportFile,
  splitCsv,
} from '../src';

/** Texto em bytes UTF-8 / Windows-1252 (só Latin-1 aqui), para os arquivos de teste. */
const utf8 = (text: string) => new Uint8Array(Buffer.from(text, 'utf8'));
const cp1252 = (text: string) => new Uint8Array(Buffer.from(text, 'latin1'));

describe('importar: leitura dos bytes', () => {
  it('UTF-8, com e sem BOM', () => {
    expect(decodeImportBytes(utf8('Pão de açúcar'))).toEqual({ text: 'Pão de açúcar', encoding: 'utf-8' });
    expect(decodeImportBytes(new Uint8Array([0xef, 0xbb, 0xbf, ...utf8('Olá')]))).toEqual({ text: 'Olá', encoding: 'utf-8' });
    expect(decodeUtf8Strict(utf8('😀 ok'))).toBe('😀 ok');
  });

  it('Windows-1252 quando os bytes não são UTF-8 (acentos, cedilha e euro)', () => {
    const bytes = cp1252('Padaria São João - Ação ção');
    expect(decodeUtf8Strict(bytes)).toBeNull();
    expect(decodeImportBytes(bytes)).toEqual({ text: 'Padaria São João - Ação ção', encoding: 'windows-1252' });
    expect(decodeWindows1252(new Uint8Array([0x80, 0x93, 0x94, 0x96, 0x41]))).toBe('€“”–A');
  });

  it('UTF-16 com BOM (planilhas "Unicode" do Excel)', () => {
    const le = Buffer.from('﻿Data;Valor', 'utf16le');
    expect(decodeImportBytes(new Uint8Array(le))).toEqual({ text: 'Data;Valor', encoding: 'utf-16' });
  });

  it('UTF-8 truncado ou fora do padrão não passa', () => {
    expect(decodeUtf8Strict(new Uint8Array([0xc3]))).toBeNull();
    expect(decodeUtf8Strict(new Uint8Array([0xe2, 0x82]))).toBeNull();
    expect(decodeUtf8Strict(new Uint8Array([0xc0, 0x80]))).toBeNull();
    expect(decodeUtf8Strict(new Uint8Array([0xed, 0xa0, 0x80]))).toBeNull();
    expect(decodeUtf8Strict(new Uint8Array([0xf5, 0x80, 0x80, 0x80]))).toBeNull();
  });

  it('arquivo grande é lido por partes, sem estourar a pilha', () => {
    const big = utf8('a'.repeat(300_000));
    expect(decodeImportBytes(big).text.length).toBe(300_000);
  });
});

describe('importar: valores e datas', () => {
  it('valores em reais com vírgula, ponto, milhares, sinais e símbolos', () => {
    const cases: [string, number | null][] = [
      ['12,34', 1234],
      ['-12,34', -1234],
      ['1.234,56', 123456],
      ['-1.234,56', -123456],
      ['1,234.56', 123456],
      ['1234.56', 123456],
      ['-45.9', -4590],
      ['45', 4500],
      ['0,5', 50],
      [',50', 50],
      ['R$ 1.234,56', 123456],
      ['R$1.234,56', 123456],
      ['-R$ 10,00', -1000],
      ['(12,34)', -1234],
      ['12,34-', -1234],
      ['+12,34', 1234],
      ['  12,34  ', 1234],
      ['1.234.567,89', 123456789],
      ['1.234', 123400],
      ['1.234.567', 123456700],
      ['0.50', 50],
      ['0,500', null],
      ['0.500', null],
      ['00.500', null],
      ['', null],
      ['abc', null],
      ['12,345', null],
      ['1,2,3', null],
      ['12,', null],
      ['--5', null],
      ['R$', null],
    ];
    for (const [text, expected] of cases) expect(parseAmountCents(text), text).toBe(expected);
    expect(parseAmountCents('12\u00a0345,67')).toBe(1234567);
    expect(parseAmountCents('\u00a012,34\u00a0')).toBe(1234);
  });

  it('o decimal pode ser forçado pelo arquivo', () => {
    expect(parseAmountCents('1,234', '.')).toBe(123400);
    expect(parseAmountCents('1.234', ',')).toBe(123400);
    expect(parseAmountCents('1.234,5', ',')).toBe(123450);
    expect(parseAmountCents('12.5', ',')).toBeNull();
    expect(parseAmountCents('1,234.56', '.')).toBe(123456);
  });

  it('valor com dígitos demais volta acima do limite (a linha é marcada, não perdida)', () => {
    expect(parseAmountCents('99999999999999')).toBeGreaterThan(999_999_999);
    expect(parseAmountCents('-99999999999999')).toBeLessThan(-999_999_999);
  });

  it('datas em dd/mm/aaaa, dd/mm/aa, aaaa-mm-dd e variações; data impossível não vale', () => {
    const cases: [string, string | null][] = [
      ['03/10/2026', '2026-10-03'],
      ['3/10/2026', '2026-10-03'],
      ['03/10/26', '2026-10-03'],
      ['03-10-2026', '2026-10-03'],
      ['03.10.2026', '2026-10-03'],
      ['2026-10-03', '2026-10-03'],
      ['2026/10/03', '2026-10-03'],
      ['2026-10-03 14:35:10', '2026-10-03'],
      ['2026-10-03T14:35:10Z', '2026-10-03'],
      ['03/10/2026 14:35', '2026-10-03'],
      ['29/02/2028', '2028-02-29'],
      ['29/02/2026', null],
      ['31/04/2026', null],
      ['2026-13-01', null],
      ['10/03', null],
      ['outubro', null],
      ['', null],
    ];
    for (const [text, expected] of cases) expect(parseFileDate(text), text).toBe(expected);
  });

  it('descrição: controle e espaços reduzidos, aparada e com até 80 caracteres', () => {
    expect(cleanDescription('  PADARIA \t\n  SAO   JOAO  ')).toBe('PADARIA SAO JOAO');
    expect(cleanDescription('a\u0000b\u200bc')).toBe('a b c');
    const long = `${'palavra '.repeat(20)}fim`;
    const cut = cleanDescription(long);
    expect([...cut].length).toBeLessThanOrEqual(80);
    expect(cut.endsWith('palavra')).toBe(true);
    expect([...cleanDescription('x'.repeat(200))].length).toBe(80);
  });
});

// ---------------------------------------------------------------------------
// OFX
// ---------------------------------------------------------------------------

const OFX_SGML_ACCOUNT = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
SECURITY:NONE
ENCODING:USASCII
CHARSET:1252
COMPRESSION:NONE
OLDFILEUID:NONE
NEWFILEUID:NONE

<OFX>
<SIGNONMSGSRSV1><SONRS><STATUS><CODE>0<SEVERITY>INFO</STATUS><DTSERVER>20261007120000[-3:BRT]<LANGUAGE>POR</SONRS></SIGNONMSGSRSV1>
<BANKMSGSRSV1>
<STMTTRNRS>
<TRNUID>1
<STATUS><CODE>0<SEVERITY>INFO</STATUS>
<STMTRS>
<CURDEF>BRL
<BANKACCTFROM><BANKID>0000<ACCTID>00000-0<ACCTTYPE>CHECKING</BANKACCTFROM>
<BANKTRANLIST>
<DTSTART>20260901000000[-3:BRT]
<DTEND>20261007000000[-3:BRT]
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20261002000000[-3:BRT]
<TRNAMT>-45.90
<FITID>EX20261002001
<MEMO>COMPRA PADARIA SÃO JOÃO
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20261005120000
<TRNAMT>5000.00
<FITID>EX20261005001
<NAME>SALÁRIO
<MEMO>EMPRESA EXEMPLO LTDA
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20261006
<TRNAMT>-1234.56
<FITID>EX20261006001
<NAME>PAGAMENTO FATURA CARTÃO
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20261006
<TRNAMT>0.00
<FITID>EX20261006002
<MEMO>AJUSTE ZERO
</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL><BALAMT>1234.56<DTASOF>20261007000000</LEDGERBAL>
<AVAILBAL><BALAMT>1200.00<DTASOF>20261007000000</AVAILBAL>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>
`;

const OFX_XML_CARD = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<?OFX OFXHEADER="200" VERSION="211" SECURITY="NONE" OLDFILEUID="NONE" NEWFILEUID="NONE"?>
<OFX>
  <CREDITCARDMSGSRSV1>
    <CCSTMTTRNRS>
      <CCSTMTRS>
        <CURDEF>BRL</CURDEF>
        <CCACCTFROM><ACCTID>0000</ACCTID></CCACCTFROM>
        <BANKTRANLIST>
          <DTSTART>20260904</DTSTART>
          <DTEND>20261003</DTEND>
          <STMTTRN>
            <TRNTYPE>DEBIT</TRNTYPE>
            <DTPOSTED>20260920000000[-3:BRT]</DTPOSTED>
            <TRNAMT>-200.00</TRNAMT>
            <FITID>cc-0001</FITID>
            <MEMO>Livraria &amp; Papelaria Exemplo</MEMO>
          </STMTTRN>
          <STMTTRN>
            <TRNTYPE>DEBIT</TRNTYPE>
            <DTPOSTED>20261003000000[-3:BRT]</DTPOSTED>
            <TRNAMT>-80.50</TRNAMT>
            <FITID>cc-0002</FITID>
            <MEMO>Mercado do bairro</MEMO>
          </STMTTRN>
          <STMTTRN>
            <TRNTYPE>CREDIT</TRNTYPE>
            <DTPOSTED>20261003000000[-3:BRT]</DTPOSTED>
            <TRNAMT>40.00</TRNAMT>
            <FITID>cc-0003</FITID>
            <MEMO>Estorno de compra</MEMO>
          </STMTTRN>
          <STMTTRN>
            <TRNTYPE>PAYMENT</TRNTYPE>
            <DTPOSTED>20261003000000[-3:BRT]</DTPOSTED>
            <TRNAMT>150.00</TRNAMT>
            <FITID>cc-0004</FITID>
            <MEMO>Pagamento recebido</MEMO>
          </STMTTRN>
        </BANKTRANLIST>
        <LEDGERBAL><BALAMT>-90.50</BALAMT><DTASOF>20261003</DTASOF></LEDGERBAL>
      </CCSTMTRS>
    </CCSTMTTRNRS>
  </CREDITCARDMSGSRSV1>
</OFX>`;

describe('importar: OFX', () => {
  it('SGML 1.x de extrato de conta, em Windows-1252: data, valor, FITID, NAME e MEMO; saldo ignorado', () => {
    const bytes = cp1252(OFX_SGML_ACCOUNT.replace(/\\u00c3/g, 'Ã').replace(/\\u00c1/g, 'Á'));
    expect(decodeUtf8Strict(bytes)).toBeNull();
    const r = parseOfxBytes(bytes);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.parse.source).toBe('ofx');
    expect(r.parse.statement).toBe('conta');
    expect(r.parse.balanceIgnored).toBe(true);
    expect(r.parse.cardPositive).toBe(false);
    expect(r.parse.ignored).toBe(1);
    expect(r.parse.lines).toEqual([
      { ordinal: 1, date: '2026-10-02', description: 'COMPRA PADARIA SÃO JOÃO', amountCents: -4590, fitId: 'EX20261002001' },
      { ordinal: 2, date: '2026-10-05', description: 'SALÁRIO EMPRESA EXEMPLO LTDA', amountCents: 500000, fitId: 'EX20261005001' },
      { ordinal: 3, date: '2026-10-06', description: 'PAGAMENTO FATURA CARTÃO', amountCents: -123456, fitId: 'EX20261006001' },
    ]);
  });

  it('XML 2.x de fatura de cartão: entidades, compras negativas, estorno e pagamento positivos', () => {
    const r = parseOfxBytes(utf8(OFX_XML_CARD));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.parse.statement).toBe('cartao');
    expect(r.parse.balanceIgnored).toBe(true);
    expect(r.parse.lines.map((l) => [l.date, l.description, l.amountCents, l.fitId])).toEqual([
      ['2026-09-20', 'Livraria & Papelaria Exemplo', -20000, 'cc-0001'],
      ['2026-10-03', 'Mercado do bairro', -8050, 'cc-0002'],
      ['2026-10-03', 'Estorno de compra', 4000, 'cc-0003'],
      ['2026-10-03', 'Pagamento recebido', 15000, 'cc-0004'],
    ]);
  });

  it('SGML sem o fechamento da transação ainda é lido, e uma transação nova fecha a anterior', () => {
    const text = `<OFX><BANKMSGSRSV1><STMTRS><CURDEF>BRL<BANKTRANLIST>
<STMTTRN><DTPOSTED>20261001<TRNAMT>-10.00<FITID>a<MEMO>Um
<STMTTRN><DTPOSTED>20261002<TRNAMT>-20.00<FITID>b<MEMO>Dois
</BANKTRANLIST></STMTRS></BANKMSGSRSV1></OFX>`;
    const r = parseOfxText(text);
    expect(r.ok && r.parse.lines.map((l) => [l.description, l.amountCents])).toEqual([
      ['Um', -1000],
      ['Dois', -2000],
    ]);
  });

  it('MEMO e NAME: um dentro do outro não repete; diferentes se juntam; entidades são decodificadas', () => {
    expect(ofxDescription('PADARIA', 'COMPRA PADARIA SAO JOAO')).toBe('COMPRA PADARIA SAO JOAO');
    expect(ofxDescription('COMPRA PADARIA SAO JOAO', 'PADARIA')).toBe('COMPRA PADARIA SAO JOAO');
    expect(ofxDescription('SALARIO', 'EMPRESA EXEMPLO')).toBe('SALARIO EMPRESA EXEMPLO');
    expect(ofxDescription('Loja', 'loja')).toBe('loja');
    expect(ofxDescription(undefined, ' So memo ')).toBe('So memo');
    expect(ofxDescription('So nome', undefined)).toBe('So nome');
    expect(ofxDescription(undefined, undefined)).toBe('');
    expect(decodeEntities('A &amp; B &lt;c&gt; &quot;d&quot; &#233; &#xE9; &desconhecida; &#0;')).toBe('A & B <c> "d" é é &desconhecida; &#0;');
  });

  it('sem FITID a linha vem sem identificador; o dia usa só os oito primeiros dígitos', () => {
    const r = parseOfxText('<OFX><BANKMSGSRSV1><STMTRS><BANKTRANLIST><STMTTRN><DTPOSTED>20261004235959.000[-3:BRT]<TRNAMT>-3,50<NAME>Cafe</STMTTRN></BANKTRANLIST></STMTRS></BANKMSGSRSV1></OFX>');
    expect(r.ok && r.parse.lines).toEqual([{ ordinal: 1, date: '2026-10-04', description: 'Cafe', amountCents: -350, fitId: null }]);
  });

  it('TRNAMT: leitor próprio, sem milhar; mais de duas casas, mais de um separador ou letras recusam a linha', () => {
    const cases: [string, number | null][] = [
      ['-45.90', -4590],
      ['-45,90', -4590],
      ['+5000.00', 500000],
      ['5000', 500000],
      ['-1500', -150000],
      ['-1500.5', -150050],
      ['.50', 50],
      ['0.00', 0],
      ['-1.500', null],
      ['1,500', null],
      ['-1.234,56', null],
      ['1,234.56', null],
      ['1.2.3', null],
      ['12.', null],
      ['', null],
      ['-', null],
      ['R$ 10.00', null],
      ['10.00-', null],
    ];
    for (const [text, expected] of cases) expect(parseOfxAmount(text), text).toBe(expected);
    expect(parseOfxAmount('99999999999999.00')).toBeGreaterThan(999_999_999);
    // A linha com "-1.500" fica de fora (contada), não vira R$ 1.500,00.
    const r = parseOfxText(
      '<OFX><BANKMSGSRSV1><STMTRS><BANKTRANLIST><STMTTRN><DTPOSTED>20261004<TRNAMT>-1.500<NAME>A</STMTTRN><STMTTRN><DTPOSTED>20261004<TRNAMT>-1500.00<NAME>B</STMTTRN></BANKTRANLIST></STMTRS></BANKMSGSRSV1></OFX>',
    );
    expect(r.ok && [r.parse.ignored, r.parse.lines.map((l) => [l.description, l.amountCents])]).toEqual([1, [['B', -150000]]]);
  });

  it('DTPOSTED com fuso: converte hora e fuso para o dia no fuso da pessoa; data sem hora vale como escrita', () => {
    // Sem fuso, só data ou hora zerada: o dia escrito.
    expect(ofxDate('20261004')).toBe('2026-10-04');
    expect(ofxDate('20261004120000')).toBe('2026-10-04');
    expect(ofxDate('20261004000000[0:GMT]')).toBe('2026-10-04');
    expect(ofxDate('20261004000000[-3:BRT]')).toBe('2026-10-04');
    // Mesmo fuso da pessoa (São Paulo, -3): o mesmo dia.
    expect(ofxDate('20261004233000[-3:BRT]')).toBe('2026-10-04');
    // GMT: 01h30 do dia 5 em GMT é 22h30 do dia 4 em São Paulo.
    expect(ofxDate('20261005013000[0:GMT]')).toBe('2026-10-04');
    expect(ofxDate('20261005120000[0:GMT]')).toBe('2026-10-05');
    // Fuso com fração e fuso positivo; hora com decimais de segundo.
    expect(ofxDate('20261005003000.000[5.5:IST]')).toBe('2026-10-04');
    expect(ofxDate('20261004230000[+9:JST]')).toBe('2026-10-04');
    expect(ofxDate('20261004230000[-8:PST]')).toBe('2026-10-05');
    // O fuso da pessoa vem do espaço: Rio Branco (-5) vê o dia anterior.
    expect(ofxDate('20261005013000[0:GMT]', 'America/Rio_Branco')).toBe('2026-10-04');
    expect(ofxDate('20261005053000[0:GMT]', 'America/Rio_Branco')).toBe('2026-10-05');
    expect(ofxDate('20261005053000[0:GMT]', 'Fuso/Inexistente')).toBe('2026-10-05');
    // Data impossível, lixo e fuso fora do possível.
    expect(ofxDate('20261305')).toBeNull();
    expect(ofxDate('sem')).toBeNull();
    expect(ofxDate(undefined)).toBeNull();
    expect(ofxDate('20261005013000[99:XXX]')).toBe('2026-10-05');
    const r = parseOfxText('<OFX><BANKMSGSRSV1><STMTRS><BANKTRANLIST><STMTTRN><DTPOSTED>20261005013000[0:GMT]<TRNAMT>-3.50<NAME>Cafe</STMTTRN></BANKTRANLIST></STMTRS></BANKMSGSRSV1></OFX>');
    expect(r.ok && r.parse.lines[0]!.date).toBe('2026-10-04');
    const rio = parseOfxText('<OFX><BANKMSGSRSV1><STMTRS><BANKTRANLIST><STMTTRN><DTPOSTED>20261005053000[0:GMT]<TRNAMT>-3.50<NAME>Cafe</STMTTRN></BANKTRANLIST></STMTRS></BANKMSGSRSV1></OFX>', 'America/Rio_Branco');
    expect(rio.ok && rio.parse.lines[0]!.date).toBe('2026-10-05');
    const viaFile = readImportFile(utf8('<OFX><BANKMSGSRSV1><STMTRS><BANKTRANLIST><STMTTRN><DTPOSTED>20261005013000[0:GMT]<TRNAMT>-3.50<NAME>Cafe</STMTTRN></BANKTRANLIST></STMTRS></BANKMSGSRSV1></OFX>'), 'a.ofx', 'America/Rio_Branco');
    expect(viaFile.kind === 'ok' && viaFile.parse.lines[0]!.date).toBe('2026-10-04');
  });

  it('erros: não é OFX, sem lançamentos, outra moeda, linhas demais', () => {
    expect(looksLikeOfx(OFX_SGML_ACCOUNT)).toBe(true);
    expect(looksLikeOfx(OFX_XML_CARD)).toBe(true);
    expect(looksLikeOfx('Data;Valor\n01/10/2026;10,00')).toBe(false);
    expect(parseOfxText('texto qualquer')).toEqual({ ok: false, code: 'ofx_invalido' });
    expect(parseOfxText('<OFX></OFX>')).toEqual({ ok: false, code: 'ofx_invalido' });
    expect(parseOfxText('<OFX><BANKMSGSRSV1><STMTRS><CURDEF>BRL<BANKTRANLIST></BANKTRANLIST></STMTRS></BANKMSGSRSV1></OFX>')).toEqual({ ok: false, code: 'sem_lancamentos' });
    expect(parseOfxText(OFX_XML_CARD.replace('<CURDEF>BRL</CURDEF>', '<CURDEF>USD</CURDEF>'))).toEqual({ ok: false, code: 'moeda_diferente' });
    const many = Array.from({ length: IMPORT_MAX_LINES + 1 }, (_, i) => `<STMTTRN><DTPOSTED>20261001<TRNAMT>-1.00<FITID>${i}<MEMO>x</STMTTRN>`).join('');
    expect(parseOfxText(`<OFX><BANKMSGSRSV1><STMTRS><BANKTRANLIST>${many}</BANKTRANLIST></STMTRS></BANKMSGSRSV1></OFX>`)).toEqual({ ok: false, code: 'linhas_demais' });
    const exact = Array.from({ length: IMPORT_MAX_LINES }, (_, i) => `<STMTTRN><DTPOSTED>20261001<TRNAMT>-1.00<FITID>${i}<MEMO>x</STMTTRN>`).join('');
    const ok = parseOfxText(`<OFX><BANKMSGSRSV1><STMTRS><BANKTRANLIST>${exact}</BANKTRANLIST></STMTRS></BANKMSGSRSV1></OFX>`);
    expect(ok.ok && ok.parse.lines.length).toBe(IMPORT_MAX_LINES);
  });

  it('linha sem data ou sem valor legível é deixada de lado e contada', () => {
    const r = parseOfxText(
      '<OFX><BANKMSGSRSV1><STMTRS><BANKTRANLIST><STMTTRN><DTPOSTED>sem<TRNAMT>-3.50<NAME>A</STMTTRN><STMTTRN><DTPOSTED>20261004<TRNAMT>x<NAME>B</STMTTRN><STMTTRN><DTPOSTED>20261004<TRNAMT>-1.00<NAME>C</STMTTRN></BANKTRANLIST></STMTRS></BANKMSGSRSV1></OFX>',
    );
    expect(r.ok && r.parse.ignored).toBe(2);
    expect(r.ok && r.parse.lines.map((l) => l.description)).toEqual(['C']);
  });
});

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

describe('importar: CSV', () => {
  it('separador ponto e vírgula, decimal vírgula, data dd/mm/aaaa e milhares', () => {
    const text = 'Data;Lançamento;Valor\r\n01/10/2026;PADARIA SÃO JOÃO;-45,90\r\n02/10/2026;SALÁRIO;"5.000,00"\r\n03/10/2026;SALDO DO DIA;1.234,56\r\n\r\n04/10/2026;LUZ;-1.234,56\r\n';
    const r = parseCsvText(text);
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    expect(r.table.delimiter).toBe(';');
    expect(r.parse.source).toBe('csv');
    expect(r.parse.statement).toBeNull();
    // Dois valores negativos e um positivo: o sinal já é o do app, a revisão não inverte numa fatura.
    expect(r.parse.cardPositive).toBe(false);
    expect(r.parse.ignored).toBe(1);
    expect(r.parse.lines.map((l) => [l.date, l.description, l.amountCents])).toEqual([
      ['2026-10-01', 'PADARIA SÃO JOÃO', -4590],
      ['2026-10-02', 'SALÁRIO', 500000],
      ['2026-10-04', 'LUZ', -123456],
    ]);
  });

  it('separador vírgula, decimal ponto e data aaaa-mm-dd (fatura com título e valor positivo)', () => {
    const text = 'date,category,title,amount\n2026-09-20,educação,Livraria Exemplo,200.00\n2026-10-03,mercado,"Mercado, bairro",80.50\n2026-10-03,pagamento,Pagamento recebido,-150.00\n';
    const r = parseCsvText(text);
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    expect(r.table.delimiter).toBe(',');
    expect(r.parse.cardPositive).toBe(true);
    expect(r.parse.lines.map((l) => [l.date, l.description, l.amountCents])).toEqual([
      ['2026-09-20', 'Livraria Exemplo', 20000],
      ['2026-10-03', 'Mercado, bairro', 8050],
      ['2026-10-03', 'Pagamento recebido', -15000],
    ]);
  });

  it('colunas de débito e crédito separadas (e saldo ignorado); o sinal vem das colunas', () => {
    const text = 'Extrato da conta\nPeríodo: 01/10/2026 a 07/10/2026\n\nData;Histórico;Docto.;Crédito (R$);Débito (R$);Saldo (R$)\n01/10/2026;PIX RECEBIDO;1;100,00;;1.100,00\n02/10/2026;COMPRA MERCADO;2;;45,90;1.054,10\n';
    const r = parseCsvText(text);
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    expect(r.parse.balanceIgnored).toBe(true);
    expect(r.parse.cardPositive).toBe(false);
    expect(r.parse.lines.map((l) => [l.description, l.amountCents])).toEqual([
      ['PIX RECEBIDO', 10000],
      ['COMPRA MERCADO', -4590],
    ]);
  });

  it('coluna de tipo (débito ou crédito) com valores sem sinal', () => {
    const r = parseCsvText('Data;Descrição;Tipo;Valor\n01/10/2026;Mercado;Débito;45,90\n02/10/2026;Salário;Crédito;5.000,00\n');
    expect(r.kind === 'ok' && r.parse.lines.map((l) => l.amountCents)).toEqual([-4590, 500000]);
    expect(r.kind === 'ok' && r.parse.cardPositive).toBe(false);
    // Com sinais no arquivo, a coluna de tipo não inverte nada.
    const s = parseCsvText('Data;Descrição;Tipo;Valor\n01/10/2026;Mercado;Débito;-45,90\n02/10/2026;Salário;Crédito;5.000,00\n');
    expect(s.kind === 'ok' && s.parse.lines.map((l) => l.amountCents)).toEqual([-4590, 500000]);
  });

  it('negativos com parênteses e com o sinal atrás; datas com duas casas de ano', () => {
    const r = parseCsvText('data;descricao;valor\n01/10/26;A;(12,34)\n02/10/26;B;12,34-\n03/10/26;C;12,34\n');
    expect(r.kind === 'ok' && r.parse.lines.map((l) => [l.date, l.amountCents])).toEqual([
      ['2026-10-01', -1234],
      ['2026-10-02', -1234],
      ['2026-10-03', 1234],
    ]);
  });

  it('Windows-1252, BOM e tabulação', () => {
    const win = parseCsvBytes(cp1252('Data;Descrição;Valor\n01/10/2026;Padaria São João;-4,50\n'));
    expect(win.kind === 'ok' && win.parse.lines[0]!.description).toBe('Padaria São João');
    const bom = parseCsvBytes(new Uint8Array([0xef, 0xbb, 0xbf, ...utf8('Data;Descrição;Valor\n01/10/2026;Café;-4,50\n')]));
    expect(bom.kind === 'ok' && bom.parse.lines[0]!.description).toBe('Café');
    const tab = parseCsvText('Data\tDescrição\tValor\n01/10/2026\tCafé\t-4,50\n');
    expect(tab.kind === 'ok' && tab.table.delimiter).toBe('\t');
  });

  it('aspas: separador, aspas duplas e quebra de linha dentro do campo', () => {
    expect(splitCsv('a;"b;c";"d ""e"" f";"g\nh"\n1;2;3;4', ';')).toEqual([
      ['a', 'b;c', 'd "e" f', 'g\nh'],
      ['1', '2', '3', '4'],
    ]);
    expect(splitCsv('a,b\r\n\r\n,\r\nc,d', ',')).toEqual([['a', 'b'], ['c', 'd']]);
    expect(detectDelimiter('a;b;c\n1;2;3')).toBe(';');
    expect(detectDelimiter('a,b,c\n1,2,3')).toBe(',');
    expect(detectDelimiter('a\tb\tc\n1\t2\t3')).toBe('\t');
    expect(detectDelimiter('"a,b";"c,d";e\n"1,5";"2,5";3')).toBe(';');
  });

  it('decimal: pelo que mais aparece; sem pista, vírgula (ponto se o separador é vírgula)', () => {
    expect(detectDecimal(['1.234,56', '-10,00'], ';')).toBe(',');
    expect(detectDecimal(['1,234.56', '-10.00'], ',')).toBe('.');
    expect(detectDecimal(['10', '20'], ';')).toBe(',');
    expect(detectDecimal(['10', '20'], ',')).toBe('.');
  });

  it('cabeçalhos conhecidos e o que não é reconhecido', () => {
    expect(headerKey(' Descrição (R$) ')).toBe('descricao r');
    expect(detectColumns(['Data', 'Histórico', 'Valor'])).toMatchObject({ date: 0, description: 1, amount: 2 });
    expect(detectColumns(['Data da Compra', 'Descrição', 'Valor (em R$)'])).toMatchObject({ date: 0, description: 1, amount: 2 });
    expect(detectColumns(['Data', 'Descrição', 'Valor', 'Saldo'])).toMatchObject({ amount: 2 });
    expect(detectColumns(['Vencimento', 'Descrição', 'Valor'])).toBeNull();
    expect(detectColumns(['Data', 'Valor'])).toBeNull();
    expect(detectColumns(['Coluna 1', 'Coluna 2', 'Coluna 3'])).toBeNull();
    expect(detectMapping(readCsvTable('Banco Exemplo\n\nData;Lançamento;Valor\n01/10/2026;A;1,00'))).toMatchObject({ firstRow: 2 });
  });

  it('sem cabeçalho reconhecido, devolve a tabela para escolher as colunas; com a escolha, lê', () => {
    const text = '01/10/2026;PADARIA;-45,90;x\n02/10/2026;SALARIO;5000,00;y\n';
    const r = parseCsvText(text);
    expect(r.kind).toBe('mapear');
    if (r.kind !== 'mapear') return;
    expect(r.table.rows).toHaveLength(2);
    const applied = applyMapping(r.table, { firstRow: 0, columns: { date: 0, description: 1, amount: 2, debit: -1, credit: -1, kind: -1 } });
    expect('error' in applied).toBe(false);
    if ('error' in applied) return;
    expect(applied.lines.map((l) => [l.date, l.description, l.amountCents])).toEqual([
      ['2026-10-01', 'PADARIA', -4590],
      ['2026-10-02', 'SALARIO', 500000],
    ]);
    // Colunas escolhidas que não têm data ou valor: nada lido.
    expect(applyMapping(r.table, { firstRow: 0, columns: { date: 1, description: 0, amount: 3, debit: -1, credit: -1, kind: -1 } })).toEqual({ error: 'sem_lancamentos' });
  });

  it('erros: vazio, uma coluna só, linhas demais', () => {
    expect(parseCsvText('')).toEqual({ kind: 'erro', code: 'arquivo_vazio' });
    expect(parseCsvText('\n\n')).toEqual({ kind: 'erro', code: 'arquivo_vazio' });
    expect(parseCsvText('uma coluna\noutra linha')).toEqual({ kind: 'erro', code: 'csv_invalido' });
    const rows = Array.from({ length: IMPORT_MAX_LINES + 1 }, (_, i) => `01/10/2026;Linha ${i};-1,00`).join('\n');
    expect(parseCsvText(`Data;Descrição;Valor\n${rows}`)).toEqual({ kind: 'erro', code: 'linhas_demais' });
    const exact = Array.from({ length: IMPORT_MAX_LINES }, (_, i) => `01/10/2026;Linha ${i};-1,00`).join('\n');
    const ok = parseCsvText(`Data;Descrição;Valor\n${exact}`);
    expect(ok.kind === 'ok' && ok.parse.lines.length).toBe(IMPORT_MAX_LINES);
    expect(parseCsvText('Data;Descrição;Valor\n01/10/2026;A;abc')).toEqual({ kind: 'erro', code: 'sem_lancamentos' });
  });

  it('linha de saldo, valor zero e sem data são deixadas de lado', () => {
    const r = parseCsvText('Data;Descrição;Valor\n01/10/2026;Saldo anterior;100,00\n02/10/2026;Zero;0,00\nsem data;X;1,00\n03/10/2026;Total;5,00\n04/10/2026;Real;-3,00\n');
    expect(r.kind === 'ok' && r.parse.ignored).toBe(4);
    expect(r.kind === 'ok' && r.parse.lines.map((l) => l.description)).toEqual(['Real']);
  });
});

describe('importar: CSV de fatura com sinais e linhas de saldo', () => {
  it('fatura com as compras negativas (maioria negativa) não é invertida, e o pagamento recebido positivo fica de fora', () => {
    const r = parseCsvText('Data;Descrição;Valor\n01/10/2026;Restaurante;-45,90\n02/10/2026;Farmacia;-30,00\n03/10/2026;Pagamento recebido;500,00\n');
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    expect(r.parse.cardPositive).toBe(false);
    expect(r.parse.lines.map((l) => l.amountCents)).toEqual([-4590, -3000, 50000]);
  });

  it('fatura com as compras positivas (maioria positiva) é invertida no cartão; empate não inverte', () => {
    const pos = parseCsvText('Data;Descrição;Valor\n01/10/2026;Restaurante;45,90\n02/10/2026;Farmacia;30,00\n03/10/2026;Pagamento recebido;-500,00\n');
    expect(pos.kind === 'ok' && pos.parse.cardPositive).toBe(true);
    const tie = parseCsvText('Data;Descrição;Valor\n01/10/2026;Restaurante;45,90\n03/10/2026;Pagamento recebido;-500,00\n');
    expect(tie.kind === 'ok' && tie.parse.cardPositive).toBe(false);
    const withKind = parseCsvText('Data;Descrição;Valor;Tipo\n01/10/2026;Restaurante;45,90;Débito\n02/10/2026;Farmacia;30,00;Débito\n');
    expect(withKind.kind === 'ok' && withKind.parse.cardPositive).toBe(false);
  });

  it('linha de saldo ou total sai só quando não tem data válida ou a descrição é exatamente saldo ou total; "Total Express" fica', () => {
    const text = [
      'Data;Descrição;Valor',
      '01/10/2026;Saldo anterior;100,00',
      '01/10/2026;SALDO DO DIA;100,00',
      '02/10/2026;Saldo;100,00',
      '02/10/2026;Total;5,00',
      'Saldo final;Total do período;7,00',
      '03/10/2026;Total Express;-25,00',
      '04/10/2026;Saldo de FGTS;-12,00',
      '05/10/2026;Compra Total Frutas;-8,00',
      '',
    ].join('\n');
    const r = parseCsvText(text);
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    expect(r.parse.ignored).toBe(5);
    expect(r.parse.lines.map((l) => l.description)).toEqual(['Total Express', 'Saldo de FGTS', 'Compra Total Frutas']);
  });

  it('mapeamento manual com débito e crédito separados e com coluna de tipo', () => {
    const table = readCsvTable('01/10/2026;Padaria;45,90;;x\n02/10/2026;Salário;;5000,00;y\n');
    const two = applyMapping(table, { firstRow: 0, columns: { date: 0, description: 1, amount: -1, debit: 2, credit: 3, kind: -1 } });
    expect('error' in two).toBe(false);
    if ('error' in two) return;
    expect(two.cardPositive).toBe(false);
    expect(two.lines.map((l) => l.amountCents)).toEqual([-4590, 500000]);
    const kinds = readCsvTable('01/10/2026;Padaria;45,90;D\n02/10/2026;Salário;5000,00;C\n');
    const withKind = applyMapping(kinds, { firstRow: 0, columns: { date: 0, description: 1, amount: 2, debit: -1, credit: -1, kind: 3 } });
    expect('error' in withKind).toBe(false);
    if ('error' in withKind) return;
    expect(withKind.cardPositive).toBe(false);
    expect(withKind.lines.map((l) => l.amountCents)).toEqual([-4590, 500000]);
  });
});

describe('importar: do arquivo escolhido às linhas', () => {
  it('reconhece OFX e planilha pelo conteúdo, não pela extensão', () => {
    const ofx = readImportFile(utf8(OFX_XML_CARD), 'fatura.csv');
    expect(ofx.kind === 'ok' && [ofx.parse.source, ofx.parse.statement, ofx.table]).toEqual(['ofx', 'cartao', null]);
    const csv = readImportFile(utf8('Data;Descrição;Valor\n01/10/2026;Café;-4,50\n'), 'extrato.ofx');
    expect(csv.kind === 'ok' && [csv.parse.source, csv.parse.lines.length]).toEqual(['csv', 1]);
    const sgml = readImportFile(cp1252(OFX_SGML_ACCOUNT.replace(/\\u00c3/g, '\u00c3').replace(/\\u00c1/g, '\u00c1')), 'extrato.txt');
    expect(sgml.kind === 'ok' && sgml.parse.lines.length).toBe(3);
  });

  it('planilha sem cabeçalho conhecido pede as colunas', () => {
    const r = readImportFile(utf8('01/10/2026;PADARIA;-45,90\n02/10/2026;SALARIO;5000,00\n'));
    expect(r.kind).toBe('mapear');
  });

  it('vazio, grande demais e formatos que não são OFX nem CSV são recusados', () => {
    expect(readImportFile(new Uint8Array(0))).toEqual({ kind: 'erro', code: 'arquivo_vazio' });
    expect(readImportFile(utf8('   \n \n'))).toEqual({ kind: 'erro', code: 'arquivo_vazio' });
    expect(readImportFile(new Uint8Array(IMPORT_MAX_BYTES + 1))).toEqual({ kind: 'erro', code: 'arquivo_grande' });
    expect(readImportFile(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]))).toEqual({ kind: 'erro', code: 'formato_desconhecido' });
    expect(readImportFile(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]))).toEqual({ kind: 'erro', code: 'formato_desconhecido' });
    expect(readImportFile(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]))).toEqual({ kind: 'erro', code: 'formato_desconhecido' });
    expect(readImportFile(new Uint8Array([0x61, 0x62, 0x00, 0x63]))).toEqual({ kind: 'erro', code: 'formato_desconhecido' });
    expect(readImportFile(utf8('<OFX></OFX>'))).toEqual({ kind: 'erro', code: 'ofx_invalido' });
    expect(readImportFile(utf8('texto solto sem colunas'))).toEqual({ kind: 'erro', code: 'csv_invalido' });
  });

  it('o limite de 5 MB vale para o arquivo inteiro', () => {
    const header = 'Data;Descrição;Valor\n';
    const row = '01/10/2026;Linha;-1,00\n';
    const ok = utf8(header + row.repeat(1000));
    expect(ok.length).toBeLessThan(IMPORT_MAX_BYTES);
    expect(readImportFile(ok).kind).toBe('ok');
  });
});
