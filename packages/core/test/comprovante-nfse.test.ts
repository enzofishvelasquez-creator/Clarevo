import { describe, expect, it } from 'vitest';
import {
  COMPROVANTE_TEXT,
  NOTA_TEXT,
  comprovanteDraft,
  comprovanteFromText,
  comprovanteGaps,
  comprovanteKindLabel,
  comprovanteKindPhrase,
  comprovanteMismatch,
  comprovanteReadLine,
  looksLikeNfse,
  serviceNoteInText,
  suggestComprovanteDescription,
  type ComprovanteReading,
  type PdfTextItem,
} from '../src';

/**
 * Nota fiscal de serviço (NFS-e, D-079). Tudo fictício: nomes "Exemplo", CNPJ e chave inventados. O primeiro texto segue a ordem em
 * que o PDF.js entrega o DANFSe do padrão nacional (o rodapé com número e chave vem primeiro; cada rótulo numa linha e o valor na de
 * baixo), com as mesmas armadilhas do original: "Valor Líquido da NFS-e + IBS/CBS" zerado, a data da DPS e a competência.
 */
const SECRETS = ['12.345.678/0001-90', '11.222.333/0001-81', '12.345.678 ', 'RUA DOS EXEMPLOS', 'AVENIDA MODELO', '(21) 90000-0000', 'alex@exemplo.com', '3304557225', '20.000-000', 'Propaganda'];
const KEY = '33045572251234567800019000000000003526100001234567';

const NACIONAL = [
  'DATA CIENTIFICAÇÃO:   IDENTIFICAÇÃO E ASSINATURA   N° NFS-e / CHAVE NFS-e',
  `35 / ${KEY}`,
  'DANFSe v2.0',
  'Documento Auxiliar da NFS-e',
  'Município: Rio de Janeiro - RJ',
  'CHAVE DE ACESSO DA NFS-e',
  KEY,
  'A autenticidade desta NFS-e pode ser verificada',
  'chave de acesso no portal nacional da NFS-e',
  'NÚMERO DA NFS-e',
  '35',
  'COMPETÊNCIA DA NFS-e',
  '01/10/2026',
  'DATA E HORA DA EMISSÃO DA NFS-e',
  '05/10/2026 16:49:04',
  'NÚMERO DA DPS',
  '15',
  'DATA E HORA DA EMISSÃO DA DPS',
  '04/10/2026 10:00:00',
  'EMITENTE DA NFS-e',
  'Prestador',
  'SITUAÇÃO DA NFS-e',
  'NFS-e MEI',
  'PRESTADOR / FORNECEDOR   CNPJ / CPF / NIF',
  '12.345.678/0001-90',
  'Telefone',
  '(21) 90000-0000',
  'Nome / Nome Empresarial',
  '12.345.678 ALEX EXEMPLO DA SILVA',
  'Município / Sigla UF',
  'Rio de Janeiro / RJ',
  'Código IBGE / CEP',
  '33.04557 / 20.000-000',
  'Endereço',
  'RUA DOS EXEMPLOS, 10, CENTRO',
  'E-mail',
  'alex@exemplo.com',
  'TOMADOR / ADQUIRENTE   CNPJ / CPF / NIF',
  '11.222.333/0001-81',
  'Nome / Nome Empresarial',
  'EMPRESA EXEMPLO DE TECNOLOGIA LTDA',
  'Município / Sigla UF',
  'Caxias do Sul / RS',
  'Endereço',
  'AVENIDA MODELO, 20, BAIRRO EXEMPLO',
  'DESTINATÁRIO DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e',
  'SERVIÇO PRESTADO   Código de Tributação Nacional/Municipal',
  'Propaganda e publicidade, inclusive promoção de vendas',
  'Descrição do Serviço',
  'Serviço prestado de acordo com o previsto em contrato.',
  'Exclusões e Reduções da Base de Cálculo',
  'R$ 0,00',
  'VALOR TOTAL DA NFS-e   VALOR DA OPERAÇÃO / SERVIÇO',
  'R$ 4.500,00',
  'Total das Retenções (ISSQN / Federais)',
  'R$ 300,00',
  'VALOR LÍQUIDO DA NFS-e',
  'R$ 4.200,00',
  'Total do IBS/CBS',
  'R$ 0,00',
  'VALOR LÍQUIDO DA NFS-e + IBS/CBS',
  'R$ 0,00',
].join('\n');

