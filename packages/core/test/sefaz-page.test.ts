import { describe, expect, it, vi } from 'vitest';
import {
  EXAMPLE_RECEIPT_HOST,
  SEFAZ_READ_TIMEOUT_MS,
  SEFAZ_TEXT,
  accessKeyCheckDigit,
  canReadSefazPage,
  exampleReceiptQr,
  factsFromQr,
  factsWithPage,
  parseAccessKey,
  parseNfceQr,
  parseSefazPage,
  readSefazPage,
  receiptDraft,
  sefazReadErrorText,
  type AccessKeyInfo,
  type SefazFetch,
} from '../src';
import { CAPTCHA_PAGE, CONSUMER_CPF, CONSUMER_NAME, NOT_FOUND_PAGE, spaced, standardPage, tablePage } from './sefaz-html';

/** Chave de NFC-e do RJ (CNPJ 11.222.333/0001-81), do mês AAMM. */
function keyOf(aamm: string, number = '000012345', uf = '33'): { text: string; info: AccessKeyInfo } {
  const body = `${uf}${aamm}1122233300018165001${number}187654321`;
  const text = body + String(accessKeyCheckDigit(body));
  const parsed = parseAccessKey(text);
  if (!parsed.ok) throw new Error(`chave de teste inválida: ${parsed.code}`);
  return { text, info: parsed.info };
}

const OUT = keyOf('2610');
const OFFICIAL = `https://consultadfe.fazenda.rj.gov.br/consultaNFCe/QRCode?p=${OUT.text}|2|1|1|ABCDEF0123456789ABCDEF0123456789ABCDEF01`;

describe('parseSefazPage · leiaute padrão (HTML sintético)', () => {
  it('lê nome, valor a pagar, data de emissão e quantidade de itens', () => {
    const html = standardPage({ key: OUT.text, total: '87,40', gross: '90,00', discount: '2,60', items: 3, issued: '06/10/2026 14:32:10' });
    const r = parseSefazPage(html, OUT.info);
    expect(r).toEqual({ ok: true, reading: { issuerName: 'Mercado Exemplo Ltda', totalCents: 8_740, issuedOn: '2026-10-06', itemCount: 3 } });
  });

  it('valor a pagar prevalece sobre o valor total (desconto)', () => {
    const r = parseSefazPage(standardPage({ key: OUT.text, total: '87,40', gross: '90,00' }), OUT.info);
    expect(r.ok && r.reading.totalCents).toBe(8_740);
  });

  it('valor com milhar e a quantidade de itens contada pelas linhas quando o rótulo falta', () => {
    const html = standardPage({ key: OUT.text, total: '1.250,90', items: 4 }).replace(/<div id="linhaTotal"><label>Qtd\. total de itens:<\/label>.*?<\/div>/, '');
    const r = parseSefazPage(html, OUT.info);
    expect(r.ok && r.reading.totalCents).toBe(125_090);
    expect(r.ok && r.reading.itemCount).toBe(4);
  });

  it('nunca devolve CPF nem nome do consumidor, em nenhum campo nem no JSON', () => {
    const r = parseSefazPage(standardPage({ key: OUT.text, total: '87,40' }), OUT.info);
    expect(r.ok).toBe(true);
    const json = JSON.stringify(r);
    expect(json).not.toContain(CONSUMER_CPF);
    expect(json).not.toContain(CONSUMER_CPF.replace(/\D/g, ''));
    expect(json).not.toContain(CONSUMER_NAME);
    expect(json).not.toContain('FULANO');
    expect(json).not.toContain(OUT.text);
    expect(Object.keys(r.ok ? r.reading : {}).sort()).toEqual(['issuedOn', 'issuerName', 'itemCount', 'totalCents']);
  });

  it('o script e o estilo da página não entram na leitura (valor dentro do script é ignorado)', () => {
    const r = parseSefazPage(standardPage({ key: OUT.text, total: '87,40' }), OUT.info);
    expect(r.ok && r.reading.totalCents).toBe(8_740);
  });

  it('entidades HTML do nome são decodificadas', () => {
    const r = parseSefazPage(standardPage({ key: OUT.text, store: 'PADARIA S&Atilde;O JO&Atilde;O &amp; FILHOS LTDA', total: '12,00' }), OUT.info);
    expect(r.ok && r.reading.issuerName).toBe('Padaria São João & Filhos Ltda');
  });

  it('página sem consumidor identificado e com mês de emissão certo', () => {
    const r = parseSefazPage(standardPage({ key: OUT.text, total: '10,00', withCpf: false, items: 1 }), OUT.info);
    expect(r.ok && r.reading.itemCount).toBe(1);
  });
});

