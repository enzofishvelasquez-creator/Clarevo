import { describe, expect, it } from 'vitest';
import { danfeFromText, factsFromDanfe, parseAccessKey, paymentFormsFromText, receiptDraft, receiptKeyValid, sha256Hex, type DanfeReading } from '../src';

/** Mesma conta de outro jeito que a do código: pesos de 2 a 9 repetidos da direita para a esquerda, valor = código ASCII menos 48. */
function dv11(chars: string): number {
  let weight = 2;
  let sum = 0;
  for (const c of [...chars].reverse()) {
    sum += (c.charCodeAt(0) - 48) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const rest = sum % 11;
  return rest === 0 || rest === 1 ? 0 : 11 - rest;
}

function makeCnpj(base12: string): string {
  const d1 = dv11(base12);
  return `${base12}${d1}${dv11(base12 + d1)}`;
}

function makeKey(p: { uf?: string; aamm?: string; cnpj?: string; model?: string; series?: number; number?: number } = {}): string {
  const body =
    (p.uf ?? '33') +
    (p.aamm ?? '2610') +
    (p.cnpj ?? makeCnpj('123456780001')) +
    (p.model ?? '55') +
    String(p.series ?? 1).padStart(3, '0') +
    String(p.number ?? 12345).padStart(9, '0') +
    '1' +
    '87654321';
  return body + dv11(body);
}

const NBSP = String.fromCharCode(0xa0);
const KEY = makeKey();
const GROUPED = KEY.replace(/(.{4})/g, '$1 ').trim();

// Dados de pessoa fictícios, só para provar que nunca saem do resultado.
const RECIPIENT = {
  name: 'MARIA APARECIDA DOS SANTOS',
  cpf: '529.982.247-25',
  cpfDigits: '52998224725',
  street: 'RUA DAS FLORES, 100 APTO 12',
  district: 'JARDIM DAS ACACIAS',
  city: 'NITEROI',
  cep: '24000-000',
};

interface SampleOptions {
  key?: string;
  issuer?: string;
  emission?: string;
  total?: string;
  canhoto?: boolean;
}

/**
 * Texto de um DANFE retrato com os rótulos do manual do contribuinte, na ordem em que um extrator de PDF costuma entregar:
 * cada rótulo seguido do seu valor. O destinatário traz nome, CPF e endereço, que não podem aparecer no resultado.
 */
function danfeCells(o: SampleOptions = {}): string {
  const key = o.key ?? KEY;
  const issuer = o.issuer ?? 'LOJA EXEMPLO LTDA';
  const emission = o.emission ?? '05/10/2026';
  const total = o.total ?? '150,00';
  const lines: string[] = [];
  if (o.canhoto !== false) {
    lines.push(
      `RECEBEMOS DE ${issuer} OS PRODUTOS E/OU SERVIÇOS CONSTANTES DA NOTA FISCAL ELETRÔNICA INDICADA ABAIXO. EMISSÃO: ${emission} VALOR TOTAL: R$ ${total} DESTINATÁRIO: ${RECIPIENT.name} ${RECIPIENT.street} ${RECIPIENT.district}`,
      'DATA DE RECEBIMENTO',
      'IDENTIFICAÇÃO E ASSINATURA DO RECEBEDOR',
    );
  }
  lines.push(
    'NF-e',
    'Nº 000.012.345',
    'SÉRIE 001',
    'IDENTIFICAÇÃO DO EMITENTE',
    issuer,
    'RUA DAS PALMEIRAS, 100 - CENTRO',
    'CEP 20000-000 - RIO DE JANEIRO - RJ',
    'Fone/Fax: (21) 3000-0000',
    'DANFE',
    'DOCUMENTO AUXILIAR DA NOTA FISCAL ELETRÔNICA',
    '0 - ENTRADA',
    '1 - SAÍDA',
    '1',
    'Nº 000.012.345',
    'SÉRIE 001',
    'FOLHA 1/1',
    'CHAVE DE ACESSO',
    key.replace(/(.{4})/g, '$1 ').trim(),
    'Consulta de autenticidade no portal nacional da NF-e www.nfe.fazenda.gov.br/portal ou no site da Sefaz Autorizadora',
    'NATUREZA DA OPERAÇÃO',
    'VENDA DE MERCADORIA',
    'PROTOCOLO DE AUTORIZAÇÃO DE USO',
    `333260000012345 ${emission} 14:32:10`,
    'INSCRIÇÃO ESTADUAL',
    '12.345.678',
    'INSC. ESTADUAL DO SUBST. TRIBUT.',
    'CNPJ',
    '12.345.678/0001-95',
    'DESTINATÁRIO / REMETENTE',
    'NOME / RAZÃO SOCIAL',
    RECIPIENT.name,
    'CNPJ / CPF',
    RECIPIENT.cpf,
    'INSCRIÇÃO ESTADUAL',
    'DATA DA EMISSÃO',
    emission,
    'ENDEREÇO',
    RECIPIENT.street,
    'BAIRRO / DISTRITO',
    RECIPIENT.district,
    'CEP',
    RECIPIENT.cep,
    'DATA DA ENTRADA/SAÍDA',
    emission,
    'MUNICÍPIO',
    RECIPIENT.city,
    'FONE / FAX',
    'UF',
    'RJ',
    'HORA DA ENTRADA/SAÍDA',
    'CÁLCULO DO IMPOSTO',
    'BASE DE CÁLC. DO ICMS',
    '0,00',
    'VALOR DO ICMS',
    '0,00',
    'BASE DE CÁLC. ICMS S.T.',
    '0,00',
    'VALOR DO ICMS SUBST.',
    '0,00',
    'V. IMP. IMPORTAÇÃO',
    '0,00',
    'V. ICMS UF REMET.',
    '0,00',
    'V. FCP UF DEST.',
    '0,00',
    'VALOR TOTAL DOS PRODUTOS',
    '140,00',
    'VALOR DO FRETE',
    '10,00',
    'VALOR DO SEGURO',
    '0,00',
    'DESCONTO',
    '0,00',
    'OUTRAS DESPESAS ACESSÓRIAS',
    '0,00',
    'VALOR TOTAL IPI',
    '0,00',
    'V. ICMS UF DEST.',
    '0,00',
    'V. TOT. TRIB.',
    '12,30',
    'VALOR TOTAL DA NOTA',
    total,
    'TRANSPORTADOR / VOLUMES TRANSPORTADOS',
    'NOME / RAZÃO SOCIAL',
    'FRETE POR CONTA',
    '0-Remetente',
    'DADOS DOS PRODUTOS / SERVIÇOS',
    'CÓDIGO DESCRIÇÃO NCM/SH CST CFOP UNID. QUANT. VALOR UNIT. VALOR TOTAL BC ICMS VALOR ICMS VALOR IPI ALÍQ. ICMS ALÍQ. IPI',
    '123 FONE DE OUVIDO 85183000 000 5102 UN 1,0000 140,00 140,00 0,00 0,00 0,00 0,00% 0,00%',
    'DADOS ADICIONAIS',
    'INFORMAÇÕES COMPLEMENTARES',
    'Pedido 2000012345678 Valor aproximado dos tributos R$ 12,30',
  );
  return lines.join('\n');
}

/** Mesmo DANFE, mas com uma linha de rótulos e depois a linha de valores (alguns geradores de PDF escrevem assim). */
function danfeRows(total = '150,00', unknownLabels = false): string {
  const row2Labels = unknownLabels
    ? 'FRETE SEGURO DESC. OUTRAS DESP. IPI ICMS UF DEST. TRIBUTOS APROX. VALOR TOTAL DA NOTA'
    : 'VALOR DO FRETE VALOR DO SEGURO DESCONTO OUTRAS DESPESAS ACESSÓRIAS VALOR TOTAL IPI V. ICMS UF DEST. V. TOT. TRIB. VALOR TOTAL DA NOTA';
  return [
    'DANFE',
    'DOCUMENTO AUXILIAR DA NOTA FISCAL ELETRÔNICA',
    'CHAVE DE ACESSO',
    GROUPED,
    'DESTINATÁRIO / REMETENTE',
    `NOME / RAZÃO SOCIAL CNPJ / CPF INSCRIÇÃO ESTADUAL DATA DA EMISSÃO`,
    `${RECIPIENT.name} ${RECIPIENT.cpf} 05/10/2026`,
    'ENDEREÇO BAIRRO / DISTRITO CEP DATA DA ENTRADA/SAÍDA',
    `${RECIPIENT.street} ${RECIPIENT.district} ${RECIPIENT.cep} 05/10/2026`,
    'CÁLCULO DO IMPOSTO',
    'BASE DE CÁLC. DO ICMS VALOR DO ICMS BASE DE CÁLC. ICMS S.T. VALOR DO ICMS SUBST. V. IMP. IMPORTAÇÃO V. ICMS UF REMET. V. FCP UF DEST. VALOR TOTAL DOS PRODUTOS',
    '0,00 0,00 0,00 0,00 0,00 0,00 0,00 140,00',
    row2Labels,
    `10,00 0,00 0,00 0,00 0,00 0,00 12,30 ${total}`,
    'TRANSPORTADOR / VOLUMES TRANSPORTADOS',
  ].join('\n');
}

function read(text: string): DanfeReading {
  const r = danfeFromText(text);
  if (!r.ok) throw new Error(r.code);
  return r.reading;
}

/** O resultado inteiro, como texto, sem a chave (que carrega o CNPJ do emitente e nada do destinatário). */
function visible(reading: DanfeReading): string {
  const { key, ...rest } = reading;
  return JSON.stringify({ ...rest, key: { ...key, key: '' } });
}

describe('DANFE em texto', () => {
  it('layout oficial: chave, data de emissão, valor total e nome do emitente', () => {
    const r = read(danfeCells());
    expect(r.key.key).toBe(KEY);
    expect(r.key.model).toBe('55');
    expect(r.key.uf).toBe('RJ');
    expect(r.key.cnpjFormatted).toBe('12.345.678/0001-95');
    expect(r.issuedOn).toBe('2026-10-05');
    expect(r.totalCents).toBe(15000);
    expect(r.issuerName).toBe('Loja Exemplo Ltda');
  });

  it('destinatário (nome, CPF, endereço) nunca aparece no resultado', () => {
    const r = read(danfeCells());
    const text = visible(r);
    for (const secret of [RECIPIENT.name, 'MARIA', 'APARECIDA', RECIPIENT.cpf, RECIPIENT.cpfDigits, RECIPIENT.street, RECIPIENT.district, RECIPIENT.cep, RECIPIENT.city]) {
      expect(text.toLowerCase(), secret).not.toContain(secret.toLowerCase());
    }
    // O rascunho também não.
    const draft = receiptDraft(factsFromDanfe(r), '2026-10-09');
    expect(JSON.stringify(draft).toLowerCase()).not.toContain('maria');
    expect(JSON.stringify(draft)).not.toContain(RECIPIENT.cpfDigits);
  });

  it('o destinatário com nome de empresa e antes do emitente não é confundido com ele', () => {
    const text = [
      'DESTINATÁRIO / REMETENTE',
      'NOME / RAZÃO SOCIAL',
      'ACADEMIA DO ZE LTDA',
      'CNPJ / CPF',
      '11.222.333/0001-81',
      'IDENTIFICAÇÃO DO EMITENTE',
      'LOJA EXEMPLO LTDA',
      'CHAVE DE ACESSO',
      GROUPED,
      'DATA DA EMISSÃO',
      '05/10/2026',
      'VALOR TOTAL DA NOTA',
      '150,00',
    ].join('\n');
    const r = read(text);
    expect(r.issuerName).toBe('Loja Exemplo Ltda');
    expect(r.key.cnpjFormatted).toBe('12.345.678/0001-95');
    expect(visible(r)).not.toContain('11.222.333');
    expect(visible(r).toLowerCase()).not.toContain('academia');
  });

  it('valores com milhar, sem milhar e com R$', () => {
    expect(read(danfeCells({ total: '1.234,56' })).totalCents).toBe(123456);
    expect(read(danfeCells({ total: '9.999.999,99' })).totalCents).toBe(999_999_999);
    // Acima do limite do app (R$ 9.999.999,99) não preenche.
    expect(read(danfeCells({ total: '12.345.678,90' })).totalCents).toBeNull();
    expect(read(danfeCells({ total: '9,99' })).totalCents).toBe(999);
    expect(read(`CHAVE DE ACESSO ${GROUPED} DATA DA EMISSÃO 05/10/2026 VALOR TOTAL DA NOTA R$ 87,40`).totalCents).toBe(8740);
    // Valor impossível de ler não vira zero: fica sem valor.
    expect(read(danfeCells({ total: 'abc' })).totalCents).toBeNull();
  });

  it('linha de rótulos seguida da linha de valores: pega o valor da posição do rótulo', () => {
    expect(read(danfeRows('150,00')).totalCents).toBe(15000);
    expect(read(danfeRows('2.500,10')).totalCents).toBe(250010);
    // Rótulos com nomes fora do manual: o total é o último valor da linha.
    expect(read(danfeRows('150,00', true)).totalCents).toBe(15000);
    const r = read(danfeRows());
    expect(r.issuedOn).toBe('2026-10-05');
    expect(visible(r)).not.toContain(RECIPIENT.cpfDigits);
    expect(visible(r)).not.toContain('MARIA');
  });

  it('com o canhoto, o valor dele ajuda a escolher quando a linha de valores traz coluna a mais', () => {
    const canhoto = 'RECEBEMOS DE LOJA EXEMPLO LTDA OS PRODUTOS E/OU SERVIÇOS CONSTANTES DA NOTA FISCAL ELETRÔNICA INDICADA ABAIXO. EMISSÃO: 05/10/2026 VALOR TOTAL: R$ 150,00';
    const rows = danfeRows('150,00', true).replace('12,30 150,00', '12,30 150,00 5,00');
    expect(read(rows).totalCents).toBe(500);
    expect(read(`${canhoto}\n${rows}`).totalCents).toBe(15000);
    // Sem coluna a mais, o valor do canhoto concorda com a posição.
    expect(read(`${canhoto}\n${danfeRows('150,00')}`).totalCents).toBe(15000);
  });

  it('tolerante a espaços, quebras de linha, espaço sem quebra e caixa', () => {
    // Tudo em uma linha, com espaços duplos, espaço sem quebra entre os grupos da chave e rótulos quebrados no meio.
    const flat = danfeCells()
      .replace(/\n/g, '  ')
      .replace(/(\d{4}) (?=\d{4})/g, `$1${NBSP}`)
      .replace('VALOR TOTAL DA NOTA', 'VALOR TOTAL\nDA   NOTA')
      .replace('DATA DA EMISSÃO', 'DATA\nDA EMISSÃO');
    const r = read(flat);
    expect(r.key.key).toBe(KEY);
    expect(r.totalCents).toBe(15000);
    expect(r.issuedOn).toBe('2026-10-05');
    expect(r.issuerName).toBe('Loja Exemplo Ltda');
    // Cada grupo da chave em uma linha, rótulos em minúsculas e sem acento.
    const broken = danfeCells({ canhoto: false })
      .replace(GROUPED, GROUPED.replace(/ /g, '\n'))
      .replace('VALOR TOTAL DA NOTA', 'valor total da nota')
      .replace('DATA DA EMISSÃO', 'data da emissao');
    const b = read(broken);
    expect(b.key.key).toBe(KEY);
    expect(b.totalCents).toBe(15000);
    expect(b.issuedOn).toBe('2026-10-05');
  });

  it('chave colada, sem espaços', () => {
    const r = read(`Chave de acesso\n${KEY}\nData de emissão: 05/10/2026\nValor total da nota 10,00`);
    expect(r.key.key).toBe(KEY);
    expect(r.totalCents).toBe(1000);
    expect(r.issuedOn).toBe('2026-10-05');
  });

  it('texto de extrator que cola o valor no rótulo (PDF do LibreOffice lido por unpdf)', () => {
    // Saída real de um PDF gerado pelo LibreOffice: sem espaço entre o rótulo e o valor da mesma linha.
    const glued = [
      'RECEBEMOS DE LOJA EXEMPLO LTDA OS PRODUTOS E/OU SERVIÇOS CONSTANTES DA NOTA FISCAL ELETRÔNICA INDICADA AO LADO EMISSÃO: 05/10/2026 VALOR TOTAL: R$',
      '150,00 DESTINATÁRIO: MARIA APARECIDA DOS SANTOS RUA DAS FLORES, 100 APTO 12',
      'IDENTIFICAÇÃO DO EMITENTELOJA EXEMPLO LTDA',
      'RUA DAS PALMEIRAS, 100 - CENTRO',
      'DANFE',
      'DOCUMENTO AUXILIAR DA',
      'NOTA FISCAL ELETRÔNICA',
      `CHAVE DE ACESSO${GROUPED.slice(0, -5)}`,
      GROUPED.slice(-4),
      'NATUREZA DA OPERAÇÃOVENDA DE MERCADORIA CNPJ12.345.678/0001-95',
      `NOME / RAZÃO SOCIAL${RECIPIENT.name} CNPJ / CPF${RECIPIENT.cpf} DATA DA EMISSÃO05/10/2026`,
      'VALOR TOTAL DOS PRODUTOS140,00 VALOR DO FRETE10,00 V. TOT. TRIB.12,30 VALOR TOTAL DA NOTA150,00',
    ].join('\n');
    const r = read(glued);
    expect(r.key.key).toBe(KEY);
    expect(r.issuedOn).toBe('2026-10-05');
    expect(r.totalCents).toBe(15000);
    expect(r.issuerName).toBe('Loja Exemplo Ltda');
    expect(visible(r)).not.toContain(RECIPIENT.cpfDigits);
    expect(visible(r)).not.toMatch(/MARIA|Maria|FLORES/);
    // Sem o canhoto, cada campo sai do seu próprio rótulo.
    const noCanhoto = glued.split('\n').slice(2).join('\n');
    const n = read(noCanhoto);
    expect(n.key.key).toBe(KEY);
    expect(n.issuedOn).toBe('2026-10-05');
    expect(n.totalCents).toBe(15000);
    expect(n.issuerName).toBe('Loja Exemplo Ltda');
  });

  it('chave de CNPJ alfanumérico', () => {
    const key = makeKey({ cnpj: '12ABC34501DE35' });
    const r = read(danfeCells({ key }));
    expect(r.key.cnpj).toBe('12ABC34501DE35');
    expect(r.key.cnpjFormatted).toBe('12.ABC.345/01DE-35');
    expect(r.totalCents).toBe(15000);
  });

  it('chave de CNPJ alfanumérico: o rascunho traz o resumo que o banco aceita; DANFE de emitente pessoa física não guarda o CPF', () => {
    const alfa = makeKey({ cnpj: '12ABC34501DE35' });
    const draft = receiptDraft(factsFromDanfe(read(danfeCells({ key: alfa }))), '2026-10-09');
    expect(draft.receiptKey).toBe(sha256Hex(alfa));
    expect(receiptKeyValid(draft.receiptKey)).toBe(true);
    // Produtor rural (NF-e modelo 55 de pessoa física): "000" + CPF no lugar do CNPJ; o CPF não aparece em nada do rascunho.
    const cpf = '52998224725';
    const pf = makeKey({ cnpj: `000${cpf}` });
    const r = read(danfeCells({ key: pf, issuer: 'SITIO BOA VISTA' }));
    expect(r.key.cnpj).toBeNull();
    const pfDraft = receiptDraft(factsFromDanfe(r), '2026-10-09');
    expect(pfDraft.receiptKey).toBe(sha256Hex(pf));
    expect(pfDraft.receiptKey).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(pfDraft)).not.toContain(cpf);
    expect(JSON.stringify(pfDraft)).not.toContain(pf);
    expect(pfDraft.description).toBe('Compra em Sitio Boa Vista');
  });

  it('duas chaves: vale a que vem depois de "CHAVE DE ACESSO", não a da nota referenciada', () => {
    const referenced = makeKey({ number: 777 });
    const text = `INFORMAÇÕES COMPLEMENTARES NF-e referenciada ${referenced}\n${danfeCells({ canhoto: false })}`;
    expect(read(text).key.key).toBe(KEY);
  });

  it('data de outro mês que não o da chave não vale (leitura errada)', () => {
    const r = read(danfeCells({ emission: '05/11/2026' }));
    expect(r.issuedOn).toBeNull();
    expect(r.key.yearMonth).toBe('2026-10');
    // Data impossível (31/09) também não vale.
    expect(read(danfeCells({ emission: '31/09/2026' })).issuedOn).toBeNull();
    // Vale a primeira data certa depois do rótulo, mesmo que haja uma errada antes.
    const second = read(`EMISSÃO: 99/99/2026 CHAVE DE ACESSO ${GROUPED} DATA DA EMISSÃO 12/10/2026`);
    expect(second.issuedOn).toBe('2026-10-12');
  });

  it('sem rótulo de valor ou de data, o resto continua', () => {
    const r = read(`CHAVE DE ACESSO ${GROUPED} NATUREZA DA OPERAÇÃO VENDA`);
    expect(r.totalCents).toBeNull();
    expect(r.issuedOn).toBeNull();
    expect(r.issuerName).toBeNull();
    expect(r.key.key).toBe(KEY);
  });

  it('nome do emitente: do canhoto, do bloco do emitente, com MEI sem CPF; nome do destinatário nunca', () => {
    expect(read(danfeCells({ issuer: 'J R DA SILVA COMERCIO DE ELETRONICOS ME' })).issuerName).toBe('J R da Silva Comercio de Eletronicos ME');
    expect(read(danfeCells({ issuer: 'JOAO DA SILVA 12345678909' })).issuerName).toBe('Joao da Silva');
    expect(read(danfeCells({ issuer: 'JOAO DA SILVA 123.456.789-09' })).issuerName).toBe('Joao da Silva');
    // Sem canhoto: primeira linha depois de "IDENTIFICAÇÃO DO EMITENTE".
    expect(read(danfeCells({ canhoto: false, issuer: 'OUTRA LOJA S/A' })).issuerName).toBe('Outra Loja S/A');
    // O bloco do emitente em texto corrido (sem linhas) não vira nome.
    const flat = `IDENTIFICAÇÃO DO EMITENTE LOJA EXEMPLO LTDA RUA DAS PALMEIRAS, 100 CHAVE DE ACESSO ${GROUPED} ${'palavra '.repeat(30)}`;
    expect(read(flat).issuerName === null || read(flat).issuerName!.length <= 80).toBe(true);
    // Nome com a palavra "destinatário" por engano no canhoto: descartado.
    const odd = `RECEBEMOS DE X DESTINATARIO Y OS PRODUTOS CHAVE DE ACESSO ${GROUPED}`;
    expect(read(odd).issuerName).toBeNull();
  });

  it('NFC-e em PDF (modelo 65): valor a pagar e "Emissão" sem dois pontos', () => {
    const key = makeKey({ model: '65', number: 4321 });
    const text = [
      'LOJA EXEMPLO LTDA',
      'CNPJ: 12.345.678/0001-95',
      'DANFE NFC-e - Documento Auxiliar da Nota Fiscal de Consumidor Eletrônica',
      'Código Descrição Qtde Un Vl Unit Vl Total',
      '001 PAO FRANCES 2 KG 12,00 24,00',
      'Qtd. total de itens 1',
      'Valor total R$ 87,40',
      'Valor a pagar R$ 87,40',
      'Consulte pela Chave de Acesso em https://consultadfe.fazenda.rj.gov.br/consultaNFCe',
      'CHAVE DE ACESSO',
      key.replace(/(.{4})/g, '$1 ').trim(),
      'CONSUMIDOR NÃO IDENTIFICADO',
      'NFC-e nº 4321 Série 1 Emissão 05/10/2026 14:33:01',
    ].join('\n');
    const r = read(text);
    expect(r.key.model).toBe('65');
    expect(r.totalCents).toBe(8740);
    expect(r.issuedOn).toBe('2026-10-05');
  });

  it('erros: PDF sem texto, sem chave, dígito errado, outro modelo', () => {
    expect(danfeFromText('')).toEqual({ ok: false, code: 'texto_vazio' });
    expect(danfeFromText('   \n  ')).toEqual({ ok: false, code: 'texto_vazio' });
    expect(danfeFromText('Página 1')).toEqual({ ok: false, code: 'texto_vazio' });
    expect(danfeFromText(undefined as unknown as string)).toEqual({ ok: false, code: 'texto_vazio' });
    expect(danfeFromText('Este é um contrato de aluguel com muitas palavras mas nenhuma chave de nota fiscal em lugar nenhum.')).toEqual({
      ok: false,
      code: 'chave_nao_encontrada',
    });
    const wrong = KEY.slice(0, 43) + String((Number(KEY[43]) + 1) % 10);
    expect(danfeFromText(danfeCells({ key: wrong }))).toEqual({ ok: false, code: 'digito_invalido' });
    expect(danfeFromText(danfeCells({ key: makeKey({ model: '57' }) }))).toEqual({ ok: false, code: 'modelo_nao_suportado' });
    // Parte da chave faltando: não parece chave.
    expect(danfeFromText(danfeCells({ key: KEY }).replace(GROUPED, GROUPED.slice(0, 40)))).toEqual({ ok: false, code: 'chave_nao_encontrada' });
  });

  it('texto grande não trava e o excedente é ignorado', () => {
    const filler = 'PRODUTO 123 UN 1,0000 10,00 10,00 0,00 '.repeat(8000);
    const started = Date.now();
    const r = read(`${danfeCells()}\n${filler}`);
    expect(Date.now() - started).toBeLessThan(2000);
    expect(r.totalCents).toBe(15000);
    // A chave depois do limite de leitura não é achada.
    expect(danfeFromText(`${'x '.repeat(250_000)}CHAVE DE ACESSO ${GROUPED}`)).toEqual({ ok: false, code: 'chave_nao_encontrada' });
  });

  it('do DANFE ao rascunho do registro', () => {
    const r = read(danfeCells());
    const draft = receiptDraft(factsFromDanfe(r), '2026-10-09');
    expect(draft).toMatchObject({
      receiptKey: sha256Hex(KEY),
      description: 'Compra em Loja Exemplo Ltda',
      amountCents: 15000,
      occurredOn: '2026-10-05',
      needsDay: false,
      model: '55',
      issuerCnpj: '12.345.678/0001-95',
      summary: 'Nota fiscal do RJ, emitida em 05/10/2026',
    });
    // Sem data no PDF e nota do mês atual: hoje. Sem data e de outro mês: pede o dia.
    const noDate = read(`CHAVE DE ACESSO ${GROUPED} VALOR TOTAL DA NOTA 10,00`);
    expect(receiptDraft(factsFromDanfe(noDate), '2026-10-20').occurredOn).toBe('2026-10-20');
    expect(receiptDraft(factsFromDanfe(noDate), '2026-12-01').needsDay).toBe(true);
    // O que o banco guarda é o resumo SHA-256 da chave (64 hexadecimais), nunca a chave.
    expect(draft.receiptKey).toMatch(/^[0-9a-f]{64}$/);
    expect(receiptKeyValid(draft.receiptKey)).toBe(true);
    expect(JSON.stringify(draft)).not.toContain(KEY);
    expect(parseAccessKey(KEY).ok).toBe(true);
  });
});