/** O mesmo DANFSe com as posições (como o app entrega do PDF): rótulos em colunas e o valor 8 pontos abaixo. */
const ITEMS: PdfTextItem[] = [
  { str: 'NÚMERO DA NFS-e', x: 12, y: 780, width: 60, page: 1 },
  { str: '35', x: 12, y: 772, width: 8, page: 1 },
  { str: 'COMPETÊNCIA DA NFS-e', x: 156, y: 780, width: 80, page: 1 },
  { str: '01/10/2026', x: 156, y: 772, width: 36, page: 1 },
  { str: 'DATA E HORA DA EMISSÃO DA NFS-e', x: 301, y: 780, width: 129, page: 1 },
  { str: '05/10/2026 16:49:04', x: 301, y: 772, width: 66, page: 1 },
  { str: 'DATA E HORA DA EMISSÃO DA DPS', x: 301, y: 760, width: 123, page: 1 },
  { str: '04/10/2026 10:00:00', x: 301, y: 752, width: 66, page: 1 },
  { str: 'VALOR TOTAL DA NFS-e', x: 12, y: 353, width: 84, page: 1 },
  { str: 'VALOR DA OPERAÇÃO / SERVIÇO', x: 156, y: 354, width: 100, page: 1 },
  { str: 'R$ 4.500,00', x: 156, y: 347, width: 38, page: 1 },
  { str: 'Total das Retenções (ISSQN / Federais)', x: 12, y: 335, width: 110, page: 1 },
  { str: 'R$ 300,00', x: 12, y: 327, width: 30, page: 1 },
  { str: 'VALOR LÍQUIDO DA NFS-e', x: 156, y: 335, width: 77, page: 1 },
  { str: 'R$ 4.200,00', x: 156, y: 327, width: 38, page: 1 },
  { str: 'Total do IBS/CBS', x: 301, y: 335, width: 50, page: 1 },
  { str: 'R$ 0,00', x: 301, y: 327, width: 24, page: 1 },
  { str: 'VALOR LÍQUIDO DA NFS-e + IBS/CBS', x: 446, y: 335, width: 108, page: 1 },
  { str: 'R$ 0,00', x: 446, y: 327, width: 24, page: 1 },
];

/** Nota de prefeitura, com rótulo e valor na mesma linha. */
const PREFEITURA = [
  'PREFEITURA MUNICIPAL DE EXEMPLO',
  'NOTA FISCAL ELETRÔNICA DE SERVIÇOS - NFS-e',
  'Número da Nota: 00000123',
  'Data e Hora de Emissão: 03/10/2026 10:15:00',
  'Código de Verificação: AB12CD34',
  'PRESTADOR DE SERVIÇOS',
  'CPF/CNPJ: 12.345.678/0001-90 Inscrição Municipal: 1234567',
  'Nome/Razão Social: ESTÚDIO EXEMPLO DE DESIGN LTDA',
  'Endereço: RUA DOS EXEMPLOS, 10',
  'TOMADOR DE SERVIÇOS',
  'Nome/Razão Social: COMÉRCIO MODELO S.A.',
  'CPF/CNPJ: 11.222.333/0001-81',
  'Endereço: AVENIDA MODELO, 20',
  'DISCRIMINAÇÃO DOS SERVIÇOS',
  'Criação de identidade visual',
  'VALOR TOTAL DO SERVIÇO = R$ 1.500,00',
  'Valor Líquido: R$ 1.410,00',
].join('\n');

/** Uma foto da nota nacional lida linha a linha: os rótulos de várias colunas numa linha e os valores na seguinte. */
const FOTO = [
  'DANFSe v2.0 Documento Auxiliar da NFS-e',
  'NÚMERO DA NFS-e COMPETÊNCIA DA NFS-e DATA E HORA DA EMISSÃO DA NFS-e',
  '35 01/10/2026 05/10/2026 16:49:04',
  'PRESTADOR / FORNECEDOR CNPJ / CPF / NIF Telefone',
  'TOMADOR / ADQUIRENTE CNPJ / CPF / NIF',
  'VALOR TOTAL DA NFS-e VALOR DA OPERAÇÃO / SERVIÇO Desconto Incondicionado',
  'R$ 4.500,00 - -',
  'Total das Retenções (ISSQN / Federais) VALOR LÍQUIDO DA NFS-e Total do IBS/CBS',
  'R$ 300,00 R$ 4.200,00 R$ 0,00',
].join('\n');

function read(text: string, direction: 'entrada' | 'saida' = 'entrada', items?: PdfTextItem[]): ComprovanteReading {
  const r = comprovanteFromText(text, { defaultDirection: direction, items });
  if (!r.ok) throw new Error(r.code);
  return r.reading;
}

