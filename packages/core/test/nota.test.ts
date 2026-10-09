import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  EXAMPLE_RECEIPT_HOST,
  NOTA_ERROR_TEXT,
  NOTA_TEXT,
  RECEIPT_ERROR_CODES,
  SEFAZ_QR_HOSTS,
  UF_BY_CODE,
  UF_SIGLAS,
  accessKeyCheckDigit,
  cnpjValid,
  exampleReceiptQr,
  factsFromKey,
  factsFromQr,
  findAccessKey,
  formatCnpj,
  friendlyIssuerName,
  noteErrorText,
  officialQueryUrl,
  parseAccessKey,
  parseNfceQr,
  readReceiptCode,
  receiptDraft,
  receiptKeyDigest,
  receiptKeyValid,
  sha256Hex,
  type AccessKeyInfo,
  type UfSigla,
} from '../src';

/**
 * Ajudantes com a conta escrita de outro jeito que a do código (pesos de 2 a 9 repetidos, lidos da direita para a esquerda),
 * para o teste não repetir o código. Os valores de referência conhecidos (CNPJs públicos e o exemplo da Receita do CNPJ
 * alfanumérico) estão nos testes de "valores conhecidos".
 */
function dv11(chars: string): number {
  const values = [...chars].reverse().map((c) => c.charCodeAt(0) - 48);
  let weight = 2;
  let sum = 0;
  for (const v of values) {
    sum += v * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const rest = sum % 11;
  return rest === 0 || rest === 1 ? 0 : 11 - rest;
}

/** CNPJ completo a partir dos 12 primeiros caracteres (números ou letras). */
function makeCnpj(base12: string): string {
  const d1 = dv11(base12);
  const d2 = dv11(base12 + d1);
  return `${base12}${d1}${d2}`;
}

interface KeyParts {
  uf?: string;
  aamm?: string;
  cnpj?: string;
  model?: string;
  series?: number;
  number?: number;
  tpEmis?: number;
  code?: string;
}

/** Chave de 44 caracteres com o dígito verificador certo. */
function makeKey(p: KeyParts = {}): string {
  const body =
    (p.uf ?? '33') +
    (p.aamm ?? '2610') +
    (p.cnpj ?? makeCnpj('123456780001')) +
    (p.model ?? '65') +
    String(p.series ?? 1).padStart(3, '0') +
    String(p.number ?? 12345).padStart(9, '0') +
    String(p.tpEmis ?? 1) +
    (p.code ?? '87654321');
  expect(body).toHaveLength(43);
  return body + dv11(body);
}

/** Chave com o último dígito trocado (sempre inválida). */
function breakKey(key: string): string {
  return key.slice(0, 43) + String((Number(key[43]) + 1) % 10);
}

const TODAY = '2026-10-09';
const KEY = makeKey(); // NFC-e do RJ, outubro de 2026
const nodeDigest = (key: string) => createHash('sha256').update(key, 'utf8').digest('hex');
const SPACED = KEY.replace(/(.{4})/g, '$1 ').trim();

describe('chave de acesso', () => {
  it('valores conhecidos: CNPJs públicos e o exemplo da Receita para CNPJ alfanumérico', () => {
    expect(cnpjValid('11222333000181')).toBe(true);
    expect(cnpjValid('00000000000191')).toBe(true); // Banco do Brasil
    expect(cnpjValid('11222333000182')).toBe(false);
    // Exemplo da Receita Federal (12.ABC.345/01DE): primeiro dígito 3, segundo 5.
    expect(cnpjValid('12ABC34501DE35')).toBe(true);
    expect(cnpjValid('12ABC34501DE34')).toBe(false);
    expect(makeCnpj('12ABC34501DE')).toBe('12ABC34501DE35');
    expect(makeCnpj('112223330001')).toBe('11222333000181');
    // Sequências repetidas passam na conta mas não são CNPJ.
    expect(cnpjValid('00000000000000')).toBe(false);
    expect(cnpjValid('11111111111111')).toBe(false);
    expect(cnpjValid('1122233300018')).toBe(false);
    expect(formatCnpj('11222333000181')).toBe('11.222.333/0001-81');
    expect(formatCnpj('12ABC34501DE35')).toBe('12.ABC.345/01DE-35');
  });

  it('lê UF, mês, CNPJ, modelo, série e número', () => {
    const r = parseAccessKey(KEY);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.info).toEqual({
      key: KEY,
      digest: nodeDigest(KEY),
      uf: 'RJ',
      yearMonth: '2026-10',
      cnpj: '12345678000195',
      cnpjFormatted: '12.345.678/0001-95',
      model: '65',
      series: 1,
      number: 12345,
      emissionType: 1,
    });
    const nfe = parseAccessKey(makeKey({ uf: '35', aamm: '2607', model: '55', series: 12, number: 987654321, tpEmis: 9 }));
    expect(nfe.ok && nfe.info).toMatchObject({ uf: 'SP', yearMonth: '2026-07', model: '55', series: 12, number: 987654321, emissionType: 9 });
  });

  it('o dígito verificador usa módulo 11 com pesos de 2 a 9 (resto 0 ou 1 dá 0)', () => {
    expect(accessKeyCheckDigit(KEY.slice(0, 43))).toBe(Number(KEY[43]));
    // Varre números de nota: o código e a conta de referência concordam, inclusive nos restos 0 e 1.
    const seen = new Set<number>();
    for (let n = 1; n <= 400; n++) {
      const k = makeKey({ number: n });
      seen.add(Number(k[43]));
      expect(accessKeyCheckDigit(k.slice(0, 43))).toBe(Number(k[43]));
      expect(parseAccessKey(k).ok).toBe(true);
      expect(parseAccessKey(breakKey(k))).toEqual({ ok: false, code: 'digito_invalido' });
    }
    expect([...seen].sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('o banco guarda só o resumo SHA-256 da chave: receiptKeyValid confere os 64 hexadecimais, nunca a chave de 44 caracteres', () => {
    for (let n = 1; n <= 200; n++) {
      const k = makeKey({ number: n * 7, code: String(10000000 + n * 13) });
      const digest = receiptKeyDigest(k);
      expect(digest).toBe(nodeDigest(k));
      expect(receiptKeyValid(digest!)).toBe(true);
      // A chave inteira (numérica ou não) nunca é aceita como `receiptKey`.
      expect(receiptKeyValid(k)).toBe(false);
      expect(receiptKeyDigest(breakKey(k))).toBeNull();
    }
    expect(receiptKeyValid('a'.repeat(64))).toBe(true);
    for (const bad of ['', 'A'.repeat(64), 'a'.repeat(63), 'a'.repeat(65), `${'a'.repeat(63)}g`, ` ${'a'.repeat(63)}`, `${'a'.repeat(64)}\n`]) {
      expect(receiptKeyValid(bad), JSON.stringify(bad)).toBe(false);
    }
    expect(receiptKeyValid(null as unknown as string)).toBe(false);
    // Chave com espaços e minúsculas dá o mesmo resumo da chave normalizada.
    expect(receiptKeyDigest(SPACED.toLowerCase())).toBe(nodeDigest(KEY));
    expect(parseAccessKey(KEY).ok && (parseAccessKey(KEY) as { info: AccessKeyInfo }).info.digest).toBe(sha256Hex(KEY));
  });

  it('todas as 27 UFs do código IBGE', () => {
    expect(Object.keys(UF_BY_CODE)).toHaveLength(27);
    expect(UF_SIGLAS).toHaveLength(27);
    for (const [code, uf] of Object.entries(UF_BY_CODE)) {
      const r = parseAccessKey(makeKey({ uf: code }));
      expect(r.ok && r.info.uf).toBe(uf);
    }
    expect(UF_BY_CODE['33']).toBe('RJ');
    expect(UF_BY_CODE['35']).toBe('SP');
    expect(UF_BY_CODE['53']).toBe('DF');
  });

  it('aceita espaços entre os grupos de 4, quebras de linha e minúsculas', () => {
    expect(parseAccessKey(SPACED).ok).toBe(true);
    expect(parseAccessKey(`  ${KEY.slice(0, 22)}\n${KEY.slice(22)}  `).ok).toBe(true);
    const alfa = makeKey({ cnpj: makeCnpj('12ABC34501DE') });
    expect(parseAccessKey(alfa.toLowerCase())).toEqual(parseAccessKey(alfa));
  });

  it('CNPJ alfanumérico: regra oficial (valor = ASCII menos 48; pesos 5 a 2 e 6 a 2), vetores calculados à parte', () => {
    for (const cnpj of ['12ABC34501DE35', 'ABCDEFGH000195', 'Z9Y8X7W6V5U429', 'AAAAAAAA000191', '0A1B2C3D4E5F23', 'ZZZZZZZZZZZZ62', '11222333000181']) {
      expect(cnpjValid(cnpj), cnpj).toBe(true);
    }
    // Dígito errado, letra minúscula, letra no lugar dos dígitos verificadores, tamanho errado.
    for (const cnpj of ['12ABC34501DE36', 'ABCDEFGH000196', '12abc34501de35', '12ABC34501DEAB', '12ABC34501DE3', '12ABC34501DE355', '12ABC3450-DE35']) {
      expect(cnpjValid(cnpj), cnpj).toBe(false);
    }
    // A chave do exemplo da auditoria, lida de ponta a ponta: escaneia, mostra o CNPJ e gera o resumo que o banco aceita.
    const real = '35261012ABC34501DE35550010000001251000000035';
    const read = readReceiptCode(real);
    expect(read.ok && read.key.cnpjFormatted).toBe('12.ABC.345/01DE-35');
    const draft = receiptDraft(factsFromKey((read as { key: AccessKeyInfo }).key), TODAY);
    expect(draft.description).toBe('Compra (CNPJ 12.ABC.345/01DE-35)');
    expect(draft.receiptKey).toBe(nodeDigest(real));
    expect(receiptKeyValid(draft.receiptKey)).toBe(true);
    expect(receiptKeyDigest(real.toLowerCase())).toBe(nodeDigest(real));
    // O colado com grupos de 4 e a chave pelo link do QR dão o mesmo resumo.
    expect(receiptKeyDigest(real.replace(/(.{4})/g, '$1 '))).toBe(nodeDigest(real));
    const viaQr = readReceiptCode(`https://exemplo.test/qr?p=${real}|2|1|1|ABC`);
    expect(viaQr.ok && viaQr.key.digest).toBe(nodeDigest(real));
  });

  it('chave com CNPJ alfanumérico (NT 2025.001): letras só nas 12 primeiras posições do CNPJ', () => {
    const k = makeKey({ cnpj: '12ABC34501DE35', aamm: '2610' });
    expect(k.slice(6, 20)).toBe('12ABC34501DE35');
    const r = parseAccessKey(k);
    expect(r.ok && r.info.cnpj).toBe('12ABC34501DE35');
    expect(r.ok && r.info.cnpjFormatted).toBe('12.ABC.345/01DE-35');
    // O dígito verificador da chave vale ASCII menos 48 para cada letra (A = 17).
    expect(accessKeyCheckDigit(k.slice(0, 43))).toBe(Number(k[43]));
    expect(parseAccessKey(breakKey(k))).toEqual({ ok: false, code: 'digito_invalido' });
    // Letra fora do CNPJ não é chave.
    expect(parseAccessKey(KEY.slice(0, 30) + 'A' + KEY.slice(31))).toEqual({ ok: false, code: 'chave_invalida' });
    // CNPJ alfanumérico com dígito verificador errado.
    expect(parseAccessKey(makeKey({ cnpj: '12ABC34501DE34' }))).toEqual({ ok: false, code: 'cnpj_invalido' });
  });

  it('recusa com o código certo e na ordem: forma, dígito, UF, mês e ano, CNPJ, modelo', () => {
    const cases: [string, string][] = [
      ['', 'chave_invalida'],
      [KEY.slice(0, 43), 'chave_invalida'],
      [KEY + '0', 'chave_invalida'],
      ['A'.repeat(44), 'chave_invalida'],
      [KEY.slice(0, 43) + 'X', 'chave_invalida'],
      [breakKey(KEY), 'digito_invalido'],
      [makeKey({ uf: '10' }), 'uf_invalida'],
      [makeKey({ uf: '34' }), 'uf_invalida'],
      [makeKey({ uf: '99' }), 'uf_invalida'],
      [makeKey({ aamm: '2613' }), 'data_invalida'],
      [makeKey({ aamm: '2600' }), 'data_invalida'],
      [makeKey({ aamm: '0501' }), 'data_invalida'],
      [makeKey({ cnpj: '12345678000196' }), 'cnpj_invalido'],
      [makeKey({ cnpj: '00000000000000' }), 'cnpj_invalido'],
      [makeKey({ model: '57' }), 'modelo_nao_suportado'],
      [makeKey({ model: '58' }), 'modelo_nao_suportado'],
      [makeKey({ model: '59' }), 'modelo_nao_suportado'],
    ];
    for (const [input, code] of cases) expect(parseAccessKey(input), input).toEqual({ ok: false, code });
    // Ordem: UF inválida e modelo inválido juntos → UF primeiro.
    expect(parseAccessKey(makeKey({ uf: '99', model: '57' }))).toEqual({ ok: false, code: 'uf_invalida' });
    expect(parseAccessKey(undefined as unknown as string)).toEqual({ ok: false, code: 'chave_invalida' });
  });

  it('emitente pessoa física (000 + CPF): vale, mas o CPF nunca aparece no resultado', () => {
    const cpf = '52998224725'; // CPF de teste com dígitos verificadores válidos
    const k = makeKey({ cnpj: `000${cpf}`, model: '55' });
    const r = parseAccessKey(k);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.info.cnpj).toBeNull();
    expect(r.info.cnpjFormatted).toBeNull();
    // A chave inteira contém o CPF (é o que a pessoa leu da nota; só em memória), mas nenhum outro campo o repete.
    const { key: _key, ...others } = r.info;
    expect(JSON.stringify(others)).not.toContain(cpf);
    const draft = receiptDraft(factsFromKey(r.info), TODAY);
    expect(draft.description).toBe('Compra');
    expect(draft.issuerCnpj).toBeNull();
    // O que vai para o registro é o resumo da chave: serve para o aviso de nota repetida e não contém o CPF nem a chave.
    expect(draft.receiptKey).toBe(nodeDigest(k));
    expect(draft.receiptKey).toMatch(/^[0-9a-f]{64}$/);
    expect(receiptKeyValid(draft.receiptKey)).toBe(true);
    expect(JSON.stringify(draft)).not.toContain(cpf);
    expect(JSON.stringify(draft)).not.toContain(k);
    expect(receiptKeyValid(k)).toBe(false);
    // O caso da auditoria (chave real de pessoa física lida de ponta a ponta).
    const pf = readReceiptCode('33261000052998224725550010000001241000000026');
    expect(pf.ok).toBe(true);
    const pfDraft = receiptDraft(factsFromKey((pf as { key: AccessKeyInfo }).key), TODAY);
    expect(pfDraft.receiptKey).toBe(nodeDigest('33261000052998224725550010000001241000000026'));
    expect(JSON.stringify(pfDraft)).not.toContain('52998224725');
    // "000" + 11 dígitos que não são CPF válido continua sendo CNPJ inválido.
    expect(parseAccessKey(makeKey({ cnpj: '00052998224726' }))).toEqual({ ok: false, code: 'cnpj_invalido' });
  });

  it('findAccessKey: chave em grupos de 4, preferindo a que vem depois do rótulo', () => {
    const referenced = makeKey({ number: 999, model: '55' });
    const text = `NF-e referenciada ${referenced}\nCHAVE DE ACESSO\n${SPACED}\nOutro texto 123`;
    const first = findAccessKey(text);
    expect(first.ok && first.info.key).toBe(referenced);
    const labelled = findAccessKey(text, /CHAVE DE ACESSO/i);
    expect(labelled.ok && labelled.info.key).toBe(KEY);
    // Número colado antes não atrapalha: a busca tenta cada ponto de partida.
    const mixed = findAccessKey(`Nº 000.123 12345 ${SPACED}`);
    expect(mixed.ok && mixed.info.key).toBe(KEY);
    expect(findAccessKey('nada aqui, só 12 números 123456789012')).toEqual({ ok: false, code: 'chave_nao_encontrada' });
    expect(findAccessKey(`CHAVE ${breakKey(KEY)}`)).toEqual({ ok: false, code: 'digito_invalido' });
    expect(findAccessKey(makeKey({ model: '57' }))).toEqual({ ok: false, code: 'modelo_nao_suportado' });
    // Uma válida vence uma inválida no mesmo texto.
    const both = findAccessKey(`${breakKey(KEY)} ${KEY}`);
    expect(both.ok && both.info.key).toBe(KEY);
  });
});

describe('chave colada em texto de extrator de PDF', () => {
  it('rótulo colado no começo da chave e texto colado no fim', () => {
    const glued = findAccessKey(`CHAVE DE ACESSO${SPACED.replace(/ /g, ' ')}NATUREZA DA OPERAÇÃO`);
    expect(glued.ok && glued.info.key).toBe(KEY);
    const noSpaces = findAccessKey(`Chave de acesso${KEY}NATUREZA DA OPERAÇÃOVENDA`);
    expect(noSpaces.ok && noSpaces.info.key).toBe(KEY);
    const prefixed = findAccessKey(`código NFe${KEY}`);
    expect(prefixed.ok && prefixed.info.key).toBe(KEY);
    // O índice aponta para o primeiro número da chave, não para as letras coladas.
    const text = `CHAVE DE ACESSO${SPACED}`;
    const found = findAccessKey(text);
    expect(found.ok && text.slice(found.index, found.index + 4)).toBe(KEY.slice(0, 4));
  });

  it('número maior que a chave não é chave, nem com letras mais adiante', () => {
    expect(findAccessKey(`${KEY}7`)).toEqual({ ok: false, code: 'chave_nao_encontrada' });
    expect(findAccessKey(`${KEY}7 NATUREZA`)).toEqual({ ok: false, code: 'chave_nao_encontrada' });
    expect(findAccessKey(`1${KEY}`)).toEqual({ ok: false, code: 'chave_nao_encontrada' });
  });

  it('chave com CNPJ alfanumérico em grupos de 4 que começam por letra continua inteira', () => {
    const key = makeKey({ cnpj: makeCnpj('12ABC3450001') });
    const grouped = key.replace(/(.{4})/g, '$1 ').trim();
    expect(grouped).toMatch(/ [A-Z]+\d/);
    const found = findAccessKey(`CHAVE DE ACESSO${grouped}\nDATA`);
    expect(found.ok && found.info.key).toBe(key);
  });
});

describe('QR da NFC-e', () => {
  const base = 'https://consultadfe.fazenda.rj.gov.br/consultaNFCe/QRCode';
  const hash40 = '80dad6277b4c88de22b025528a596aea9be5b43b';

  it('versão 2 online: chave|2|ambiente|id do CSC|hash (só a chave e o mês)', () => {
    const r = parseNfceQr(`${base}?p=${KEY}|2|1|1|${hash40}`);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.qr).toMatchObject({ layout: 'v2', version: 2, environment: 'producao', contingency: false, issuedOn: null, totalCents: null });
    expect(r.qr.key.uf).toBe('RJ');
    expect(r.qr.key.yearMonth).toBe('2026-10');
  });

  it('versão 2 com a barra vertical codificada (%7C) e parâmetros extras', () => {
    const encoded = `https://www.nfce.fazenda.sp.gov.br/NFCeConsultaPublica/Paginas/ConsultaQRCode.aspx?x=1&p=${makeKey({ uf: '35' })}%7C2%7C1%7C1%7C${hash40}#topo`;
    const r = parseNfceQr(encoded);
    expect(r.ok && r.qr.key.uf).toBe('SP');
    expect(r.ok && r.qr.layout).toBe('v2');
  });

  it('versão 2 em contingência: dia da emissão, valor total e digest', () => {
    const r = parseNfceQr(`${base}?p=${KEY}|2|1|07|87.40|bXlkaWdlc3Q=|1|${hash40}`);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.qr).toMatchObject({ layout: 'v2', contingency: true, issuedOn: '2026-10-07', totalCents: 8740 });
  });

  it('versão 3: online só com chave, versão e ambiente', () => {
    const r = parseNfceQr(`${base}?p=${KEY}|3|1`);
    expect(r.ok && r.qr).toMatchObject({ layout: 'v3', version: 3, environment: 'producao', contingency: false, issuedOn: null, totalCents: null });
  });

  it('versão 3 em contingência: o CPF do destinatário é ignorado, nunca devolvido', () => {
    const cpf = '52998224725';
    const sig = 'QUJDREVGR0g/+=';
    const withCpf = parseNfceQr(`${base}?p=${KEY}|3|1|09|1234.5|2|${cpf}|${sig}`);
    expect(withCpf.ok).toBe(true);
    if (!withCpf.ok) return;
    expect(withCpf.qr).toMatchObject({ layout: 'v3', contingency: true, issuedOn: '2026-10-09', totalCents: 123450 });
    expect(JSON.stringify(withCpf.qr)).not.toContain(cpf);
    expect(JSON.stringify(withCpf.qr)).not.toContain(sig);
    // Sem destinatário os dois campos vêm vazios.
    const without = parseNfceQr(`${base}?p=${KEY}|3|1|09|10|||${sig}`);
    expect(without.ok && without.qr).toMatchObject({ contingency: true, issuedOn: '2026-10-09', totalCents: 1000 });
    // Estrangeiro: tipo 3 e identificação vazia.
    expect(parseNfceQr(`${base}?p=${KEY}|3|1|09|10|3||${sig}`).ok).toBe(true);
  });

  it('dia que não existe no mês da chave, valor zero ou fora do limite: não preenche', () => {
    const feb = makeKey({ aamm: '2602' });
    const bad = parseNfceQr(`${base}?p=${feb}|2|1|30|87.40|x|1|${hash40}`);
    expect(bad.ok && bad.qr.issuedOn).toBeNull();
    expect(bad.ok && bad.qr.totalCents).toBe(8740);
    const zero = parseNfceQr(`${base}?p=${KEY}|2|1|07|0.00|x|1|${hash40}`);
    expect(zero.ok && zero.qr.totalCents).toBeNull();
    const huge = parseNfceQr(`${base}?p=${KEY}|2|1|07|99999999999.00|x|1|${hash40}`);
    expect(huge.ok && huge.qr.totalCents).toBeNull();
    const nodate = parseNfceQr(`${base}?p=${KEY}|2|1|7|87,4|x|1|${hash40}`);
    expect(nodate.ok && nodate.qr.issuedOn).toBeNull();
    expect(nodate.ok && nodate.qr.totalCents).toBe(8740);
  });

  it('versão antiga com parâmetros nomeados: chNFe, vNF e dhEmi em hexadecimal; cDest ignorado', () => {
    const cpf = '52998224725';
    const hex = (s: string) => [...s].map((c) => c.charCodeAt(0).toString(16)).join('');
    const key = makeKey({ aamm: '2611' });
    const url = `http://www.sefaz.mt.gov.br/nfce/consultanfce?chNFe=${key}&nVersao=100&tpAmb=1&cDest=${cpf}&dhEmi=${hex('2026-11-25T09:35:44-03:00')}&vNF=15.00&vICMS=0.00&digVal=abc&cIdToken=000001&cHashQRCode=${hash40}`;
    const r = parseNfceQr(url);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.qr).toMatchObject({ layout: 'nomeado', version: 100, environment: 'producao', issuedOn: '2026-11-25', totalCents: 1500 });
    expect(JSON.stringify(r.qr)).not.toContain(cpf);
    // dhEmi em texto ISO também vale; data fora do mês da chave não vale.
    const iso = parseNfceQr(`http://x.gov.br/q?chNFe=${key}&dhEmi=2026-11-03T10:00:00-03:00&vNF=1.5`);
    expect(iso.ok && iso.qr.issuedOn).toBe('2026-11-03');
    expect(iso.ok && iso.qr.totalCents).toBe(150);
    const other = parseNfceQr(`http://x.gov.br/q?chNFe=${key}&dhEmi=2026-12-03T10:00:00-03:00`);
    expect(other.ok && other.qr.issuedOn).toBeNull();
    // Nome do parâmetro sem diferenciar maiúsculas.
    expect(parseNfceQr(`http://x.gov.br/q?CHNFE=${key}`).ok).toBe(true);
  });

  it('homologação e versão futura', () => {
    const test = parseNfceQr(`${base}?p=${KEY}|2|2|1|${hash40}`);
    expect(test.ok && test.qr.environment).toBe('homologacao');
    const future = parseNfceQr(`${base}?p=${KEY}|9|1|abc`);
    expect(future.ok && future.qr).toMatchObject({ layout: 'outro', version: 9, contingency: false, issuedOn: null, totalCents: null });
  });

  it('aceita só o conteúdo de p, sem endereço', () => {
    const r = parseNfceQr(`${KEY}|2|1|1|${hash40}`);
    expect(r.ok && r.qr.layout).toBe('v2');
  });

  it('inválidos', () => {
    expect(parseNfceQr('')).toEqual({ ok: false, code: 'vazio' });
    expect(parseNfceQr('   ')).toEqual({ ok: false, code: 'vazio' });
    expect(parseNfceQr('https://exemplo.com/pagina')).toEqual({ ok: false, code: 'codigo_nao_reconhecido' });
    expect(parseNfceQr('https://exemplo.com/?q=1')).toEqual({ ok: false, code: 'codigo_nao_reconhecido' });
    expect(parseNfceQr('texto qualquer')).toEqual({ ok: false, code: 'codigo_nao_reconhecido' });
    expect(parseNfceQr(`${base}?p=`)).toEqual({ ok: false, code: 'chave_invalida' });
    expect(parseNfceQr(`${base}?p=${KEY.slice(0, 40)}|2|1|1|x`)).toEqual({ ok: false, code: 'chave_invalida' });
    expect(parseNfceQr(`${base}?p=${breakKey(KEY)}|2|1|1|x`)).toEqual({ ok: false, code: 'digito_invalido' });
    expect(parseNfceQr(`${base}?p=${makeKey({ model: '57' })}|2|1|1|x`)).toEqual({ ok: false, code: 'modelo_nao_suportado' });
    expect(parseNfceQr(`http://x.gov.br/q?chNFe=${breakKey(KEY)}`)).toEqual({ ok: false, code: 'digito_invalido' });
    expect(parseNfceQr('x'.repeat(5000))).toEqual({ ok: false, code: 'codigo_nao_reconhecido' });
    expect(parseNfceQr(null as unknown as string)).toEqual({ ok: false, code: 'codigo_nao_reconhecido' });
    // Percentual quebrado não derruba a leitura.
    expect(parseNfceQr(`${base}?p=${KEY}|2|1|1|%E0%A4%A`).ok).toBe(true);
  });
});

