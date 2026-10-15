import { describe, expect, it } from 'vitest';
import { COMPROVANTE_LINES_MAX, COMPROVANTE_TEXT_MAX, comprovanteFromText, type ComprovanteReading, type ComprovanteResult } from '../src';
import { cleanMessage, cleanPersonName, cleanText, cutAtDocument, fold, scanDate, scanMoney, scanTime, toLines } from '../src/comprovante/texto';

/**
 * Leitor de comprovantes de Pix e de pagamento (D-051). Todos os textos abaixo são sintéticos, no formato típico dos
 * comprovantes de bancos brasileiros (rótulo e valor em linhas separadas, "rótulo: valor", seções "Destino" e "Origem", texto
 * sem quebra de linha), sem marca de banco e sem dado real: nomes, documentos, chaves e códigos são inventados.
 */

// Dados que NUNCA podem sair do leitor (todos fictícios).
const CPF = '529.982.247-25';
const CPF_MASKED = '***.982.247-**';
const CPF_OTHER_MASKED = '***.456.789-**';
const CNPJ = '11.222.333/0001-81';
const PIX_EMAIL = 'pessoa.exemplo@exemplo.com';
const PIX_PHONE = '+55 21 99999-0000';
const PIX_RANDOM = '123e4567-e89b-12d3-a456-426614174000';
const AGENCY = '4821';
const ACCOUNT = '98765-4';
const E2E = 'E00000000202610051432S00000000001';
const AUTH = '7F3A9C21B8D04E56A1F2C3D4E5B6A7C8';
const PROTOCOL = '2026100514320000123';

const SECRETS = [
  CPF, '52998224725', '982.247', CPF_MASKED, CPF_OTHER_MASKED, '456.789', CNPJ, '11222333', '0001-81', PIX_EMAIL, 'pessoa.exemplo', '@', PIX_PHONE, '99999-0000', '99999',
  PIX_RANDOM, '123e4567', AGENCY, ACCOUNT, '98765', E2E, 'E0000000020261005', 'S00000000001', AUTH, '7F3A9C21', PROTOCOL, '20261005143200',
];

/** O resultado inteiro, como texto: nada de dado sigiloso pode aparecer em lugar nenhum dele. */
function leaks(result: ComprovanteResult): string[] {
  const json = JSON.stringify(result);
  return SECRETS.filter((s) => json.includes(s));
}

function ok(text: string, defaultDirection?: 'saida' | 'entrada'): ComprovanteReading {
  const r = comprovanteFromText(text, defaultDirection ? { defaultDirection } : {});
  if (!r.ok) throw new Error(`esperava leitura, veio ${r.code}`);
  expect(leaks(r)).toEqual([]);
  return r.reading;
}

const join = (...lines: string[]) => lines.join('\n');

// Layout A: rótulo e valor em linhas separadas, título neutro, seções "Destino" e "Origem" (o dado de quem paga também vem).
const LAYOUT_SECTIONS = join(
  'Comprovante de transferência',
  '05 OUT 2026 - 14:32:10',
  'Valor',
  'R$ 85,00',
  'Tipo de transferência',
  'Pix',
  'Destino',
  'Nome',
  'MARIA SOUZA EXEMPLO',
  'CPF',
  CPF_MASKED,
  'Instituição',
  'Banco Exemplo S.A.',
  'Chave Pix',
  PIX_EMAIL,
  'Origem',
  'Nome',
  'FULANO DE TAL EXEMPLO',
  'CPF',
  CPF_OTHER_MASKED,
  'Instituição',
  'Banco Exemplo S.A.',
  'Agência',
  AGENCY,
  'Conta',
  ACCOUNT,
  'ID da transação',
  E2E,
  'Descrição',
  'Almoço de domingo',
);

// Layout B: "rótulo: valor" na mesma linha e título que diz que foi enviado.
const LAYOUT_INLINE_SENT = join(
  'Pix enviado',
  'Valor: R$ 1.250,50',
  'Data do pagamento: 05/10/2026 14:32',
  'Pago para: MARIA SOUZA EXEMPLO',
  `CPF/CNPJ: ${CPF}`,
  'Instituição: Banco Exemplo',
  `Chave Pix: ${PIX_PHONE}`,
  `ID da transação: ${E2E}`,
  `Código de autenticação: ${AUTH}`,
  'Mensagem: Aluguel 10/2026',
);