describe('parseSefazPage · outro leiaute (tabela, sem classe do cabeçalho, só "Valor total")', () => {
  it('lê o nome pela linha acima do CNPJ e o valor total', () => {
    const html = tablePage({ store: 'SUPERMERCADO BOA COMPRA S.A.', cnpj: '11.222.333/0001-81', key: OUT.text, issued: '06/10/2026', total: '154,32' });
    const r = parseSefazPage(html, OUT.info);
    expect(r).toEqual({ ok: true, reading: { issuerName: 'Supermercado Boa Compra S.A.', totalCents: 15_432, issuedOn: '2026-10-06', itemCount: null } });
  });

  it('nome e CNPJ na mesma linha', () => {
    const html = `<div>FARMACIA EXEMPLO LTDA CNPJ: 11.222.333/0001-81</div><div>Valor a pagar R$ 23,90</div><div>Emissão: 05/10/2026 09:00</div>`;
    const r = parseSefazPage(html, OUT.info);
    expect(r).toEqual({ ok: true, reading: { issuerName: 'Farmacia Exemplo Ltda', totalCents: 2_390, issuedOn: '2026-10-05', itemCount: null } });
  });

  it('nome que já está em minúsculas fica como está; campos ausentes ficam null', () => {
    const r = parseSefazPage(`<div class="txtTopo">Casa do Pão</div><p>Emissão: 02/10/2026</p>`, OUT.info);
    expect(r).toEqual({ ok: true, reading: { issuerName: 'Casa do Pão', totalCents: null, issuedOn: '2026-10-02', itemCount: null } });
  });
});

describe('parseSefazPage · páginas que não servem', () => {
  it('vazia ou fora do esperado', () => {
    expect(parseSefazPage('', OUT.info)).toEqual({ ok: false, code: 'pagina_vazia' });
    expect(parseSefazPage('   \n ', OUT.info)).toEqual({ ok: false, code: 'pagina_vazia' });
    expect(parseSefazPage(undefined as unknown as string, OUT.info)).toEqual({ ok: false, code: 'pagina_vazia' });
    expect(parseSefazPage('<html><body><p>Olá</p></body></html>', OUT.info)).toEqual({ ok: false, code: 'pagina_nao_reconhecida' });
    expect(parseSefazPage(`<p>${'x'.repeat(1_500_001)}</p>`, OUT.info)).toEqual({ ok: false, code: 'pagina_nao_reconhecida' });
  });

  it('nota não encontrada e captcha', () => {
    expect(parseSefazPage(NOT_FOUND_PAGE, OUT.info)).toEqual({ ok: false, code: 'nota_nao_encontrada' });
    expect(parseSefazPage(CAPTCHA_PAGE, OUT.info)).toEqual({ ok: false, code: 'pagina_nao_reconhecida' });
  });

  it('página de outra nota: chave diferente, CNPJ diferente ou mês de emissão diferente', () => {
    const other = keyOf('2610', '000099999');
    expect(parseSefazPage(standardPage({ key: other.text, total: '10,00' }), OUT.info)).toEqual({ ok: false, code: 'nota_diferente' });
    expect(parseSefazPage(standardPage({ key: OUT.text, cnpj: '45.723.174/0001-10', total: '10,00' }), OUT.info)).toEqual({ ok: false, code: 'nota_diferente' });
    expect(parseSefazPage(standardPage({ key: OUT.text, issued: '06/09/2026 10:00:00', total: '10,00' }), OUT.info)).toEqual({ ok: false, code: 'nota_diferente' });
  });

  it('valores absurdos são ignorados (zero e acima do limite do app)', () => {
    const r = parseSefazPage(`<div class="txtTopo">LOJA X</div><div>Valor a pagar R$: 0,00</div><div>Valor total R$: 99.999.999.999,99</div>`, OUT.info);
    expect(r.ok && r.reading.totalCents).toBe(null);
  });
});