describe('o que a câmera ou a colagem trouxe', () => {
  it('QR (endereço), chave com espaços, pontos, traços e "NFe", e chave dentro de um texto', () => {
    const url = `https://consultadfe.fazenda.rj.gov.br/consultaNFCe/QRCode?p=${KEY}|2|1|1|abc`;
    const qr = readReceiptCode(url);
    expect(qr.ok && qr.source).toBe('qr');
    expect(qr.ok && qr.qr?.layout).toBe('v2');
    for (const text of [KEY, SPACED, `NFe${KEY}`, KEY.replace(/(.{4})/g, '$1.'), KEY.replace(/(.{11})/g, '$1-'), `Minha nota: ${SPACED} obrigado`, ` \n${KEY}\n `]) {
      const r = readReceiptCode(text);
      expect(r.ok, text).toBe(true);
      expect(r.ok && r.source).toBe('chave');
      expect(r.ok && r.key.key).toBe(KEY);
      expect(r.ok && r.qr).toBeNull();
    }
    expect(readReceiptCode(`${KEY}|2|1|1|abc`).ok && (readReceiptCode(`${KEY}|2|1|1|abc`) as { source: string }).source).toBe('qr');
  });

  it('erros: vazio, código estranho, contagem errada, dígito, modelo e endereço de outro site', () => {
    expect(readReceiptCode('')).toEqual({ ok: false, code: 'vazio' });
    expect(readReceiptCode('   ')).toEqual({ ok: false, code: 'vazio' });
    expect(readReceiptCode('ola')).toEqual({ ok: false, code: 'codigo_nao_reconhecido' });
    expect(readReceiptCode('https://exemplo.com')).toEqual({ ok: false, code: 'codigo_nao_reconhecido' });
    expect(readReceiptCode(KEY.slice(0, 40))).toEqual({ ok: false, code: 'chave_invalida' });
    expect(readReceiptCode(`${KEY}12`)).toEqual({ ok: false, code: 'chave_invalida' });
    expect(readReceiptCode(breakKey(KEY))).toEqual({ ok: false, code: 'digito_invalido' });
    expect(readReceiptCode(makeKey({ model: '58' }))).toEqual({ ok: false, code: 'modelo_nao_suportado' });
    expect(readReceiptCode(`https://consultadfe.fazenda.rj.gov.br/x?p=${breakKey(KEY)}|2|1|1|a`)).toEqual({ ok: false, code: 'digito_invalido' });
    expect(readReceiptCode('1'.repeat(5000))).toEqual({ ok: false, code: 'codigo_nao_reconhecido' });
    expect(readReceiptCode(7 as unknown as string)).toEqual({ ok: false, code: 'vazio' });
  });

  it('endereço de outro site que traz uma chave no meio ainda lê a chave (sem confiar no site)', () => {
    const r = readReceiptCode(`https://exemplo.com/nota/${KEY}`);
    // A chave vale pelos dígitos verificadores, não pelo site; sem QR, nenhum endereço do site vai adiante.
    expect(r.ok && r.source).toBe('chave');
    expect(r.ok && r.key.key).toBe(KEY);
    expect(r.ok && r.qr).toBeNull();
    // Chave com dígito errado no mesmo tipo de endereço continua recusada com o motivo.
    expect(readReceiptCode(`https://exemplo.com/nota/${breakKey(KEY)}`)).toEqual({ ok: false, code: 'digito_invalido' });
  });
});