// Layout C: Pix recebido, valor solto no alto e "Recebido de".
const LAYOUT_RECEIVED = join(
  'Pix recebido',
  'R$ 320,00',
  'Recebido de',
  'FULANO DE TAL EXEMPLO LTDA',
  `CNPJ ${CNPJ}`,
  'Data e hora',
  '06/10/2026 09:05',
  `Chave Pix: ${PIX_RANDOM}`,
  `ID da transação: ${E2E}`,
);

// Layout D: boleto pago (valor do documento, juros e valor cobrado; vencimento diferente do pagamento).
const LAYOUT_BOLETO = join(
  'Comprovante de pagamento',
  'Pagamento de boleto',
  'Beneficiário',
  'EMPRESA EXEMPLO DE ENERGIA S.A.',
  `CNPJ do beneficiário ${CNPJ}`,
  'Pagador',
  'FULANO DE TAL EXEMPLO',
  `CPF do pagador ${CPF}`,
  'Linha digitável',
  '23793.38128 60000.000003 00000.000408 1 91230000010200',
  'Valor do documento',
  'R$ 100,00',
  'Juros',
  'R$ 2,00',
  'Multa',
  'R$ 0,00',
  'Valor cobrado',
  'R$ 102,00',
  'Data de vencimento',
  '01/10/2026',
  'Data do pagamento',
  '05/10/2026',
  `Autenticação: ${AUTH}`,
  `Protocolo: ${PROTOCOL}`,
);

// Layout E: TED.
const LAYOUT_TED = join(
  'Comprovante de TED',
  'TED enviada com sucesso',
  'Valor da transferência',
  'R$ 2.000,00',
  'Data da transferência',
  '05/10/2026',
  'Favorecido',
  'JOANA EXEMPLO DA SILVA',
  'CPF/CNPJ',
  CPF,
  'Banco',
  'Banco Exemplo',
  'Agência',
  AGENCY,
  'Conta',
  ACCOUNT,
);

// Layout F: compra no débito (comprovante de venda).
const LAYOUT_DEBIT = join(
  'COMPROVANTE DE VENDA',
  'Estabelecimento',
  'MERCADO EXEMPLO LTDA',
  `CNPJ ${CNPJ}`,
  'Compra no débito',
  'VALOR R$ 54,30',
  '05/10/2026 18:20',
  'Cartão final 4321',
  'Autorização 123456',
);

// Layout G: o PDF entrega o texto numa linha só, sem quebras.
const LAYOUT_FLAT = `Comprovante de Pix Pix enviado Valor R$ 85,00 Data 05/10/2026 Hora 14:32 Pago para MARIA SOUZA EXEMPLO CPF ${CPF_MASKED} Instituição Banco Exemplo Chave Pix ${PIX_EMAIL} ID da transação ${E2E} Mensagem Almoço de domingo`;