describe('nota de serviço (NFS-e): leitura', () => {
  it('reconhece a nota de serviço pela marca da NFS-e e pelas duas pontas', () => {
    expect(looksLikeNfse('danfse v2.0 documento auxiliar da nfs-e prestador tomador')).toBe(true);
    expect(looksLikeNfse('nota fiscal eletronica de servicos prestador de servicos tomador de servicos')).toBe(true);
    // Sem as duas pontas, não é nota de serviço.
    expect(looksLikeNfse('nfs-e emitida')).toBe(false);
    expect(serviceNoteInText(NACIONAL)).toBe(true);
    expect(serviceNoteInText('DANFE Documento Auxiliar da Nota Fiscal Eletrônica')).toBe(false);
  });

  it('DANFSe nacional em Registrar recebimento: o líquido (não o zerado com IBS/CBS), a data de emissão (não a da DPS), o número e o nome de quem contratou', () => {
    const r = read(NACIONAL, 'entrada');
    expect(r).toEqual({
      kind: 'nota_servico',
      direction: 'entrada',
      directionGuessed: false,
      amountCents: 420_000,
      occurredOn: '2026-10-05',
      time: null,
      counterpart: 'Empresa Exemplo de Tecnologia Ltda',
      message: null,
      serviceNote: { number: '35', provider: 'Alex Exemplo da Silva', client: 'Empresa Exemplo de Tecnologia Ltda' },
    });
  });

  it('com as posições do PDF, lê os mesmos valores pelas colunas', () => {
    const r = read(NACIONAL, 'entrada', ITEMS);
    expect([r.amountCents, r.occurredOn, r.serviceNote?.number]).toEqual([420_000, '2026-10-05', '35']);
    // Só as posições (sem as linhas do texto que trazem os rótulos e valores): continua certo.
    const onlyItems = read('Documento Auxiliar da NFS-e\nPRESTADOR\nTOMADOR', 'entrada', ITEMS);
    expect([onlyItems.amountCents, onlyItems.occurredOn, onlyItems.serviceNote?.number]).toEqual([420_000, '2026-10-05', '35']);
  });

  it('em Anotar gasto, o nome é o de quem prestou o serviço (sem a raiz do CNPJ do MEI)', () => {
    expect(read(NACIONAL, 'saida').counterpart).toBe('Alex Exemplo da Silva');
  });

  it('nota de prefeitura: rótulos com dois pontos, número sem zeros na frente, o líquido antes do valor do serviço', () => {
    const r = read(PREFEITURA, 'entrada');
    expect([r.amountCents, r.occurredOn, r.counterpart, r.serviceNote]).toEqual([
      141_000,
      '2026-10-03',
      'Comércio Modelo S.A.',
      { number: '123', provider: 'Estúdio Exemplo de Design Ltda', client: 'Comércio Modelo S.A.' },
    ]);
    // Sem o líquido, vale o valor do serviço.
    expect(read(PREFEITURA.replace('Valor Líquido: R$ 1.410,00', ''), 'entrada').amountCents).toBe(150_000);
  });

  it('foto da nota lida linha a linha: o maior valor (o do serviço) e a data seguida de hora; o nome fica para a pessoa', () => {
    const r = read(FOTO, 'entrada');
    expect([r.amountCents, r.occurredOn, r.counterpart]).toEqual([450_000, '2026-10-05', null]);
  });

  it('sem a tela, a direção fica em aberto e o nome também', () => {
    const r = comprovanteFromText(NACIONAL);
    expect(r.ok && [r.reading.direction, r.reading.counterpart]).toEqual([null, null]);
  });

  it('nada de CPF, CNPJ, endereço, telefone, e-mail, chave ou descrição do serviço no resultado', () => {
    for (const text of [NACIONAL, PREFEITURA, FOTO]) {
      for (const direction of ['entrada', 'saida'] as const) {
        const json = JSON.stringify(comprovanteFromText(text, { defaultDirection: direction, items: ITEMS }));
        for (const secret of [...SECRETS, KEY, 'AB12CD34', 'identidade visual']) expect(json).not.toContain(secret);
      }
    }
  });

  it('nota de produto (DANFE) continua recusada, com a mensagem que aponta Anotar gasto e diz o que se lê aqui', () => {
    const danfe = 'DANFE\nDocumento Auxiliar da Nota Fiscal Eletrônica\nCHAVE DE ACESSO\n3326 1011 2223 3300 0181 5500 1000 0000 0110 0000 0000\nVALOR TOTAL DA NOTA 87,40';
    expect(comprovanteFromText(danfe, { defaultDirection: 'entrada' })).toEqual({ ok: false, code: 'nota_fiscal' });
    expect(COMPROVANTE_TEXT.errors.nota_fiscal).toBe(
      'Esta é uma nota fiscal de produto. Para anotar uma compra com nota, use Escanear nota fiscal em Anotar gasto. Aqui lemos comprovantes, holerites e notas de serviço.',
    );
  });

  it('o PDF da nota em Anotar gasto aponta a leitura certa para a nota de serviço', () => {
    expect(NOTA_TEXT.pdf.serviceNote).toBe('Esta é uma nota de serviço. Para lê-la, use Ler comprovante de Pix ou pagamento, nesta mesma lista.');
  });
});