describe('página oficial da Sefaz', () => {
  const rj = 'https://consultadfe.fazenda.rj.gov.br/consultaNFCe/QRCode?p=KEY|2|1|1|abc';

  it('RJ: devolve o endereço do QR quando o domínio é o oficial', () => {
    expect(officialQueryUrl('RJ', rj)).toBe(rj);
    expect(officialQueryUrl('RJ', `  ${rj}  `)).toBe(rj);
    expect(officialQueryUrl('RJ', rj.toUpperCase().replace('HTTPS://CONSULTADFE.FAZENDA.RJ.GOV.BR', 'https://ConsultaDFE.Fazenda.RJ.gov.br'))).toContain('https://consultadfe.fazenda.rj.gov.br/CONSULTANFCE/QRCODE?P=');
    // Sem esquema, usa https; http é mantido; o trecho "#" cai.
    expect(officialQueryUrl('RJ', 'consultadfe.fazenda.rj.gov.br/consultaNFCe/QRCode?p=A|2|1')).toBe('https://consultadfe.fazenda.rj.gov.br/consultaNFCe/QRCode?p=A|2|1');
    expect(officialQueryUrl('RJ', 'http://consultadfe.fazenda.rj.gov.br/consultaNFCe/QRCode?p=A#x')).toBe('http://consultadfe.fazenda.rj.gov.br/consultaNFCe/QRCode?p=A');
  });

  it('recusa domínio de outro lugar, parecido, com usuário, porta, esquema estranho, sem consulta, de outra UF', () => {
    const bad = [
      'https://consultadfe.fazenda.rj.gov.br.exemplo.com/consultaNFCe/QRCode?p=A',
      'https://exemplo.com/consultadfe.fazenda.rj.gov.br/QRCode?p=A',
      'https://exemplo.com/?u=consultadfe.fazenda.rj.gov.br&p=A',
      'https://consultadfe.fazenda.rj.gov.br@exemplo.com/QRCode?p=A',
      'https://exemplo.com@consultadfe.fazenda.rj.gov.br/QRCode?p=A',
      'https://consultadfe.fazenda.rj.gov.br:8443/consultaNFCe/QRCode?p=A',
      'https://consultadfe.fazenda.rj.gov.br\\@exemplo.com/QRCode?p=A',
      'https://exemplo.com\\.consultadfe.fazenda.rj.gov.br/QRCode?p=A',
      'https://www4.fazenda.rj.gov.br/consultaNFCe/QRCode?p=A',
      'https://fazenda.rj.gov.br/consultaNFCe/QRCode?p=A',
      'https://xconsultadfe.fazenda.rj.gov.br/consultaNFCe/QRCode?p=A',
      'https://consultadfe.fazenda.rj.gov.br./consultaNFCe/QRCode?p=A',
      'javascript:alert(1)',
      'ftp://consultadfe.fazenda.rj.gov.br/consultaNFCe/QRCode?p=A',
      'https://consultadfe.fazenda.rj.gov.br/consultaNFCe/QRCode',
      'https://consultadfe.fazenda.rj.gov.br/consultaNFCe/QRCode?',
      'https://consultadfe.fazenda.rj.gov.br/consulta NFCe?p=A',
      'https://consultadfe.fazenda.rj.gov.br/consultaNFCe?p=A B',
      'https://consultadfe.fazenda.rj.gov.br/\nconsultaNFCe?p=A',
      '',
      'KEY',
    ];
    for (const url of bad) expect(officialQueryUrl('RJ', url), url).toBeNull();
    expect(officialQueryUrl('RJ', null)).toBeNull();
    expect(officialQueryUrl('RJ', undefined)).toBeNull();
    expect(officialQueryUrl('RJ', 42 as unknown as string)).toBeNull();
    // Domínio oficial de outra UF não vale para a UF da chave.
    expect(officialQueryUrl('SP', rj)).toBeNull();
    expect(officialQueryUrl('RJ', 'https://www.nfce.fazenda.sp.gov.br/NFCeConsultaPublica/Paginas/ConsultaQRCode.aspx?p=A')).toBeNull();
    expect(officialQueryUrl('SP', 'https://www.nfce.fazenda.sp.gov.br/NFCeConsultaPublica/Paginas/ConsultaQRCode.aspx?p=A')).not.toBeNull();
  });

  it('a lista: domínios bem formados, em minúsculas, sem duplicar, só de UFs reais; RJ presente; estados sem fonte ficam de fora', () => {
    const all = new Set<string>();
    for (const [uf, hosts] of Object.entries(SEFAZ_QR_HOSTS)) {
      expect(UF_SIGLAS).toContain(uf as UfSigla);
      expect(hosts!.length).toBeGreaterThan(0);
      for (const host of hosts!) {
        expect(host).toMatch(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/);
        expect(host).toMatch(/\.gov\.br$/);
        expect(all.has(host), host).toBe(false);
        all.add(host);
        // O domínio funciona para a própria UF.
        expect(officialQueryUrl(uf as UfSigla, `https://${host}/qr?p=A`)).toBe(`https://${host}/qr?p=A`);
      }
    }
    expect(SEFAZ_QR_HOSTS.RJ).toEqual(['consultadfe.fazenda.rj.gov.br']);
    expect(Object.keys(SEFAZ_QR_HOSTS).length).toBeGreaterThanOrEqual(19);
    // Sem confirmação nesta conferência: fora da lista. O botão vem da regra geral (domínio ".gov.br" coerente com a UF), não
    // de um domínio anotado; um ".gov.br" sem a sigla da UF não serve.
    for (const uf of ['AC', 'AP', 'MA', 'SE', 'MT', 'PA', 'PE', 'RR'] as const) {
      expect(SEFAZ_QR_HOSTS[uf], uf).toBeUndefined();
      expect(officialQueryUrl(uf, 'https://exemplo.gov.br/q?p=A')).toBeNull();
      expect(officialQueryUrl(uf, `https://sefaz.${uf.toLowerCase()}.gov.br/q?p=A`)).toBe(`https://sefaz.${uf.toLowerCase()}.gov.br/q?p=A`);
    }
    expect(officialQueryUrl('MT', 'http://www.sefaz.mt.gov.br/nfce/consultanfce?p=A')).toBe('http://www.sefaz.mt.gov.br/nfce/consultanfce?p=A');
    expect(officialQueryUrl('RR', 'https://portalapp.sefaz.rr.gov.br/nfce/servlet/qrcode?p=A')).toBe('https://portalapp.sefaz.rr.gov.br/nfce/servlet/qrcode?p=A');
  });

  it('regra de Enzo para os outros estados: qualquer ".gov.br" coerente com a UF da chave (a lista é a rota preferida)', () => {
    // PE, PA, MT, MA ... não estão na lista e ganham o botão pelo próprio endereço do QR.
    const pe = 'http://nfce.sefaz.pe.gov.br/nfce/consulta?p=26261000052998224725550010000001241000000026|2|1|1|ABC';
    expect(officialQueryUrl('PE', pe)).toBe(pe);
    expect(officialQueryUrl('PA', 'https://app.sefa.pa.gov.br/consulta?p=A')).toBe('https://app.sefa.pa.gov.br/consulta?p=A');
    expect(officialQueryUrl('MA', 'https://sefaz.ma.gov.br/q?p=A')).toBe('https://sefaz.ma.gov.br/q?p=A');
    // Domínio fictício, só para a regra: qualquer host .gov.br com a sigla como rótulo.
    expect(officialQueryUrl('PE', 'https://qualquer.coisa.pe.gov.br/x/y?p=A#frag')).toBe('https://qualquer.coisa.pe.gov.br/x/y?p=A');
    expect(officialQueryUrl('PE', 'https://PE.GOV.BR/x?p=A')).toBe('https://pe.gov.br/x?p=A');
    expect(officialQueryUrl('DF', 'fazenda.df.gov.br/nfce/qrcode?p=A')).toBe('https://fazenda.df.gov.br/nfce/qrcode?p=A');
    // Um estado da lista que muda de endereço não perde o botão até a próxima versão.
    expect(officialQueryUrl('RN', 'https://novo-endereco.rn.gov.br/consultar?p=A')).toBe('https://novo-endereco.rn.gov.br/consultar?p=A');
    expect(officialQueryUrl('SP', 'https://portal.fazenda.sp.gov.br/nfce?p=A')).not.toBeNull();
    // A lista continua valendo, mesmo sem a sigla no domínio.
    expect(officialQueryUrl('SC', 'https://sat.sef.sc.gov.br/nfce/consulta?p=A')).not.toBeNull();
    // Não vale: domínio de outra UF, sem a sigla, que não termina em .gov.br, com a sigla só colada a outra palavra ou em outro lugar.
    for (const url of [
      'https://nfce.sefaz.pr.gov.br/q?p=A', // outra UF
      'https://www.nfe.fazenda.gov.br/q?p=A', // federal, sem UF
      'https://sefaz.gov.br/q?p=A',
      'https://gov.br/q?p=A',
      'https://sefaz.pe.com.br/q?p=A', // não é .gov.br
      'https://sefaz.pe.gov.br.exemplo.com/q?p=A',
      'https://exemplo.com/sefaz.pe.gov.br?p=A',
      'https://sefazpe.gov.br/q?p=A', // sigla colada
      'https://pe-sefaz.gov.br/q?p=A',
      'https://sefaz.pe.gov.br:8443/q?p=A', // porta
      'https://usuario@sefaz.pe.gov.br/q?p=A', // usuário
      'https://sefaz..pe.gov.br/q?p=A', // rótulo vazio
      'https://-sefaz.pe.gov.br/q?p=A',
      'https://sefaz-.pe.gov.br/q?p=A',
      'https://.pe.gov.br/q?p=A',
      'ftp://sefaz.pe.gov.br/q?p=A',
      'https://sefaz.pe.gov.br/q', // sem consulta
      'https://sefaz.pe.gov.br/q?p=A B',
    ]) {
      expect(officialQueryUrl('PE', url), url).toBeNull();
    }
    // O RJ é o único com leitura automática: só o domínio confirmado, nenhum outro ".gov.br" do estado.
    expect(officialQueryUrl('RJ', 'https://consultadfe.fazenda.rj.gov.br/consultaNFCe/QRCode?p=A')).not.toBeNull();
    expect(officialQueryUrl('RJ', 'https://www4.fazenda.rj.gov.br/consultaNFCe/QRCode?p=A')).toBeNull();
    expect(officialQueryUrl('RJ', 'https://sefaz.rj.gov.br/qualquer?p=A')).toBeNull();
    // De ponta a ponta: um QR de PE de domínio fictício dá o botão no rascunho.
    const keyPe = makeKey({ uf: '26' });
    const qrUrl = `https://consulta.fazenda.pe.gov.br/nfce?p=${keyPe}|2|1|1|ABC`;
    const read = readReceiptCode(qrUrl);
    if (!read.ok || !read.qr) throw new Error('QR de PE não lido');
    expect(receiptDraft(factsFromQr(read.qr, qrUrl), TODAY).officialUrl).toBe(qrUrl);
    // O mesmo QR de PE com o domínio de SP: sem botão.
    const spUrl = `https://www.nfce.fazenda.sp.gov.br/qrcode?p=${keyPe}|2|1|1|ABC`;
    const readSp = readReceiptCode(spUrl);
    if (!readSp.ok || !readSp.qr) throw new Error('QR não lido');
    expect(receiptDraft(factsFromQr(readSp.qr, spUrl), TODAY).officialUrl).toBeNull();
    // Nota de teste (homologação) nunca oferece a página de produção.
    const testUrl = `https://consulta.fazenda.pe.gov.br/nfce?p=${keyPe}|2|2|1|ABC`;
    const readTest = readReceiptCode(testUrl);
    if (!readTest.ok || !readTest.qr) throw new Error('QR de teste não lido');
    const testDraft = receiptDraft(factsFromQr(readTest.qr, testUrl), TODAY);
    expect(testDraft.officialUrl).toBeNull();
    expect(testDraft.testNote).toBe(NOTA_TEXT.testNote);
  });

  it('endereços que mudaram: o novo está na lista; os antigos de outros estados passam pela regra geral, o do RJ não', () => {
    // PB: único endereço desde 01/04/2024 (o antigo, receita.pb.gov.br, é um ".gov.br" da PB e a regra geral o aceita se vier no QR).
    expect(SEFAZ_QR_HOSTS.PB).toEqual(['www.sefaz.pb.gov.br']);
    expect(officialQueryUrl('PB', 'http://www.sefaz.pb.gov.br/nfce?p=A|2|1')).toBe('http://www.sefaz.pb.gov.br/nfce?p=A|2|1');
    expect(officialQueryUrl('PB', 'http://www.receita.pb.gov.br/nfce?p=A|2|1')).toBe('http://www.receita.pb.gov.br/nfce?p=A|2|1');
    // RN: domínio SET virou SEFAZ em 2026.
    expect(SEFAZ_QR_HOSTS.RN).toEqual(['nfce.sefaz.rn.gov.br']);
    expect(officialQueryUrl('RN', 'https://nfce.sefaz.rn.gov.br/consultarNFCe.aspx?p=A|2|1')).not.toBeNull();
    expect(officialQueryUrl('RN', 'https://nfce.set.rn.gov.br/portalDFE/NFCe/ConsultaNFCe.aspx?p=A')).not.toBeNull();
    // MG: portal SPED desde 2022.
    expect(SEFAZ_QR_HOSTS.MG).toEqual(['portalsped.fazenda.mg.gov.br']);
    expect(officialQueryUrl('MG', 'https://portalsped.fazenda.mg.gov.br/portalnfce/sistema/qrcode.xhtml?p=A|2|1')).not.toBeNull();
    expect(officialQueryUrl('MG', 'http://nfce.fazenda.mg.gov.br/portalnfce/sistema/qrcode.xhtml?p=A')).not.toBeNull();
    // GO: endereço novo (IT 2025.003).
    expect(officialQueryUrl('GO', 'https://nfeweb.sefaz.go.gov.br/nfeweb/sites/nfce/danfeNFCe?p=A|2|1')).not.toBeNull();
    // TO: a versão 1.0 do QR, em apps.
    expect(officialQueryUrl('TO', 'http://apps.sefaz.to.gov.br/portal-nfce/qrcodeNFCe?p=A')).not.toBeNull();
    // RJ: o endereço antigo deixou de valer de propósito (só o confirmado).
    expect(officialQueryUrl('RJ', 'https://www4.fazenda.rj.gov.br/consultaNFCe/QRCode?p=A')).toBeNull();
  });
});