describe('leitor de comprovantes: o que lê', () => {
  it('layout com seções: o título neutro não diz a direção, então vale a da tela', () => {
    const sent = ok(LAYOUT_SECTIONS, 'saida');
    expect(sent).toEqual({
      kind: 'pix',
      direction: 'saida',
      directionGuessed: true,
      amountCents: 8500,
      occurredOn: '2026-10-05',
      time: '14:32',
      counterpart: 'Maria Souza Exemplo',
      message: 'Almoço de domingo',
    });
    const received = ok(LAYOUT_SECTIONS, 'entrada');
    expect(received.direction).toBe('entrada');
    expect(received.directionGuessed).toBe(true);
    expect(received.counterpart).toBe('Fulano de Tal Exemplo');
    expect(received.amountCents).toBe(8500);
  });

  it('sem padrão da tela e sem aviso no comprovante, a direção e o nome ficam em aberto (nunca o nome do lado errado)', () => {
    const r = ok(LAYOUT_SECTIONS);
    expect(r.direction).toBeNull();
    expect(r.directionGuessed).toBe(false);
    expect(r.counterpart).toBeNull();
    expect(r.amountCents).toBe(8500);
    expect(r.occurredOn).toBe('2026-10-05');
  });

  it('"rótulo: valor" na mesma linha, "Pix enviado" no título: a tela não manda', () => {
    for (const screen of ['saida', 'entrada', undefined] as const) {
      const r = ok(LAYOUT_INLINE_SENT, screen);
      expect(r).toEqual({
        kind: 'pix',
        direction: 'saida',
        directionGuessed: false,
        amountCents: 125050,
        occurredOn: '2026-10-05',
        time: '14:32',
        counterpart: 'Maria Souza Exemplo',
        message: 'Aluguel 10/2026',
      });
    }
  });

  it('Pix recebido: "Recebido de" é a outra ponta, o valor sem rótulo vale e o nome da empresa perde o documento', () => {
    const r = ok(LAYOUT_RECEIVED, 'saida');
    expect(r).toMatchObject({ kind: 'pix', direction: 'entrada', directionGuessed: false, amountCents: 32000, occurredOn: '2026-10-06', time: '09:05', counterpart: 'Fulano de Tal Exemplo Ltda', message: null });
  });

  it('boleto pago: vale o valor cobrado (não o do documento nem os juros), a data do pagamento (não a do vencimento) e o beneficiário', () => {
    const r = ok(LAYOUT_BOLETO);
    expect(r).toMatchObject({ kind: 'boleto', direction: 'saida', directionGuessed: false, amountCents: 10200, occurredOn: '2026-10-05', counterpart: 'Empresa Exemplo de Energia S.A.' });
  });

  it('TED enviada: favorecido, valor da transferência e data', () => {
    const r = ok(LAYOUT_TED, 'entrada');
    expect(r).toMatchObject({ kind: 'ted', direction: 'saida', amountCents: 200000, occurredOn: '2026-10-05', counterpart: 'Joana Exemplo da Silva' });
  });

  it('débito: o estabelecimento é a outra ponta, a data e a hora vêm do texto solto, e o final do cartão não sai', () => {
    const r = ok(LAYOUT_DEBIT);
    expect(r).toMatchObject({ kind: 'debito', direction: 'saida', amountCents: 5430, occurredOn: '2026-10-05', time: '18:20', counterpart: 'Mercado Exemplo Ltda' });
    expect(JSON.stringify(r)).not.toContain('4321');
    expect(JSON.stringify(r)).not.toContain('123456');
  });

  it('texto sem quebra de linha (rótulos no meio da linha)', () => {
    const r = ok(LAYOUT_FLAT);
    expect(r).toEqual({
      kind: 'pix',
      direction: 'saida',
      directionGuessed: false,
      amountCents: 8500,
      occurredOn: '2026-10-05',
      time: '14:32',
      counterpart: 'Maria Souza Exemplo',
      message: 'Almoço de domingo',
    });
  });

  it('texto sem quebra com as seções "Destino" e "Origem": o "Nome" fica com a seção certa', () => {
    const flat = `Comprovante de transferência 05 OUT 2026 - 14:32:10 Valor R$ 85,00 Tipo de transferência Pix Destino Nome MARIA SOUZA EXEMPLO CPF ${CPF_MASKED} Instituição Banco Exemplo S.A. Chave Pix ${PIX_EMAIL} Origem Nome FULANO DE TAL EXEMPLO CPF ${CPF_OTHER_MASKED} Agência ${AGENCY} Conta ${ACCOUNT} ID da transação ${E2E}`;
    expect(ok(flat, 'saida')).toMatchObject({ kind: 'pix', direction: 'saida', directionGuessed: true, amountCents: 8500, occurredOn: '2026-10-05', time: '14:32', counterpart: 'Maria Souza Exemplo' });
    expect(ok(flat, 'entrada').counterpart).toBe('Fulano de Tal Exemplo');
  });

  it('outros jeitos de escrever: "dados de quem pagou", "Valor transferido", "Transferência realizada" e data com mês abreviado', () => {
    const orange = join(
      'Comprovante de Pix', 'valor', 'R$ 85,00', 'para', 'MARIA SOUZA EXEMPLO', 'CPF/CNPJ', CPF_MASKED, 'instituição', 'Banco Exemplo', 'chave', PIX_EMAIL,
      'data da transferência', '05 out 2026', 'dados de quem pagou', 'nome', 'FULANO DE TAL EXEMPLO', 'CPF/CNPJ', CPF_OTHER_MASKED, 'ID da transação', E2E,
    );
    expect(ok(orange, 'saida')).toMatchObject({ kind: 'pix', direction: 'saida', directionGuessed: true, amountCents: 8500, occurredOn: '2026-10-05', counterpart: 'Maria Souza Exemplo' });
    expect(ok(orange, 'entrada').counterpart).toBe('Fulano de Tal Exemplo');
    const transfer = join('Comprovante de transferência', 'Transferência realizada com sucesso', 'Valor transferido: R$ 85,00', 'Data: 05/10/2026 Hora: 14:32', 'Favorecido: MARIA SOUZA EXEMPLO', `CPF: ${CPF}`);
    expect(ok(transfer)).toMatchObject({ kind: 'outro', direction: 'saida', directionGuessed: false, amountCents: 8500, occurredOn: '2026-10-05', time: '14:32', counterpart: 'Maria Souza Exemplo' });
  });

  it('rótulos com outras caixas e sem acento', () => {
    const r = ok(join('PIX ENVIADO', 'VALOR', 'R$ 12,34', 'DATA DA TRANSFERENCIA', '07/10/2026', 'PAGO PARA', 'ANA EXEMPLO', 'INSTITUICAO', 'Banco Exemplo'));
    expect(r).toMatchObject({ kind: 'pix', direction: 'saida', amountCents: 1234, occurredOn: '2026-10-07', counterpart: 'Ana Exemplo' });
  });

  it('"Quem recebeu" e "Quem pagou" (seções) e "Para" e "De" sozinhos na linha', () => {
    const a = ok(join('Pix enviado', 'Valor R$ 40,00', 'Data 05/10/2026', 'Quem pagou', 'Nome', 'FULANO DE TAL EXEMPLO', 'Quem recebeu', 'Nome', 'BEATRIZ EXEMPLO'));
    expect(a).toMatchObject({ direction: 'saida', counterpart: 'Beatriz Exemplo' });
    const b = ok(join('Pix recebido', 'Valor R$ 40,00', 'Data 05/10/2026', 'Quem pagou', 'Nome', 'CARLOS EXEMPLO', 'Quem recebeu', 'Nome', 'FULANO DE TAL EXEMPLO'));
    expect(b).toMatchObject({ direction: 'entrada', counterpart: 'Carlos Exemplo' });
    const c = ok(join('Comprovante de Pix', 'valor', 'R$ 40,00', 'para', 'DANIELA EXEMPLO', 'data da transferência', '05/10/2026'));
    expect(c).toMatchObject({ kind: 'pix', direction: 'saida', directionGuessed: false, counterpart: 'Daniela Exemplo' });
    const d = ok(join('Comprovante de Pix', 'valor', 'R$ 40,00', 'de', 'EDUARDO EXEMPLO', 'data da transferência', '05/10/2026'));
    expect(d).toMatchObject({ kind: 'pix', direction: 'entrada', directionGuessed: false, counterpart: 'Eduardo Exemplo' });
  });

  it('"Pix enviado para Maria" e "Pix recebido de Maria" no texto solto', () => {
    expect(ok(join('Pix enviado para Maria Souza Exemplo', 'Valor R$ 9,90', 'Data 05/10/2026'))).toMatchObject({ direction: 'saida', counterpart: 'Maria Souza Exemplo' });
    expect(ok(join('Pix recebido de Pedro Exemplo', 'Valor R$ 9,90', 'Data 05/10/2026'))).toMatchObject({ direction: 'entrada', counterpart: 'Pedro Exemplo' });
  });

  it('"Você pagou" e "Você recebeu"', () => {
    expect(ok(join('Você pagou R$ 18,00', 'Pix', '05/10/2026 08:00'))).toMatchObject({ kind: 'pix', direction: 'saida', amountCents: 1800, occurredOn: '2026-10-05', time: '08:00' });
    expect(ok(join('Você recebeu R$ 18,00', 'Pix', '05/10/2026 08:00'))).toMatchObject({ kind: 'pix', direction: 'entrada', amountCents: 1800 });
  });

  it('formatos de data: dd/mm/aa, dd-mm-aaaa, aaaa-mm-dd com hora, "5 de outubro de 2026", "05/OUT/2026"', () => {
    const day = (line: string) => ok(join('Pix enviado', 'Valor R$ 5,00', line, 'Pago para', 'ANA EXEMPLO')).occurredOn;
    expect(day('Data 05/10/26')).toBe('2026-10-05');
    expect(day('Data 05-10-2026')).toBe('2026-10-05');
    expect(day('Data 2026-10-05T14:32:10-03:00')).toBe('2026-10-05');
    expect(day('Data 5 de outubro de 2026')).toBe('2026-10-05');
    expect(day('Data 05/OUT/2026')).toBe('2026-10-05');
    expect(day('Data 31/02/2026')).toBeNull();
    expect(ok(join('Pix enviado', 'Valor R$ 5,00', 'Data 2026-10-05T14:32:10-03:00', 'Pago para', 'ANA EXEMPLO')).time).toBe('14:32');
    expect(ok(join('Pix enviado', 'Valor R$ 5,00', 'Data 05/10/2026', 'Hora 9h05', 'Pago para', 'ANA EXEMPLO')).time).toBe('09:05');
    expect(ok(join('Pix enviado', 'Valor R$ 5,00', 'Data e hora 14:32 05/10/2026', 'Pago para', 'ANA EXEMPLO')).time).toBe('14:32');
  });

  it('valor: "R$85,00", milhar, sem "R$" depois do rótulo, centavos soltos, e nunca agência, hora ou parte de um código', () => {
    const amount = (line: string) => ok(join('Pix enviado', line, 'Data 05/10/2026', 'Pago para', 'ANA EXEMPLO')).amountCents;
    expect(amount('Valor R$85,00')).toBe(8500);
    expect(amount('Valor: R$ 12.345,67')).toBe(1234567);
    expect(amount('Valor 85,00')).toBe(8500);
    expect(amount('Valor R$ 85')).toBe(8500);
    expect(amount('Valor 85')).toBeNull();
    expect(amount('Valor 14:32')).toBeNull();
    expect(amount('Valor R$ 0,00')).toBeNull();
    expect(amount('Valor R$ 99.999.999,00')).toBeNull();
    expect(amount('Valor E1823612020261005,99')).toBeNull();
  });

  it('duas quantias soltas diferentes (sem rótulo de valor): não chuta; a do saldo e a da tarifa nunca valem', () => {
    const r = ok(join('Pix enviado', 'R$ 85,00', 'R$ 90,00', 'Data 05/10/2026', 'Pago para', 'ANA EXEMPLO'));
    expect(r.amountCents).toBeNull();
    const withBalance = ok(join('Pix enviado', 'R$ 85,00', 'Saldo após a transferência R$ 1.000,00', 'Data 05/10/2026', 'Pago para', 'ANA EXEMPLO'));
    expect(withBalance.amountCents).toBe(8500);
    const withFee = ok(join('Pix enviado', 'Valor', 'R$ 85,00', 'Tarifa', 'R$ 0,00', 'Data 05/10/2026', 'Pago para', 'ANA EXEMPLO'));
    expect(withFee.amountCents).toBe(8500);
  });

  it('sem valor: a leitura vale e o valor fica em branco', () => {
    const r = ok(join('Pix enviado', 'Data da transferência', '05/10/2026', 'Pago para', 'MARIA SOUZA EXEMPLO', 'Instituição', 'Banco Exemplo'));
    expect(r).toMatchObject({ amountCents: null, occurredOn: '2026-10-05', counterpart: 'Maria Souza Exemplo', direction: 'saida' });
  });

  it('sem data: a leitura vale e a data fica em branco (a de vencimento nunca vale)', () => {
    const r = ok(join('Pix enviado', 'Valor', 'R$ 85,00', 'Pago para', 'MARIA SOUZA EXEMPLO'));
    expect(r).toMatchObject({ amountCents: 8500, occurredOn: null, time: null, counterpart: 'Maria Souza Exemplo' });
    const venc = ok(join('Comprovante de pagamento', 'Pagamento de boleto', 'Valor cobrado', 'R$ 102,00', 'Data de vencimento', '01/10/2026', 'Beneficiário', 'EMPRESA EXEMPLO LTDA'));
    expect(venc.occurredOn).toBeNull();
    const emitted = ok(join('Pix enviado', 'Valor R$ 5,00', 'Comprovante emitido em 09/10/2026', 'Pago para', 'ANA EXEMPLO'));
    expect(emitted.occurredOn).toBeNull();
  });

  it('só nome e tipo, sem valor nem data: ainda é um comprovante', () => {
    const r = ok(join('Comprovante de Pix', 'Pix enviado', 'Pago para', 'MARIA SOUZA EXEMPLO'));
    expect(r).toMatchObject({ amountCents: null, occurredOn: null, counterpart: 'Maria Souza Exemplo' });
  });

  it('a mensagem de texto padrão não vira mensagem; mensagem com número longo, e-mail ou endereço some', () => {
    const msg = (m: string) => ok(join('Pix enviado', 'Valor R$ 5,00', 'Data 05/10/2026', 'Pago para', 'ANA EXEMPLO', 'Mensagem', m)).message;
    expect(msg('Almoço de sábado')).toBe('Almoço de sábado');
    expect(msg('Pix')).toBeNull();
    expect(msg('Não informado')).toBeNull();
    expect(msg(`Meu CPF ${CPF}`)).toBeNull();
    expect(msg('chave 21999990000 pode pagar')).toBeNull();
    expect(msg('manda para joao@exemplo.com')).toBeNull();
    expect(msg('veja https://exemplo.com/abc')).toBeNull();
    expect(msg(E2E)).toBeNull();
    expect(msg('Parcela 10/2026')).toBe('Parcela 10/2026');
  });
});

