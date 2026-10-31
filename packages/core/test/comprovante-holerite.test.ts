import { describe, expect, it } from 'vitest';
import {
  COMPROVANTE_TEXT,
  comprovanteDraft,
  comprovanteFromText,
  comprovanteGaps,
  comprovanteKindLabel,
  comprovanteMismatch,
  comprovanteReadLine,
  holeriteMonth,
  looksLikeHolerite,
  suggestComprovanteDescription,
  type PdfTextItem,
} from '../src';

/**
 * Holerite em PDF (retorno do teste, 31/10/2026). Tudo aqui é fictício: empresa, pessoa, documentos e valores inventados, no formato
 * de um holerite comum ("Folha Mensal", colunas de vencimentos e descontos, "Valor Líquido" no rodapé, duas vias na mesma página).
 */

// O texto corrido como o PDF.js entrega: os rótulos e os valores fora de ordem, como num holerite de verdade.
const TEXT = [
  '001',
  'conta corrente:   12345-6 ',
  'Assinatura do Funcionário ',
  '3.100,00',
  '754,33 ',
  'Código   Descrição   Referência   Vencimentos   Descontos ',
  'SALARIO MENSAL',
  'DESCONTO PLANO DE SAUDE EXEMPLO',
  'I.N.S.S.',
  '220,00',
  '7,50',
  '3.100,00',
  '310,00',
  '444,33',
  'EMPRESA EXEMPLO DE ENSINO LTDA',
  '12.345.678/0001-90 CNPJ:   CC:',
  'ALEX EXEMPLO DA SILVA ',
  'Nome do Funcionário   CBO ',
  'Folha Mensal',
  'Setembro de 2026',
  'Admissão:   01/02/2020 INSTRUTOR NÍVEL B',
  'BANCO EXEMPLO 0001',
  'Agência: 1234 - ',
  'Total de Vencimentos ',
  ' Valor Líquido',
  'Total de Descontos',
  '*** PARABÉNS PELO SEU ANIVERSÁRIO NO DIA 15 DE SETEMBRO ***',
  'Declaro ter recebido a importância líquida discriminada neste recibo. ',
  '3.100,00',
  '754,33',
  '2.345,67 ',
].join('\n');

const item = (str: string, x: number, y: number, width: number, page = 1): PdfTextItem => ({ str, x, y, width, page });

// As posições: "Valor Líquido" no rodapé, o valor na mesma linha à direita e, logo abaixo, outros números (bases do FGTS e do INSS).
const ITEMS: PdfTextItem[] = [
  item('Total de Vencimentos', 370, 559, 43),
  item('Total de Descontos', 452, 559, 38),
  item('3.100,00', 384, 536, 25),
  item('754,33', 470, 536, 20),
  item('Valor Líquido', 354, 522, 26),
  item('2.345,67', 464, 521, 25),
  item('3.100,00', 384, 496, 25),
  item('310,00', 467, 496, 20),
  // A segunda via, mais abaixo na página.
  item('Valor Líquido', 354, 110, 26),
  item('2.345,67', 464, 109, 25),
  item('3.100,00', 384, 84, 25),
];

