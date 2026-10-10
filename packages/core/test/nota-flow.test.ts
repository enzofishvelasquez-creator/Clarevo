import { describe, expect, it, vi } from 'vitest';
import {
  NOTA_FLOW_TEXT,
  NOTA_TEXT,
  PDF_READ_TIMEOUT_MS,
  accessKeyCheckDigit,
  dateOutsideNoteMonth,
  descriptionAfterCategory,
  factsFromKey,
  factsFromQr,
  looksLikeBoleto,
  noteFillPlan,
  noteGaps,
  noteIssuedOn,
  noteReadLine,
  parseAccessKey,
  parseNfceQr,
  raceWithTimeout,
  readReceiptCode,
  receiptDraft,
  scanOptionLabel,
  scanSheetOptions,
  storeMemoryFor,
  storeMemoryId,
  suggestDescription,
} from '../src';

const TODAY = '2026-10-09';

function keyText(aamm: string, model: '55' | '65' = '65', uf = '33', cnpj = '11222333000181'): string {
  const body = `${uf}${aamm}${cnpj}${model}001000012345187654321`;
  return body + String(accessKeyCheckDigit(body));
}

function draftOf(aamm: string, opts: { model?: '55' | '65'; qr?: string; issuedOn?: string; totalCents?: number; issuerName?: string } = {}) {
  const text = keyText(aamm, opts.model ?? '65');
  const parsed = parseAccessKey(text);
  if (!parsed.ok) throw new Error('chave');
  const facts = { ...factsFromKey(parsed.info), ...(opts.issuedOn ? { issuedOn: opts.issuedOn } : {}), ...(opts.totalCents ? { totalCents: opts.totalCents } : {}), ...(opts.issuerName ? { issuerName: opts.issuerName } : {}) };
  return { facts, draft: receiptDraft(facts, TODAY) };
}

describe('descrição e categoria (rascunho da nota)', () => {
  it('mesma loja já anotada: repete descrição e categoria da última vez, com a legenda', () => {
    const s = suggestDescription({ issuerName: 'Mercado Exemplo Ltda', lastTime: { description: 'Mercado do bairro', category: 'Mercado' } });
    expect(s).toMatchObject({ description: 'Mercado do bairro', category: 'Mercado', source: 'ultima_vez', legend: 'Como da última vez nesta loja' });
  });

  it('categoria que não existe mais não é repetida', () => {
    const s = suggestDescription({ issuerName: null, lastTime: { description: 'Feira', category: 'Inexistente' } });
    expect(s.category).toBeNull();
    expect(s.source).toBe('ultima_vez');
  });

  it('sem memória da loja mas com o nome lido da página: usa o nome (nunca "Compra (CNPJ ...)")', () => {
    const s = suggestDescription({ issuerName: 'Mercado Exemplo Ltda', lastTime: null });
    expect(s).toMatchObject({ description: 'Mercado Exemplo Ltda', category: null, source: 'nome_da_loja', legend: 'Nome da loja lido da nota' });
  });

  it('sem nada: em branco, com a dica "Ex.: Mercado"', () => {
    const s = suggestDescription({ issuerName: null, lastTime: null });
    expect(s).toEqual({ description: '', category: null, source: 'em_branco', legend: null, placeholder: 'Ex.: Mercado' });
    expect(suggestDescription({ issuerName: '   ', lastTime: { description: '  ', category: null } }).source).toBe('em_branco');
  });

  it('nome muito longo é cortado em 80 caracteres sem deixar meia palavra', () => {
    const long = `${'Mercado '.repeat(20)}Final`;
    const s = suggestDescription({ issuerName: long, lastTime: null });
    expect([...s.description].length).toBeLessThanOrEqual(80);
    expect(s.description.endsWith(' ')).toBe(false);
  });

  it('o rascunho da nota nunca sugere "Compra (CNPJ ...)" como descrição final do formulário', () => {
    const { draft } = draftOf('2610');
    expect(draft.description).toBe('Compra (CNPJ 11.222.333/0001-81)');
    expect(suggestDescription({ issuerName: draft.issuerName, lastTime: null }).description).toBe('');
  });

  it('tocar numa categoria com a descrição vazia preenche a descrição com o nome dela', () => {
    expect(descriptionAfterCategory('', 'Mercado')).toBe('Mercado');
    expect(descriptionAfterCategory('   ', 'Lazer')).toBe('Lazer');
    expect(descriptionAfterCategory('Pão', 'Mercado')).toBe('Pão');
    expect(descriptionAfterCategory('', null)).toBe('');
  });

  it('memória da loja: guarda descrição e categoria válidas e ignora o resto', () => {
    expect(storeMemoryFor('  Mercado   do bairro ', 'Mercado')).toEqual({ description: 'Mercado do bairro', category: 'Mercado' });
    expect(storeMemoryFor('Feira', 'Qualquer')).toEqual({ description: 'Feira', category: null });
    expect(storeMemoryFor('', 'Mercado')).toBeNull();
    expect(storeMemoryFor('x'.repeat(81), null)).toBeNull();
  });

  it('chave da memória: resumo do CNPJ, sem o CNPJ; emitente pessoa física não tem', () => {
    const parsed = parseAccessKey(keyText('2610'));
    if (!parsed.ok) throw new Error('chave');
    const id = storeMemoryId(parsed.info);
    expect(id).toMatch(/^[0-9a-f]{64}$/);
    expect(id).not.toContain('11222333000181');
    expect(storeMemoryId(parsed.info)).toBe(id);
    const other = parseAccessKey(keyText('2609'));
    if (other.ok) expect(storeMemoryId(other.info)).toBe(id);
    expect(storeMemoryId({ cnpj: null })).toBeNull();
  });
});