describe('leitor de comprovantes: o que não é comprovante', () => {
  it('texto vazio ou quase (PDF que é foto)', () => {
    for (const raw of ['', '   \n  ', 'Página 1', ' ​', 'a'.repeat(5)]) expect(comprovanteFromText(raw)).toEqual({ ok: false, code: 'texto_vazio' });
    expect(comprovanteFromText(undefined as unknown as string)).toEqual({ ok: false, code: 'texto_vazio' });
  });

  it('DANFE e outros textos de nota fiscal viram "nota_fiscal"', () => {
    const danfe = join('DANFE', 'Documento Auxiliar da Nota Fiscal Eletrônica', 'CHAVE DE ACESSO', '3326 1011 2223 3300 0181 5500 1000 0043 2118 7654 3216', 'VALOR TOTAL DA NOTA', '150,00');
    expect(comprovanteFromText(danfe)).toEqual({ ok: false, code: 'nota_fiscal' });
  });

  it('pedido de compra, fatura e texto qualquer com "valor total" não são comprovante', () => {
    expect(comprovanteFromText(join('PEDIDO DE COMPRA', 'Obrigado pela compra', 'Valor total 150,00', 'Entrega em até 5 dias úteis'))).toEqual({ ok: false, code: 'nao_e_comprovante' });
    expect(comprovanteFromText(join('Fatura do mês de outubro', 'Valor total R$ 150,00', 'Data 05/10/2026', 'Vencimento 10/10/2026'))).toEqual({ ok: false, code: 'nao_e_comprovante' });
    expect(comprovanteFromText('Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore'.repeat(3))).toEqual({
      ok: false,
      code: 'nao_e_comprovante',
    });
  });

  it('só o título "Comprovante de Pix", sem nada para preencher, não vale', () => {
    expect(comprovanteFromText(join('Comprovante de Pix', 'Obrigado por usar nossos serviços', 'Atendimento 24 horas por dia'))).toEqual({ ok: false, code: 'nao_e_comprovante' });
  });
});