describe('holerite em PDF: valor líquido e mês de competência', () => {
  it('reconhece o holerite pelo título da folha, "líquido" e a coluna de vencimentos ou descontos', () => {
    expect(looksLikeHolerite('folha mensal ... valor liquido ... vencimentos')).toBe(true);
    expect(looksLikeHolerite('contracheque proventos liquido a receber')).toBe(true);
    expect(looksLikeHolerite('recibo de pagamento de salario descontos total liquido')).toBe(true);
    // Comprovante de Pix: nada de folha.
    expect(looksLikeHolerite('pix enviado valor 85,00 descontos')).toBe(false);
    // Folha sem "líquido": não é o holerite que dá para ler.
    expect(looksLikeHolerite('folha mensal vencimentos descontos')).toBe(false);
  });

  it('com as posições, o valor líquido é o da mesma linha do rótulo, não o número logo abaixo', () => {
    const r = comprovanteFromText(TEXT, { defaultDirection: 'entrada', items: ITEMS });
    expect(r).toEqual({
      ok: true,
      reading: {
        kind: 'holerite',
        direction: 'entrada',
        directionGuessed: false,
        amountCents: 234_567,
        occurredOn: null,
        time: null,
        counterpart: null,
        message: 'Salário de setembro de 2026',
      },
    });
  });

  it('valor logo abaixo do rótulo, quando nada está na mesma linha', () => {
    const items = [item('Líquido a Receber', 400, 300, 60), item('1.234,56', 410, 286, 30), item('99,00', 600, 286, 20)];
    const r = comprovanteFromText(TEXT, { items });
    expect(r.ok && r.reading.amountCents).toBe(123_456);
  });

  it('rótulo e valor no mesmo pedaço de texto ("Valor Líquido: 1.980,00")', () => {
    const r = comprovanteFromText(TEXT, { items: [item('Valor Líquido: 1.980,00', 300, 200, 120)] });
    expect(r.ok && r.reading.amountCents).toBe(198_000);
  });

  it('sem posições, o valor depois do rótulo na mesma linha ou na seguinte; sem achar, valor vazio (nunca outro número)', () => {
    const inline = 'Folha de Pagamento\nCompetência: 10/2026\nVencimentos 3.000,00 Descontos 500,00\nLíquido a Receber: 2.500,00\n';
    const r1 = comprovanteFromText(inline);
    expect(r1.ok && r1.reading.amountCents).toBe(250_000);
    expect(r1.ok && r1.reading.message).toBe('Salário de outubro de 2026');
    const nextLine = 'Contracheque\nProventos 1.000,00\nDescontos 100,00\nTotal Líquido\n900,00\n';
    const r2 = comprovanteFromText(nextLine);
    expect(r2.ok && r2.reading.amountCents).toBe(90_000);
    // O texto corrido do PDF real separa rótulo e valor: sem as posições, o valor fica vazio para a pessoa digitar.
    const r3 = comprovanteFromText(TEXT);
    expect(r3.ok && r3.reading.amountCents).toBeNull();
  });

  it('mês de competência em vários formatos; data com dia e aniversário sem ano não contam', () => {
    expect(holeriteMonth('folha mensal setembro de 2026')).toBe('2026-09');
    expect(holeriteMonth('referencia: marco/2027')).toBe('2027-03');
    expect(holeriteMonth('competencia: 09/2026')).toBe('2026-09');
    expect(holeriteMonth('mes/ano 11/2026')).toBe('2026-11');
    expect(holeriteMonth('periodo set/2026')).toBe('2026-09');
    expect(holeriteMonth('admissao: 01/02/2020 aniversario no dia 15 de setembro')).toBeNull();
    expect(holeriteMonth('competencia: 13/2026')).toBeNull();
  });

  it('privacidade: nem nome, nem CPF ou CNPJ, nem banco, conta, cargo, salário base ou descontos saem da leitura', () => {
    const r = comprovanteFromText(TEXT, { items: ITEMS });
    const out = JSON.stringify(r);
    for (const secret of ['ALEX', 'EXEMPLO', '12.345.678', '0001-90', '12345-6', '1234', 'INSTRUTOR', 'PLANO', 'SAUDE', '3.100,00', '310000', '75433', '444,33']) {
      expect(out, secret).not.toContain(secret);
    }
  });

  it('no formulário: "Holerite", o dia fica para a pessoa (com o motivo), descrição com o mês e categoria Salário', () => {
    const r = comprovanteFromText(TEXT, { items: ITEMS });
    if (!r.ok) throw new Error('não leu');
    const draft = comprovanteDraft(r.reading, '2026-10-31');
    expect(comprovanteKindLabel('holerite', 'entrada')).toBe('Holerite');
    expect(comprovanteReadLine(draft)).toBe('Comprovante lido: Holerite · R$ 2.345,67');
    expect(comprovanteGaps(draft)).toEqual({ amount: null, day: COMPROVANTE_TEXT.holeriteDay, name: null, guessed: null });
    expect(suggestComprovanteDescription(draft, null, 'receita')).toEqual({
      description: 'Salário de setembro de 2026',
      category: 'Salário',
      source: 'mensagem',
      legend: 'Mês de competência lido do holerite',
      placeholder: COMPROVANTE_TEXT.placeholderIn,
    });
    // Lido em Anotar gasto: o holerite é recebimento, e a tela oferece a troca.
    expect(comprovanteMismatch(draft, 'despesa')).toEqual({
      text: 'Este comprovante é de um holerite. Ele entra como recebimento, não como gasto.',
      action: COMPROVANTE_TEXT.switchToIncome,
      other: 'receita',
    });
  });

  it('holerite sem valor achado: a leitura não falha, só pede o valor', () => {
    const r = comprovanteFromText('Holerite\nVencimentos\nDescontos\nLíquido\n', {});
    if (!r.ok) throw new Error('não leu');
    expect(r.reading.amountCents).toBeNull();
    expect(r.reading.message).toBe('Salário');
    expect(comprovanteGaps(comprovanteDraft(r.reading, '2026-10-31')).amount).toBe(COMPROVANTE_TEXT.missingAmount);
  });
});