describe('factsWithPage e o rascunho', () => {
  it('a página completa o que o QR não trazia: nome, valor e dia', () => {
    const qr = parseNfceQr(OFFICIAL);
    expect(qr.ok).toBe(true);
    if (!qr.ok) return;
    const facts = factsFromQr(qr.qr, OFFICIAL);
    const before = receiptDraft(facts, '2026-10-09');
    expect(before.amountCents).toBeNull();
    const page = parseSefazPage(standardPage({ key: OUT.text, total: '87,40', issued: '06/10/2026 14:32:10' }), OUT.info);
    expect(page.ok).toBe(true);
    if (!page.ok) return;
    const draft = receiptDraft(factsWithPage(facts, page.reading), '2026-10-09');
    expect(draft.amountCents).toBe(8_740);
    expect(draft.occurredOn).toBe('2026-10-06');
    expect(draft.needsDay).toBe(false);
    expect(draft.issuerName).toBe('Mercado Exemplo Ltda');
    expect(draft.summary).toBe('Nota fiscal do RJ, emitida em 06/10/2026');
    expect(draft.receiptKey).toBe(before.receiptKey);
    // O endereço oficial (só para abrir a página) leva a chave no próprio endereço; o resto do rascunho nunca a traz.
    expect(JSON.stringify({ ...draft, officialUrl: null })).not.toContain(OUT.text);
  });

  it('o que a página não traz fica como estava', () => {
    const qr = parseNfceQr(OFFICIAL);
    if (!qr.ok) throw new Error('qr');
    const facts = factsFromQr(qr.qr, OFFICIAL);
    const merged = factsWithPage(facts, { issuerName: null, totalCents: null, issuedOn: null, itemCount: null });
    expect(merged.totalCents).toBeNull();
    expect(merged.issuedOn).toBeNull();
    expect(merged.issuerName).toBeNull();
    expect(merged.key).toBe(facts.key);
  });
});

describe('canReadSefazPage', () => {
  const draftOf = (url: string) => {
    const qr = parseNfceQr(url);
    if (!qr.ok) throw new Error('qr');
    return receiptDraft(factsFromQr(qr.qr, url), '2026-10-09');
  };

  it('NFC-e do RJ com o endereço oficial pode ser lida', () => {
    expect(canReadSefazPage(draftOf(OFFICIAL))).toBe(true);
  });

  it('RJ com domínio antigo ou fora do oficial não: nem o botão aparece', () => {
    const old = `https://www4.fazenda.rj.gov.br/consultaNFCe/QRCode?p=${OUT.text}|2|1|1|ABCDEF0123456789ABCDEF0123456789ABCDEF01`;
    expect(canReadSefazPage(draftOf(old))).toBe(false);
  });

  it('outro estado só tem o botão "Ver a nota", sem leitura automática', () => {
    const sp = keyOf('2610', '000012345', '35');
    const url = `https://www.nfce.fazenda.sp.gov.br/qrcode?p=${sp.text}|2|1|1|ABCDEF0123456789ABCDEF0123456789ABCDEF01`;
    const draft = draftOf(url);
    expect(draft.officialUrl).not.toBeNull();
    expect(canReadSefazPage(draft)).toBe(false);
  });

  it('NF-e (modelo 55), chave sem QR e nota de exemplo (teste) não', () => {
    const nfe = keyOf('2610');
    const model55 = { uf: 'RJ' as const, model: '55' as const, officialUrl: OFFICIAL, testNote: null };
    expect(canReadSefazPage(model55)).toBe(false);
    expect(canReadSefazPage({ uf: 'RJ', model: '65', officialUrl: null, testNote: null })).toBe(false);
    const example = draftOf(exampleReceiptQr('2026-10'));
    expect(example.testNote).not.toBeNull();
    expect(canReadSefazPage(example)).toBe(false);
    expect(nfe.info.model).toBe('65');
  });
});