describe('leitor de comprovantes: privacidade', () => {
  const SECRET_LINES = [
    `CPF: ${CPF}`, `CPF ${CPF_MASKED}`, `CNPJ: ${CNPJ}`, `CPF/CNPJ ${CPF}`, `Chave Pix: ${PIX_EMAIL}`, `Chave Pix: ${PIX_PHONE}`, `Chave Pix: ${PIX_RANDOM}`,
    `Chave: ${CPF}`, `Agência: ${AGENCY}`, `Conta: ${ACCOUNT}`, `Conta corrente ${ACCOUNT}`, `ID da transação: ${E2E}`, `End to end ${E2E}`, `E2E: ${E2E}`,
    `Código de autenticação: ${AUTH}`, `Autenticação ${AUTH}`, `Protocolo: ${PROTOCOL}`, `Instituição: Banco Exemplo`, `Banco: Banco Exemplo`,
    `Número do documento ${PROTOCOL}`,
  ];

  it('nenhum documento, chave, agência, conta, ID ou código sai, onde quer que esteja no comprovante', () => {
    for (const line of SECRET_LINES) {
      for (const at of [0, 2, 4, 6]) {
        const lines = ['Pix enviado', 'Valor R$ 85,00', 'Data 05/10/2026', 'Pago para', 'MARIA SOUZA EXEMPLO'];
        lines.splice(at, 0, line);
        for (const screen of ['saida', 'entrada', undefined] as const) {
          const result = comprovanteFromText(lines.join('\n'), screen ? { defaultDirection: screen } : {});
          expect(result.ok, line).toBe(true);
          expect(leaks(result), `${line} (posição ${at})`).toEqual([]);
        }
      }
    }
  });

  it('o documento colado no nome ou na mensagem é cortado, e só o nome fica', () => {
    const cases: [string, string | null][] = [
      [`MARIA SOUZA EXEMPLO ${CPF}`, 'Maria Souza Exemplo'],
      [`MARIA SOUZA EXEMPLO CPF ${CPF_MASKED}`, 'Maria Souza Exemplo'],
      [`MARIA SOUZA EXEMPLO - CPF: ${CPF}`, 'Maria Souza Exemplo'],
      [`EMPRESA EXEMPLO LTDA ${CNPJ}`, 'Empresa Exemplo Ltda'],
      [`EMPRESA EXEMPLO LTDA CNPJ ${CNPJ}`, 'Empresa Exemplo Ltda'],
      [`Maria Souza ${PIX_PHONE}`, 'Maria Souza'],
      [PIX_EMAIL, null],
      [PIX_PHONE, null],
      [CPF, null],
      [CPF_MASKED, null],
      [CNPJ, null],
      [PIX_RANDOM, null],
      [E2E, null],
      [AUTH, null],
      ['***', null],
      ['M*** S****', null],
      ['Nome', null],
      ['Não informado', null],
      ['', null],
      ['A', null],
    ];
    for (const [raw, expected] of cases) expect(cleanPersonName(raw), raw).toBe(expected);
    expect(cleanPersonName('LOJA 24 HORAS LTDA')).toBe('Loja 24 Horas Ltda');
    expect(cleanPersonName("João d'Ávila")).toBe("João d'Ávila");
  });

  it('o resultado só tem os campos previstos', () => {
    const r = ok(LAYOUT_SECTIONS, 'saida');
    expect(Object.keys(r).sort()).toEqual(['amountCents', 'counterpart', 'direction', 'directionGuessed', 'kind', 'message', 'occurredOn', 'time']);
    for (const text of [r.counterpart, r.message]) expect(text ?? '').not.toMatch(/\d{4}|@|\*|cpf|cnpj/i);
  });

  it('o erro nunca devolve o texto', () => {
    const r = comprovanteFromText(`Lorem ipsum ${CPF} ${PIX_EMAIL} ${E2E} dolor sit amet consectetur adipiscing elit sed do eiusmod`);
    expect(r).toEqual({ ok: false, code: 'nao_e_comprovante' });
  });
});