describe('o que a leitura preenche e o foco', () => {
  it('QR sem valor nem dia, mês atual: valor falta (foco no Valor) e o dia é o de hoje, dito com clareza', () => {
    const { draft, facts } = draftOf('2610');
    const plan = noteFillPlan(draft);
    expect(plan).toEqual({ amountText: null, dateText: '09/10/2026', focus: 'amountText' });
    const gaps = noteGaps(draft, noteIssuedOn(facts, draft, TODAY));
    expect(gaps.amount).toBe('O valor não vem no código desta nota. Digite o total impresso no cupom.');
    expect(gaps.day).toBeNull();
    expect(gaps.dayAssumed).toBe(NOTA_FLOW_TEXT.dayAssumed);
    expect(gaps.storeName).toBe(NOTA_FLOW_TEXT.cnpjOnly);
  });

  it('nota de outro mês sem dia: o dia fica vazio, o foco é o Valor e a mensagem do dia cita o mês', () => {
    const { draft, facts } = draftOf('2608');
    const plan = noteFillPlan(draft);
    expect(plan.dateText).toBe('');
    expect(plan.focus).toBe('amountText');
    const gaps = noteGaps(draft, noteIssuedOn(facts, draft, TODAY));
    expect(gaps.day).toBe('O dia da compra não vem no código desta nota. Escolha o dia em agosto de 2026.');
    expect(gaps.dayAssumed).toBeNull();
  });

  it('com o valor mas sem o dia (nota de agosto): o foco vai para a data', () => {
    const { draft } = draftOf('2608', { totalCents: 8_740 });
    expect(noteFillPlan(draft)).toEqual({ amountText: '87,40', dateText: '', focus: 'dateText' });
  });

  it('nota completa (contingência, DANFE ou página da Sefaz): nada falta, o teclado fica fechado', () => {
    const { draft, facts } = draftOf('2610', { totalCents: 8_740, issuedOn: '2026-10-06', issuerName: 'Mercado Exemplo Ltda' });
    expect(noteFillPlan(draft)).toEqual({ amountText: '87,40', dateText: '06/10/2026', focus: null });
    expect(noteGaps(draft, noteIssuedOn(facts, draft, TODAY))).toEqual({ amount: null, day: null, dayAssumed: null, storeName: null });
  });

  it('a data da nota só conta se está no mês da chave e não é futura', () => {
    const { draft, facts } = draftOf('2610', { issuedOn: '2026-10-20' });
    expect(noteIssuedOn(facts, draft, TODAY)).toBeNull();
    expect(noteIssuedOn({ issuedOn: '2026-09-30' }, draft, TODAY)).toBeNull();
    expect(noteIssuedOn({ issuedOn: '2026-10-05' }, draft, TODAY)).toBe('2026-10-05');
    expect(noteIssuedOn({}, draft, TODAY)).toBeNull();
  });

  it('linha do bloco "Nota lida"', () => {
    const full = draftOf('2610', { totalCents: 8_740, issuedOn: '2026-10-06', issuerName: 'Mercado Exemplo Ltda' });
    expect(noteReadLine(full.draft, '2026-10-06')).toBe('Nota lida: Mercado Exemplo Ltda · RJ · 06/10/2026');
    const bare = draftOf('2610');
    expect(noteReadLine(bare.draft, null)).toBe('Nota lida: CNPJ 11.222.333/0001-81 · RJ · outubro de 2026');
  });


  it('aviso leve quando a data escolhida é de outro mês da nota', () => {
    expect(dateOutsideNoteMonth('2026-09-30', '2026-10')).toBe('A nota é de outubro de 2026. A data escolhida é de outro mês.');
    expect(dateOutsideNoteMonth('2026-10-01', '2026-10')).toBeNull();
    expect(dateOutsideNoteMonth(null, '2026-10')).toBeNull();
  });
});