describe('readSefazPage (fetch injetado)', () => {
  const okHtml = standardPage({ key: OUT.text, total: '87,40', issued: '06/10/2026 14:32:10' });
  const fetchOf = (html: string, extra: Partial<{ ok: boolean; status: number; url: string }> = {}): SefazFetch =>
    vi.fn(async () => ({ ok: true, status: 200, url: OFFICIAL, text: async () => html, ...extra }));

  it('busca o endereço oficial sem credenciais e lê a página', async () => {
    const f = fetchOf(okHtml);
    const r = await readSefazPage(f, OFFICIAL, OUT.info);
    expect(r).toEqual({ ok: true, reading: { issuerName: 'Mercado Exemplo Ltda', totalCents: 8_740, issuedOn: '2026-10-06', itemCount: 3 } });
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = (f as ReturnType<typeof vi.fn>).mock.calls[0] as [string, { method: string; credentials: string; headers: Record<string, string> }];
    expect(url).toBe(OFFICIAL);
    expect(init.method).toBe('GET');
    expect(init.credentials).toBe('omit');
    expect(Object.keys(init.headers)).toEqual(['Accept']);
  });

  it('recusa endereço que não é o oficial do RJ, sem nem chamar a rede', async () => {
    const f = fetchOf(okHtml);
    for (const bad of [
      `https://www4.fazenda.rj.gov.br/consultaNFCe/QRCode?p=${OUT.text}`,
      `https://nota-de-exemplo.invalid/consultaNFCe/QRCode?p=${OUT.text}`,
      `https://exemplo.com.br/consultaNFCe/QRCode?p=${OUT.text}`,
      `http://user:senha@consultadfe.fazenda.rj.gov.br/x?p=1`,
      'consultadfe.fazenda.rj.gov.br',
    ]) {
      expect(await readSefazPage(f, bad, OUT.info)).toEqual({ ok: false, code: 'endereco_invalido' });
    }
    expect(f).not.toHaveBeenCalled();
    expect(EXAMPLE_RECEIPT_HOST).toBe('nota-de-exemplo.invalid');
  });

  it('resposta com erro, redirecionamento para outro domínio, falha de rede e página de outra nota', async () => {
    expect(await readSefazPage(fetchOf(okHtml, { ok: false, status: 503 }), OFFICIAL, OUT.info)).toEqual({ ok: false, code: 'resposta_invalida' });
    expect(await readSefazPage(fetchOf(okHtml, { url: 'https://phishing.example/x' }), OFFICIAL, OUT.info)).toEqual({ ok: false, code: 'resposta_invalida' });
    const down: SefazFetch = async () => {
      throw new TypeError('Network request failed');
    };
    expect(await readSefazPage(down, OFFICIAL, OUT.info)).toEqual({ ok: false, code: 'sem_conexao' });
    const readFails: SefazFetch = async () => ({ ok: true, status: 200, text: async () => Promise.reject(new Error('corpo')) });
    expect(await readSefazPage(readFails, OFFICIAL, OUT.info)).toEqual({ ok: false, code: 'sem_conexao' });
    const other = keyOf('2610', '000099999');
    expect(await readSefazPage(fetchOf(standardPage({ key: other.text })), OFFICIAL, OUT.info)).toEqual({ ok: false, code: 'nota_diferente' });
    expect(await readSefazPage(fetchOf(CAPTCHA_PAGE), OFFICIAL, OUT.info)).toEqual({ ok: false, code: 'pagina_nao_reconhecida' });
  });

  it('tempo limite: a leitura desiste e aborta o pedido', async () => {
    vi.useFakeTimers();
    try {
      let aborted = false;
      const slow: SefazFetch = (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            aborted = true;
            reject(new Error('abort'));
          });
        });
      const pending = readSefazPage(slow, OFFICIAL, OUT.info);
      await vi.advanceTimersByTimeAsync(SEFAZ_READ_TIMEOUT_MS + 10);
      expect(await pending).toEqual({ ok: false, code: 'tempo_esgotado' });
      expect(aborted).toBe(true);
      const quick = readSefazPage(slow, OFFICIAL, OUT.info, { timeoutMs: 500 });
      await vi.advanceTimersByTimeAsync(600);
      expect(await quick).toEqual({ ok: false, code: 'tempo_esgotado' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('textos das falhas caem no preenchimento manual', () => {
    expect(sefazReadErrorText('tempo_esgotado')).toBe(SEFAZ_TEXT.failed);
    expect(sefazReadErrorText('sem_conexao')).toBe(SEFAZ_TEXT.failed);
    expect(sefazReadErrorText('nota_diferente')).toBe(SEFAZ_TEXT.differentNote);
    expect(sefazReadErrorText('nota_nao_encontrada')).toBe(SEFAZ_TEXT.notFound);
    expect(SEFAZ_TEXT.failed).toBe('Não deu para ler a página da Sefaz. Confira o valor no cupom.');
  });
});

describe('fixtures', () => {
  it('a chave aparece em grupos de 4 na página e continua sendo a da nota', () => {
    expect(spaced(OUT.text).split(' ')).toHaveLength(11);
  });
});