describe('leitor de comprovantes: entrada hostil, em tempo linear', () => {
  const run = (text: string) => {
    const t0 = performance.now();
    const r = comprovanteFromText(text, { defaultDirection: 'saida' });
    return { r, ms: performance.now() - t0 };
  };
  const best = (text: string, times = 3) => Math.min(...Array.from({ length: times }, () => run(text).ms));

  const hostile: Record<string, string> = {
    'um milhão de letras': 'a'.repeat(1_000_000),
    'um milhão de dígitos': '1'.repeat(1_000_000),
    'espaços e um rótulo': `${' '.repeat(500_000)}Valor${' '.repeat(500_000)}`,
    'rótulo "Valor" repetido': 'Valor '.repeat(200_000),
    '"R$ " repetido': 'R$ '.repeat(300_000),
    'milhar sem fim': '1.'.repeat(500_000),
    'milhar com vírgula': '1.234.567.890.123.456.789,'.repeat(40_000),
    'datas coladas': '01/01/01/01/'.repeat(100_000),
    'dia e mês sem fim': '5 de de de de '.repeat(80_000),
    'linhas de rótulo': 'Nome\n'.repeat(200_000),
    'linhas de rótulo e valor': 'Destino\nNome\nA\n'.repeat(60_000),
    'todos os rótulos juntos': 'para de data valor origem destino nome cpf chave mensagem '.repeat(20_000),
    'asteriscos e documento': '***.***.***-**'.repeat(60_000),
    'uma linha sem fim com rótulos': `Pix enviado Valor R$ 1,00 ${'Pago para Maria '.repeat(50_000)}`,
    'hora sem fim': '12:'.repeat(300_000),
    'palavra de texto sem espaço': `Mensagem ${'x'.repeat(900_000)}`,
    'caracteres de controle': '\u0000\u0001​ \r\n\r\n'.repeat(100_000),
    'pares substitutos': '😀'.repeat(300_000),
    'tipos misturados': 'Pix enviado\nValor R$ 85,00\nData 05/10/2026\nPago para\nMaria\n'.repeat(30_000),
  };

  for (const [name, text] of Object.entries(hostile)) {
    it(`${name}: termina rápido e devolve um resultado`, () => {
      const { r, ms } = run(text);
      expect(typeof r.ok).toBe('boolean');
      expect(ms).toBeLessThan(1500);
    });
  }

  it('o tempo cresce de forma linear (4 vezes o texto, bem menos de 16 vezes o tempo), em formas diferentes de entrada', () => {
    const shapes: Record<string, (n: number) => string> = {
      palavras: (n) => 'para de data valor origem destino nome '.repeat(Math.ceil(n / 40)).slice(0, n),
      digitos: (n) => '1'.repeat(n),
      milhar: (n) => '1.234'.repeat(Math.ceil(n / 5)).slice(0, n),
      linhas: (n) => 'Destino\nNome\nMaria\n'.repeat(Math.ceil(n / 19)).slice(0, n),
      datas: (n) => '05/10/2026 14:32 '.repeat(Math.ceil(n / 17)).slice(0, n),
    };
    for (const [name, make] of Object.entries(shapes)) {
      const small = best(make(20_000), 5);
      const big = best(make(80_000), 5);
      // Piso de 2 ms para o tempo pequeno não virar divisão por quase zero.
      expect(big, `${name}: ${small.toFixed(1)} ms para ${big.toFixed(1)} ms`).toBeLessThan(Math.max(small, 2) * 16);
    }
  });

  it('o texto lido e o número de linhas têm teto', () => {
    expect(cleanText('x'.repeat(COMPROVANTE_TEXT_MAX + 5000)).length).toBe(COMPROVANTE_TEXT_MAX);
    expect(toLines('a\n'.repeat(COMPROVANTE_LINES_MAX + 500)).length).toBe(COMPROVANTE_LINES_MAX);
    // O que passa do teto do texto é ignorado: um comprovante com mais de 100 mil caracteres antes do valor não o acha.
    const padded = `${'Observação sem importância. '.repeat(5000)}\nPix enviado\nValor R$ 85,00\nData 05/10/2026\nPago para\nANA EXEMPLO`;
    expect(padded.length).toBeGreaterThan(COMPROVANTE_TEXT_MAX);
    expect(comprovanteFromText(padded).ok).toBe(false);
  });
});