/** Bloco de pagamento de um DANFE (NT 2016/002 e DANFE de NFC-e em PDF), inserido antes do transportador. */
function withPaymentBlock(block: string[], base = danfeCells()): string {
  return base.replace('TRANSPORTADOR / VOLUMES TRANSPORTADOS', [...block, 'TRANSPORTADOR / VOLUMES TRANSPORTADOS'].join('\n'));
}

describe('DANFE em texto · forma de pagamento (D-042)', () => {
  it('sem bloco de pagamento no texto: lista vazia ("se não houver, nada")', () => {
    expect(read(danfeCells()).payments).toEqual([]);
    expect(receiptDraft(factsFromDanfe(read(danfeCells())), '2026-10-09').payments).toEqual([]);
  });

  it('"FORMA DE PAGAMENTO" com o nome da forma, uma por linha', () => {
    const cases: [string, string][] = [
      ['Dinheiro', 'dinheiro'],
      ['Cartão de Crédito', 'credito'],
      ['Cartão de Débito', 'debito'],
      ['Pix', 'pix'],
      ['Pagamento Instantâneo (PIX)', 'pix'],
      ['Vale Alimentação', 'vale'],
      ['Boleto Bancário', 'outros'],
      ['Outros', 'outros'],
    ];
    for (const [label, form] of cases) {
      const r = read(withPaymentBlock(['PAGAMENTO', 'FORMA DE PAGAMENTO', 'VALOR', label, '150,00']));
      expect(r.payments, label).toEqual([form]);
    }
  });

  it('códigos tPag da NF-e: 01 dinheiro, 03 crédito, 04 débito, 17 Pix, 10 a 13 vales, 99 outros', () => {
    const cases: [string, string][] = [
      ['01', 'dinheiro'],
      ['03', 'credito'],
      ['04', 'debito'],
      ['17', 'pix'],
      ['10', 'vale'],
      ['11', 'vale'],
      ['12', 'vale'],
      ['13', 'vale'],
      ['99', 'outros'],
    ];
    for (const [code, form] of cases) {
      expect(read(withPaymentBlock(['FORMA DE PAGAMENTO', 'tPag', code, '150,00'])).payments, code).toEqual([form]);
      expect(read(withPaymentBlock([`Forma de pagamento: ${code} - texto qualquer`, '150,00'])).payments, code).toEqual([form]);
      expect(read(withPaymentBlock([`tPag: ${code}`])).payments, `tPag: ${code}`).toEqual([form]);
    }
  });

  it('código seguido do nome: as duas formas de escrever dão uma só forma', () => {
    expect(read(withPaymentBlock(['FORMA DE PAGAMENTO', '03 - Cartão de Crédito', '150,00'])).payments).toEqual(['credito']);
  });

  it('rótulos repetidos e hostis: a leitura com códigos tPag termina em menos de 50 ms', () => {
    const texts = ['tpag '.repeat(80_000), 'forma de pagamento pix '.repeat(17_000), 'FORMA DE PAGAMENTO\n03\n'.repeat(15_000)];
    for (const text of texts) {
      const started = performance.now();
      const forms = paymentFormsFromText(text, { withCodes: true });
      expect(performance.now() - started).toBeLessThan(50);
      expect(forms.length).toBeLessThanOrEqual(2);
    }
  });

  it('número que não é código tPag não vira forma: data cortada, parcelas, "Número" e "10x"', () => {
    // Janela cortada no meio de "12/10/2026" (260 caracteres depois do rótulo): "12" não é o código de vale.
    const filler = 'x'.repeat(244);
    const cut = `Forma de pagamento\n${filler}\n12/10/2026`;
    expect(paymentFormsFromText(cut, { withCodes: true })).toEqual([]);
    expect(paymentFormsFromText(`Forma de pagamento\n${'x'.repeat(250)}\n12`, { withCodes: true })).toEqual([]);
    expect(read(withPaymentBlock(['FORMA DE PAGAMENTO', 'Dinheiro 50,00', '03 Número 1234', '150,00'])).payments).toEqual(['dinheiro']);
    expect(read(withPaymentBlock(['Forma de pagamento: À vista', 'Parcelas', '03'])).payments).toEqual([]);
    expect(read(withPaymentBlock(['Forma de pagamento: 10x no cartão de crédito', '150,00'])).payments).toEqual(['credito']);
    expect(read(withPaymentBlock(['Forma de pagamento: 01/10/2026', '150,00'])).payments).toEqual([]);
  });

  it('"Sem pagamento" (90) não é forma', () => {
    expect(read(withPaymentBlock(['FORMA DE PAGAMENTO', '90 - Sem pagamento', '0,00'])).payments).toEqual([]);
  });

  it('mais de uma forma: todas, na ordem do PDF; troco não conta', () => {
    const r = read(withPaymentBlock(['FORMA DE PAGAMENTO VALOR PAGO', 'Dinheiro 100,00', 'Cartão de Débito 50,00', 'Troco 0,00', 'Pix']));
    expect(r.payments).toEqual(['dinheiro', 'debito']);
  });

  it('PDF que escreve tudo numa linha só', () => {
    const text = danfeCells().replace('TRANSPORTADOR / VOLUMES TRANSPORTADOS', 'FORMA DE PAGAMENTO VALOR PAGO Cartão de Crédito 150,00 TRANSPORTADOR / VOLUMES TRANSPORTADOS');
    expect(read(text).payments).toEqual(['credito']);
  });

  it('só olha depois do rótulo: "Pix" ou "Dinheiro" em produto ou observação não vira forma', () => {
    const text = danfeCells().replace('123 FONE DE OUVIDO', '123 CAMISETA PIX DINHEIRO CARTAO DE CREDITO').replace('Pedido 2000012345678', 'Pagamento via PIX combinado');
    expect(read(text).payments).toEqual([]);
  });

  it('o destinatário nunca entra: nada do bloco do destinatário aparece no resultado da forma', () => {
    const r = read(withPaymentBlock(['FORMA DE PAGAMENTO', 'Pix', '150,00']));
    expect(r.payments).toEqual(['pix']);
    expect(visible(r).toLowerCase()).not.toContain('maria');
  });

  it('a forma vai ao rascunho', () => {
    const draft = receiptDraft(factsFromDanfe(read(withPaymentBlock(['FORMA DE PAGAMENTO', 'Cartão de Crédito', '150,00']))), '2026-10-09');
    expect(draft.payments).toEqual(['credito']);
  });
});