describe('folha "Escanear nota fiscal"', () => {
  it('com câmera: câmera, PDF, colar; sem câmera: o PDF vem primeiro', () => {
    expect(scanSheetOptions(true)).toEqual(['camera', 'pdf', 'colar']);
    expect(scanSheetOptions(false)).toEqual(['pdf', 'colar']);
    expect(scanSheetOptions(true).map(scanOptionLabel)).toEqual(['Usar a câmera', 'Escolher o PDF da nota', 'Colar o link ou a chave']);
    expect(NOTA_TEXT.sheet.camera).toBe('Usar a câmera');
  });
});

describe('looksLikeBoleto', () => {
  // Vetores calculados à parte, em outra implementação (módulos 10 e 11 do manual FEBRABAN).
  const bankBarcode = '23796987600000123451234567890123456789012345';
  const bankLine = '23791234546789012345767890123457698760000012345';
  const collectionBarcode10 = '82680000001234501231234567890123456789012345';
  const collectionLine10 = '826800000018234501231232456789012345567890123456';
  const collectionBarcode11 = '82880000001234501231234567890123456789012345';
  const collectionLine11 = '828800000014234501231231456789012341567890123457';

  it('reconhece o código de barras e a linha digitável de boleto bancário', () => {
    expect(looksLikeBoleto(bankBarcode)).toBe(true);
    expect(looksLikeBoleto(bankLine)).toBe(true);
    expect(looksLikeBoleto('23791.23454 67890.123457 67890.123457 6 98760000012345')).toBe(true);
    expect(looksLikeBoleto(' 2379-1234546789012345767890123457698760000012345 ')).toBe(true);
  });

  it('reconhece contas de consumo e tributos (começam por 8), nos dois módulos', () => {
    for (const code of [collectionBarcode10, collectionLine10, collectionBarcode11, collectionLine11]) expect(looksLikeBoleto(code), code).toBe(true);
    expect(looksLikeBoleto('82680000001-8 23450123123-2 45678901234-5 56789012345-6')).toBe(true);
  });

  it('um dígito trocado desfaz o reconhecimento', () => {
    for (const code of [bankBarcode, bankLine, collectionBarcode10, collectionLine10, collectionBarcode11, collectionLine11]) {
      const i = Math.floor(code.length / 2);
      const bad = code.slice(0, i) + String((Number(code[i]) + 1) % 10) + code.slice(i + 1);
      expect(looksLikeBoleto(bad), bad).toBe(false);
    }
  });

  it('a chave de uma NF-e ou NFC-e não é boleto, mesmo começando como um banco ("23" é o CE, "33" é o RJ)', () => {
    for (const uf of ['23', '33', '35', '41']) {
      const text = keyText('2610', '65', uf);
      expect(looksLikeBoleto(text), text).toBe(false);
    }
  });

  it('o boleto do Bradesco (237) colado como chave cai em erro de chave e é reconhecido como boleto', () => {
    const read = readReceiptCode(bankBarcode);
    expect(read.ok).toBe(false);
    expect(looksLikeBoleto(bankBarcode)).toBe(true);
  });

  it('textos, tamanhos e números quaisquer não são boleto', () => {
    for (const x of ['', '   ', 'abc', '12345', '9'.repeat(44), '0'.repeat(47), '1'.repeat(48), 'https://exemplo.com.br', `${bankBarcode}9`, bankBarcode.slice(1), 'x'.repeat(200)]) {
      expect(looksLikeBoleto(x), x).toBe(false);
    }
    expect(looksLikeBoleto(undefined as unknown as string)).toBe(false);
  });

  it('texto do aviso e da ação', () => {
    expect(NOTA_FLOW_TEXT.boleto).toBe('Este é o código de um boleto. Para anotar uma conta que ainda vai vencer, use Anotar conta a pagar.');
    expect(NOTA_FLOW_TEXT.boletoAction).toBe('Anotar conta a pagar');
  });
});