describe('leitor de comprovantes: ferramentas de texto', () => {
  it('fold mantém o tamanho e as posições', () => {
    const s = 'AÇÃO É Útil ÑANDÚ Ørsted 😀 çãõ';
    expect(fold(s)).toHaveLength(s.length);
    expect(fold('AÇÃO ÉÚ')).toBe('acao eu');
  });

  it('scanMoney, scanDate e scanTime', () => {
    expect(scanMoney('Valor R$ 1.234,56 ok')).toEqual({ cents: 123456, end: 17 });
    expect(scanMoney('85,00')?.cents).toBe(8500);
    expect(scanMoney('5F3A 85,00')?.cents).toBe(8500);
    expect(scanMoney('E1823612,99')).toBeNull();
    expect(scanMoney('123.456.789-09')).toBeNull();
    expect(scanMoney('05/10/2026 14:32')).toBeNull();
    // O limite vale para onde o valor começa; o valor que começa antes dele é lido inteiro.
    expect(scanMoney('R$ 85,00', 0, 3)).toBeNull();
    expect(scanMoney('R$ 85,00', 0, 4)?.cents).toBe(8500);
    expect(scanDate('pago em 05/10/2026 as 14:32')?.iso).toBe('2026-10-05');
    expect(scanDate('29/02/2028')?.iso).toBe('2028-02-29');
    expect(scanDate('29/02/2026')).toBeNull();
    expect(scanDate('13/13/2026')).toBeNull();
    expect(scanDate('105/10/2026')).toBeNull();
    expect(scanDate('1/2/2026')?.iso).toBe('2026-02-01');
    expect(scanDate('1 2 2026')).toBeNull();
    expect(scanDate('15 de marco de 2026')?.iso).toBe('2026-03-15');
    expect(scanDate('15 mar. 2026')?.iso).toBe('2026-03-15');
    expect(scanDate('15 xyz 2026')).toBeNull();
    expect(scanTime('as 9:05')).toBe('09:05');
    expect(scanTime('24:00')).toBeNull();
    expect(scanTime('12:60')).toBeNull();
    expect(scanTime('14:32:10')).toBe('14:32');
    expect(scanTime('14h32')).toBe('14:32');
    expect(scanTime('114:32')).toBeNull();
  });

  it('cutAtDocument e cleanMessage', () => {
    expect(cutAtDocument('Maria 123.456.789-09')).toBe('Maria ');
    expect(cutAtDocument('Loja 24 Horas')).toBe('Loja 24 Horas');
    expect(cutAtDocument('Aluguel 10/2026', 8)).toBe('Aluguel 10/2026');
    expect(cleanMessage('Aluguel 10/2026')).toBe('Aluguel 10/2026');
    expect(cleanMessage('x'.repeat(30))).toBeNull();
    expect(cleanMessage(`${'Palavra '.repeat(30)}fim`)?.length).toBeLessThanOrEqual(80);
  });
});