describe('rascunho do registro', () => {
  const info = (key: string): AccessKeyInfo => {
    const r = parseAccessKey(key);
    if (!r.ok) throw new Error(r.code);
    return r.info;
  };

  it('QR online do mês atual: data de hoje, valor e descrição com o CNPJ', () => {
    const d = receiptDraft(factsFromKey(info(KEY)), TODAY);
    expect(d).toMatchObject({
      receiptKey: nodeDigest(KEY),
      uf: 'RJ',
      model: '65',
      description: 'Compra (CNPJ 12.345.678/0001-95)',
      amountCents: null,
      occurredOn: TODAY,
      needsDay: false,
      month: '2026-10',
      issuerCnpj: '12.345.678/0001-95',
      issuerName: null,
      summary: 'Nota fiscal do RJ, emitida em outubro de 2026',
      officialUrl: null,
      testNote: null,
      futureNote: null,
    });
    expect(d.receiptKey).not.toContain(KEY);
  });

  it('QR online de outro mês: pede o dia da compra', () => {
    const older = info(makeKey({ aamm: '2608' }));
    const d = receiptDraft(factsFromKey(older), TODAY);
    expect(d.occurredOn).toBeNull();
    expect(d.needsDay).toBe(true);
    expect(d.month).toBe('2026-08');
    expect(d.summary).toBe('Nota fiscal do RJ, emitida em agosto de 2026');
    expect(NOTA_TEXT.chooseDay).toBe('Escolha o dia da compra');
  });

  it('contingência: data e valor do QR; link oficial só para domínio conhecido', () => {
    const url = `https://consultadfe.fazenda.rj.gov.br/consultaNFCe/QRCode?p=${KEY}|2|1|07|87.40|x|1|abc`;
    const qr = parseNfceQr(url);
    if (!qr.ok) throw new Error(qr.code);
    const d = receiptDraft(factsFromQr(qr.qr, url), TODAY);
    expect(d.occurredOn).toBe('2026-10-07');
    expect(d.needsDay).toBe(false);
    expect(d.amountCents).toBe(8740);
    expect(d.summary).toBe('Nota fiscal do RJ, emitida em 07/10/2026');
    expect(d.officialUrl).toBe(url);
    // Domínio desconhecido: sem botão.
    const other = receiptDraft(factsFromQr(qr.qr, 'https://exemplo.com/q?p=A'), TODAY);
    expect(other.officialUrl).toBeNull();
    // Nada de CPF, assinatura nem hash no rascunho.
    expect(JSON.stringify({ ...d, officialUrl: null })).not.toMatch(/abc/);
  });

  it('data da nota depois de hoje ou fora do mês da chave não vale', () => {
    const k = info(KEY);
    expect(receiptDraft({ key: k, issuedOn: '2026-10-20' }, TODAY).occurredOn).toBe(TODAY);
    expect(receiptDraft({ key: k, issuedOn: '2026-09-20' }, TODAY).occurredOn).toBe(TODAY);
    expect(receiptDraft({ key: k, issuedOn: '2026-10-09' }, TODAY).occurredOn).toBe('2026-10-09');
    const aug = info(makeKey({ aamm: '2608' }));
    expect(receiptDraft({ key: aug, issuedOn: '2026-08-31' }, TODAY).occurredOn).toBe('2026-08-31');
    expect(receiptDraft({ key: aug, issuedOn: '2026-10-01' }, TODAY).occurredOn).toBeNull();
  });

  it('mês da chave que ainda não chegou: aviso e pede o dia', () => {
    const d = receiptDraft(factsFromKey(info(makeKey({ aamm: '2611' }))), TODAY);
    expect(d.occurredOn).toBeNull();
    expect(d.needsDay).toBe(true);
    expect(d.futureNote).toBe(NOTA_TEXT.futureMonth);
  });

  it('nota de teste (homologação) avisa', () => {
    const d = receiptDraft({ key: info(KEY), environment: 'homologacao' }, TODAY);
    expect(d.testNote).toBe('Esta é uma nota de teste, sem valor fiscal.');
  });

  it('valor: só entre R$ 0,01 e o limite do app', () => {
    const k = info(KEY);
    expect(receiptDraft({ key: k, totalCents: 1 }, TODAY).amountCents).toBe(1);
    expect(receiptDraft({ key: k, totalCents: 999_999_999 }, TODAY).amountCents).toBe(999_999_999);
    expect(receiptDraft({ key: k, totalCents: 1_000_000_000 }, TODAY).amountCents).toBeNull();
    expect(receiptDraft({ key: k, totalCents: 0 }, TODAY).amountCents).toBeNull();
    expect(receiptDraft({ key: k, totalCents: -5 }, TODAY).amountCents).toBeNull();
  });

  it('nome do emitente: "Compra em <nome>" em formato legível, com até 80 caracteres', () => {
    const k = info(makeKey({ model: '55' }));
    expect(receiptDraft({ key: k, issuerName: 'LOJA EXEMPLO LTDA' }, TODAY).description).toBe('Compra em Loja Exemplo Ltda');
    expect(receiptDraft({ key: k, issuerName: 'Mercado do Zé' }, TODAY).description).toBe('Compra em Mercado do Zé');
    const long = receiptDraft({ key: k, issuerName: 'COMERCIAL DE ALIMENTOS E BEBIDAS DO NORDESTE BRASILEIRO SOCIEDADE ANONIMA DE CAPITAL ABERTO' }, TODAY);
    expect([...long.description].length).toBeLessThanOrEqual(80);
    expect(long.description.startsWith('Compra em Comercial de Alimentos')).toBe(true);
    expect(long.description.endsWith(' ')).toBe(false);
    // Nome vazio ou só CPF cai no CNPJ.
    expect(receiptDraft({ key: k, issuerName: '   ' }, TODAY).description).toBe('Compra (CNPJ 12.345.678/0001-95)');
    expect(receiptDraft({ key: k, issuerName: '123.456.789-09' }, TODAY).description).toBe('Compra (CNPJ 12.345.678/0001-95)');
  });

  it('friendlyIssuerName: caixa, siglas, números e CPF de MEI', () => {
    expect(friendlyIssuerName('MARIA SILVA ME')).toBe('Maria Silva ME');
    expect(friendlyIssuerName('J R DA SILVA & CIA LTDA')).toBe('J R da Silva & CIA Ltda');
    expect(friendlyIssuerName('FARMACIA 24 HORAS S/A')).toBe('Farmacia 24 Horas S/A');
    expect(friendlyIssuerName('JOAO DA SILVA 12345678909')).toBe('Joao da Silva');
    expect(friendlyIssuerName('JOAO DA SILVA 123.456.789-09')).toBe('Joao da Silva');
    expect(friendlyIssuerName("D'AVILA & FILHOS")).toBe("D'Avila & Filhos");
    expect(friendlyIssuerName('Loja do Bairro')).toBe('Loja do Bairro');
    expect(friendlyIssuerName('')).toBe('');
  });

  it('o rascunho nunca devolve o CPF de quem comprou', () => {
    const cpf = '52998224725';
    const url = `https://consultadfe.fazenda.rj.gov.br/consultaNFCe/QRCode?p=${KEY}|3|1|09|10.00|2|${cpf}|c2ln`;
    const qr = parseNfceQr(url);
    if (!qr.ok) throw new Error(qr.code);
    const draft = receiptDraft(factsFromQr(qr.qr, null), TODAY);
    expect(JSON.stringify(draft)).not.toContain(cpf);
  });
});