describe('nota de serviço (NFS-e): formulário', () => {
  const today = '2026-10-31';

  it('a tela decide o lado e o nome; não há aviso de tipo trocado', () => {
    const reading = read(NACIONAL, 'entrada');
    const income = comprovanteDraft(reading, today, 'receita');
    const expense = comprovanteDraft(reading, today, 'despesa');
    expect([income.recordKind, income.counterpart]).toEqual(['receita', 'Empresa Exemplo de Tecnologia Ltda']);
    expect([expense.recordKind, expense.counterpart]).toEqual(['despesa', 'Alex Exemplo da Silva']);
    expect(comprovanteMismatch(income, 'receita')).toBeNull();
    expect(comprovanteMismatch(expense, 'despesa')).toBeNull();
  });

  it('descrição com o número e o nome; a da última vez não se repete (traria outro número), só a categoria', () => {
    const income = comprovanteDraft(read(NACIONAL, 'entrada'), today, 'receita');
    expect(suggestComprovanteDescription(income, null, 'receita')).toEqual({
      description: 'Nota fiscal 35 para Empresa Exemplo de Tecnologia Ltda',
      category: null,
      source: 'nome',
      legend: 'Número e nome lidos da nota',
      placeholder: COMPROVANTE_TEXT.placeholderIn,
    });
    const again = suggestComprovanteDescription(income, { description: 'Nota fiscal 34 para Empresa Exemplo de Tecnologia Ltda', category: 'Renda extra' }, 'receita');
    expect([again.description, again.category]).toEqual(['Nota fiscal 35 para Empresa Exemplo de Tecnologia Ltda', 'Renda extra']);
    const expense = comprovanteDraft(read(NACIONAL, 'saida'), today, 'despesa');
    expect(suggestComprovanteDescription(expense, null, 'despesa').description).toBe('Nota fiscal 35 de Alex Exemplo da Silva');
    // Sem nome nem número.
    const bare = comprovanteDraft(read(FOTO.replace(/^NÚMERO.*$/m, ''), 'entrada'), today, 'receita');
    expect(suggestComprovanteDescription({ ...bare, serviceNote: { number: null, provider: null, client: null } }, null, 'receita')).toMatchObject({
      description: 'Nota fiscal de serviço',
      legend: null,
    });
  });

  it('linha da leitura, rótulos e avisos: o lado escolhido pela tela e a data de emissão', () => {
    const income = comprovanteDraft(read(NACIONAL, 'entrada'), today, 'receita');
    expect(comprovanteReadLine(income)).toBe('Nota de serviço lida: Empresa Exemplo de Tecnologia Ltda · R$ 4.200,00 · 05/10/2026');
    expect(comprovanteKindLabel('nota_servico', 'entrada')).toBe('Nota de serviço');
    expect(comprovanteKindPhrase('nota_servico', 'saida')).toBe('uma nota de serviço');
    expect(comprovanteGaps(income)).toEqual({
      amount: null,
      day: null,
      name: null,
      guessed: null,
      side: 'Lemos como um serviço que você prestou: o nome é de quem contratou.',
      issued: 'A data é a da emissão da nota. Se o pagamento foi em outro dia, troque a data.',
    });
    const expense = comprovanteDraft(read(NACIONAL, 'saida'), today, 'despesa');
    expect(comprovanteGaps(expense).side).toBe('Lemos como um serviço que você contratou: o nome é de quem prestou.');
    // Sem valor e com data futura.
    const future = comprovanteDraft({ ...read(NACIONAL, 'entrada'), amountCents: null, occurredOn: '2026-11-20' }, today, 'receita');
    expect(comprovanteGaps(future)).toMatchObject({ amount: 'O valor não apareceu na nota. Digite o valor.', day: 'A data da nota ainda não chegou. Escolha o dia.', issued: null });
    expect(comprovanteReadLine(comprovanteDraft({ ...read(FOTO, 'entrada'), amountCents: null, occurredOn: null }, today, 'receita'))).toBe('Nota de serviço lida');
  });
});