describe('integração com o QR', () => {
  it('QR do RJ em contingência traz valor e dia: nada falta', () => {
    const base = 'https://consultadfe.fazenda.rj.gov.br/consultaNFCe/QRCode?p=';
    const url = `${base}${keyText('2610')}|2|1|08|87.40|0123456789ABCDEF0123456789ABCDEF01234567|1|ABCDEF0123456789ABCDEF0123456789ABCDEF01`;
    const qr = parseNfceQr(url);
    expect(qr.ok).toBe(true);
    if (!qr.ok) return;
    const facts = factsFromQr(qr.qr, url);
    const draft = receiptDraft(facts, TODAY);
    expect(noteFillPlan(draft)).toEqual({ amountText: '87,40', dateText: '08/10/2026', focus: null });
    expect(noteReadLine(draft, noteIssuedOn(facts, draft, TODAY))).toBe('Nota lida: CNPJ 11.222.333/0001-81 · RJ · 08/10/2026');
  });
});

describe('leitura de PDF com tempo limite', () => {
  it('o limite é de 25 segundos', () => {
    expect(PDF_READ_TIMEOUT_MS).toBe(25_000);
  });

  it('devolve o resultado quando termina a tempo, a falha como "erro" e o atraso como "tempo" (chamando onTimeout uma vez)', async () => {
    vi.useFakeTimers();
    try {
      expect(await raceWithTimeout(Promise.resolve(7), 1_000)).toEqual({ value: 7 });
      expect(await raceWithTimeout(Promise.reject(new Error('x')), 1_000)).toBe('erro');
      const onTimeout = vi.fn();
      const never = new Promise<number>(() => {});
      const pending = raceWithTimeout(never, PDF_READ_TIMEOUT_MS, onTimeout);
      await vi.advanceTimersByTimeAsync(PDF_READ_TIMEOUT_MS - 1);
      expect(onTimeout).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(2);
      expect(await pending).toBe('tempo');
      expect(onTimeout).toHaveBeenCalledTimes(1);
      // Falha tardia do trabalho abandonado não vira erro solto.
      let reject!: (e: Error) => void;
      const late = new Promise<number>((_r, rej) => {
        reject = rej;
      });
      const slow = raceWithTimeout(late, 100, () => {
        throw new Error('destruir falhou');
      });
      await vi.advanceTimersByTimeAsync(150);
      expect(await slow).toBe('tempo');
      reject(new Error('tarde'));
      await vi.advanceTimersByTimeAsync(10);
    } finally {
      vi.useRealTimers();
    }
  });

  it('o texto do detalhe sem link não manda "ler o QR de novo" (a nota pode ter vindo do PDF ou da chave)', () => {
    expect(NOTA_FLOW_TEXT.detailNoLink).not.toMatch(/de novo/i);
    expect(NOTA_FLOW_TEXT.detailNoLink).toContain('resumo da chave');
  });
});