describe('textos', () => {
  it('mensagem para cada erro de leitura, sem repetir o código nem falar em CPF', () => {
    for (const code of RECEIPT_ERROR_CODES) {
      const text = NOTA_ERROR_TEXT[code];
      expect(text.length).toBeGreaterThan(20);
      expect(noteErrorText(code)).toBe(text);
    }
    expect(noteErrorText('qualquer_outro')).toBe(NOTA_ERROR_TEXT.codigo_nao_reconhecido);
  });

  it('textos como na especificação', () => {
    expect(NOTA_TEXT.scanButton).toBe('Escanear nota fiscal');
    expect(NOTA_TEXT.pasteLabel).toBe('Colar o link ou a chave da nota');
    expect(NOTA_TEXT.pdfButton).toBe('Ler o PDF da nota');
    expect(NOTA_TEXT.viewOnSefaz).toBe('Ver a nota no site da Sefaz');
    expect(NOTA_TEXT.openRecord).toBe('Abrir registro');
    expect(NOTA_TEXT.alreadyNoted('2026-10-12', 'Mercado', 8740)).toBe('Esta nota já foi anotada em 12/10/2026: Mercado, R$ 87,40.');
    expect(NOTA_TEXT.alreadyNotedCard('2026-10-12', 'Mercado', 8740, 'Nubank')).toBe('Esta nota já foi anotada em 12/10/2026 no cartão Nubank: Mercado, R$ 87,40.');
    expect(NOTA_TEXT.summary('RJ', 'outubro de 2026')).toBe('Nota fiscal do RJ, emitida em outubro de 2026');
    expect(NOTA_TEXT.sheet).toEqual({ camera: 'Usar a câmera', pdf: 'Escolher o PDF da nota', paste: 'Colar o link ou a chave' });
    expect(NOTA_TEXT.readAnnounce).toBe('Nota lida');
    expect(NOTA_TEXT.torchHint).toBe('Não achou o código? Use a lanterna ou cole a chave.');
    expect(NOTA_TEXT.installmentsHint).toBe('Comprou no carnê ou crediário? Anotar como parcelamento');
  });

  it('nota de exemplo: QR do RJ do mês, em ambiente de teste e domínio inexistente: nunca aponta para a Sefaz de verdade', () => {
    const qr = exampleReceiptQr('2026-10');
    expect(qr).toMatch(new RegExp(`^https://${EXAMPLE_RECEIPT_HOST.replace(/\./g, '\\.')}/`));
    expect(EXAMPLE_RECEIPT_HOST).toMatch(/\.invalid$/);
    expect(qr).not.toMatch(/fazenda\.rj\.gov\.br|sefaz/i);
    expect(qr).toMatch(/\|2\|2\|1\|/); // versão 2, tpAmb=2 (homologação)
    const read = readReceiptCode(qr);
    expect(read.ok && read.source).toBe('qr');
    if (!read.ok) return;
    expect(read.key.model).toBe('65');
    expect(read.key.uf).toBe('RJ');
    expect(read.key.yearMonth).toBe('2026-10');
    expect(read.key.series).toBe(999);
    expect(read.key.cnpjFormatted).toBe('11.222.333/0001-81');
    expect(parseAccessKey(read.key.key).ok).toBe(true);
    expect(read.qr?.environment).toBe('homologacao');
    expect(officialQueryUrl('RJ', qr)).toBeNull();
    expect(readReceiptCode(qr)).toEqual(read);
    // Outros meses mudam só o mês da chave.
    const jan = readReceiptCode(exampleReceiptQr('2027-01'));
    expect(jan.ok && jan.key.yearMonth).toBe('2027-01');
    const draft = receiptDraft(factsFromQr(read.qr!, qr), '2026-10-09');
    expect(draft.occurredOn).toBe('2026-10-09');
    expect(draft.amountCents).toBeNull();
    // Sem botão da Sefaz e com o aviso de nota de teste; o resumo da chave é o que vai para o registro.
    expect(draft.officialUrl).toBeNull();
    expect(draft.testNote).toBe(NOTA_TEXT.testNote);
    expect(draft.receiptKey).toBe(nodeDigest(read.key.key));
    expect(NOTA_TEXT.example.note).toMatch(/fictícia/);
  });
});
