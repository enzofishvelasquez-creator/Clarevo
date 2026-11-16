import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  EMPTY_DETAILS_DRAFT,
  EMPTY_INVESTMENT_DETAILS,
  PUBLIC_PRICE_TEXT,
  centsToPrice,
  cvmDailyUrl,
  cvmReader,
  formatCnpj,
  formatQuantity,
  formatQuota,
  fundValue,
  investmentDetailsError,
  investmentDetailsErrorText,
  isValidCnpj,
  normalizeCnpj,
  parseQuantityText,
  parseTreasuryLine,
  treasuryReader,
  treasuryValue,
  validateDetailsDraft,
  valueFromQuantity,
  zipFirstEntry,
  type TreasuryPrices,
} from '../src';
import { createPrecosHandler, requestedCnpjs } from '../src/precos/servidor';

// Linhas no formato real dos arquivos (Tesouro Transparente e Informe Diário da CVM, 13/11/2026); valores reais públicos.
const TESOURO_CSV = [
  'Tipo Titulo;Data Vencimento;Data Base;Taxa Compra Manha;Taxa Venda Manha;PU Compra Manha;PU Venda Manha;PU Base Manha',
  'Tesouro Selic;01/03/2029;13/11/2026;0,05;0,06;20279,34;20264,35;20264,35',
  'Tesouro Prefixado;01/01/2028;13/11/2026;14,27;14,39;860,87;859,40;859,40',
  'Tesouro Renda+ Aposentadoria Extra;15/12/2049;13/11/2026;7,58;7,70;2007,14;1982,33;1982,33',
  'Tesouro Selic;01/03/2029;12/11/2026;0,05;0,06;20270,00;20255,00;20255,00',
];
const CVM_CSV = [
  'TP_FUNDO_CLASSE;CNPJ_FUNDO_CLASSE;ID_SUBCLASSE;DT_COMPTC;VL_TOTAL;VL_QUOTA;VL_PATRIM_LIQ;CAPTC_DIA;RESG_DIA;NR_COTST',
  'CLASSES - FIF;00.017.024/0001-53;;2026-11-11;1131424.27;45.360755300000;1228659.83;0.00;0.00;1',
  'CLASSES - FIF;00.017.024/0001-53;;2026-11-12;1131997.93;45.483412400000;1229167.93;0.00;0.00;1',
  'CLASSES - FIF;00.888.897/0001-31;RBMFN1747320951;2026-11-12;10.00;1.230000000000;10.00;0.00;0.00;1',
  'CLASSES - FIF;00.888.897/0001-31;MZMRC1747322915;2026-11-12;10.00;1.510000000000;10.00;0.00;0.00;1',
  'linha;quebrada',
  '',
].join('\r\n');

/** Um zip com um arquivo só (cabeçalho local, como o da CVM: tamanhos no cabeçalho, sem descritor). */
function zipOf(name: string, content: string): Uint8Array {
  const data = deflateRawSync(Buffer.from(content, 'latin1'));
  const nameBytes = Buffer.from(name);
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0, 6);
  header.writeUInt16LE(8, 8);
  header.writeUInt32LE(data.length, 18);
  header.writeUInt32LE(Buffer.byteLength(content, 'latin1'), 22);
  header.writeUInt16LE(nameBytes.length, 26);
  return new Uint8Array(Buffer.concat([header, nameBytes, data, Buffer.from('PK\x01\x02resto do diretorio')]));
}

const noDash = (s: string) => expect(s).not.toMatch(/[–—]/);
const allTexts = (o: unknown): string[] =>
  typeof o === 'string' ? [o] : typeof o === 'function' ? [] : typeof o === 'object' && o !== null ? Object.values(o).flatMap(allTexts) : [];

describe('ficha: quantidade e CNPJ do fundo (D-099, itens 19 e 20)', () => {
  it('CNPJ: numérico e alfanumérico com dígitos verificadores; pontuação e minúsculas aceitas na entrada', () => {
    expect(isValidCnpj('00017024000153')).toBe(true);
    expect(isValidCnpj('12ABC34501DE35')).toBe(true);
    expect(isValidCnpj('00017024000154')).toBe(false);
    expect(isValidCnpj('11111111111111')).toBe(false);
    expect(normalizeCnpj(' 00.017.024/0001-53 ')).toBe('00017024000153');
    expect(normalizeCnpj('12.abc.345/01de-35')).toBe('12ABC34501DE35');
    expect(normalizeCnpj('00.017.024/0001-54')).toBeNull();
    expect(formatCnpj('00017024000153')).toBe('00.017.024/0001-53');
  });

  it('quantidade: até 6 casas, com milhar; zero, letras e 7 casas recusados; volta formatada sem zeros sobrando', () => {
    expect(parseQuantityText('0,53')).toBe(530_000);
    expect(parseQuantityText('1.234,567891')).toBe(1_234_567_891);
    expect(parseQuantityText('12')).toBe(12_000_000);
    expect(parseQuantityText('1234,5')).toBe(1_234_500_000);
    expect(parseQuantityText('0')).toBeNull();
    expect(parseQuantityText('0,1234567')).toBeNull();
    expect(parseQuantityText('1,2,3')).toBeNull();
    expect(parseQuantityText('abc')).toBeNull();
    // Sem vírgula, o ponto é a casa decimal (teclado numérico), menos no milhar bem formado (como no valor em reais).
    expect(parseQuantityText('0.530')).toBe(530_000);
    expect(parseQuantityText('12.5')).toBe(12_500_000);
    expect(parseQuantityText('1.500')).toBe(1_500_000_000);
    expect(parseQuantityText('1.234567')).toBe(1_234_567);
    expect(formatQuantity(530_000)).toBe('0,53');
    expect(formatQuantity(1_234_567_891)).toBe('1.234,567891');
    expect(formatQuantity(12_000_000)).toBe('12');
  });

  it('a ficha: quantidade só em títulos públicos e fundos; CNPJ só em fundos e válido', () => {
    const d = (p: Partial<typeof EMPTY_INVESTMENT_DETAILS>) => ({ ...EMPTY_INVESTMENT_DETAILS, ...p });
    expect(investmentDetailsError('titulos_publicos', d({ quantityMicro: 530_000 }))).toBeNull();
    expect(investmentDetailsError('fundos', d({ quantityMicro: 1, fundCnpj: '00017024000153' }))).toBeNull();
    expect(investmentDetailsError('renda_fixa', d({ quantityMicro: 530_000 }))).toBe('quantidade_invalida');
    expect(investmentDetailsError('fundos', d({ quantityMicro: 0 }))).toBe('quantidade_invalida');
    expect(investmentDetailsError('fundos', d({ quantityMicro: 1.5 }))).toBe('quantidade_invalida');
    expect(investmentDetailsError('titulos_publicos', d({ fundCnpj: '00017024000153' }))).toBe('cnpj_invalido');
    expect(investmentDetailsError('fundos', d({ fundCnpj: '00017024000154' }))).toBe('cnpj_invalido');
    expect(investmentDetailsErrorText('quantidade_invalida')).toBe('Informe uma quantidade válida, como 0,53, com até 6 casas depois da vírgula.');
    expect(investmentDetailsErrorText('cnpj_invalido')).toBe('Confira o CNPJ: os números não batem.');
  });

  it('o rascunho: quantidade e CNPJ lidos, erros nos campos; de outro tipo, caem fora sem erro', () => {
    const ok = validateDetailsDraft('fundos', { ...EMPTY_DETAILS_DRAFT, quantityText: '1.234,5', fundCnpjText: '00.017.024/0001-53' });
    expect(ok).toEqual({ ok: true, details: { ...EMPTY_INVESTMENT_DETAILS, quantityMicro: 1_234_500_000, fundCnpj: '00017024000153' } });
    const bad = validateDetailsDraft('fundos', { ...EMPTY_DETAILS_DRAFT, quantityText: '0', fundCnpjText: '00.017.024/0001-54' });
    expect(bad.ok ? null : bad.errors).toEqual({ quantityText: 'Informe uma quantidade válida, como 0,53, com até 6 casas depois da vírgula.', fundCnpjText: 'Confira o CNPJ: os números não batem.' });
    const other = validateDetailsDraft('renda_fixa', { ...EMPTY_DETAILS_DRAFT, quantityText: '3', fundCnpjText: 'x' });
    expect(other).toEqual({ ok: true, details: EMPTY_INVESTMENT_DETAILS });
  });
});

describe('preços públicos: leitura dos arquivos e valor', () => {
  it('Tesouro: lê o dia mais recente e para no primeiro dia diferente', () => {
    expect(parseTreasuryLine(TESOURO_CSV[1]!)).toEqual({
      title: 'Tesouro Selic',
      maturityOn: '2029-03-01',
      on: '2026-11-13',
      rateBuyBp: 5,
      rateSellBp: 6,
      puBuyCents: 2_027_934,
      puSellCents: 2_026_435,
    });
    expect(parseTreasuryLine('Tesouro Selic;01/03/2029;13/11/2026;0,05;0,06;x;y;z')).toBeNull();
    const r = treasuryReader();
    const read = TESOURO_CSV.map((l) => r.onLine(l));
    expect(read).toEqual([true, true, true, true, false]);
    expect(r.result()?.on).toBe('2026-11-13');
    expect(r.result()?.titles.map((t) => t.title)).toEqual(['Tesouro Selic', 'Tesouro Prefixado', 'Tesouro Renda+ Aposentadoria Extra']);
    expect(treasuryReader().result()).toBeNull();
  });

  it('CVM: a cota mais recente da classe; CNPJ só com subclasses fica marcado; linhas quebradas ignoradas', () => {
    const r = cvmReader();
    for (const l of CVM_CSV.split('\n')) r.onLine(l);
    const m = r.result();
    expect(m.get('00017024000153')).toEqual({ on: '2026-11-12', quota: '45.483412400000' });
    expect(m.get('00888897000131')).toEqual({ subclasses: true });
    expect(m.size).toBe(2);
    expect(cvmDailyUrl('2026-11')).toBe('https://dados.cvm.gov.br/dados/FI/DOC/INF_DIARIO/DADOS/inf_diario_fi_202611.zip');
  });

  it('zip: o primeiro arquivo do zip, comprimido; o que não é zip é null', () => {
    const z = zipFirstEntry(zipOf('inf_diario_fi_202611.csv', CVM_CSV))!;
    expect(z.method).toBe(8);
    expect(inflateRawSync(z.data).toString('latin1')).toBe(CVM_CSV);
    expect(zipFirstEntry(new Uint8Array([1, 2, 3]))).toBeNull();
    expect(zipFirstEntry(new Uint8Array(40))).toBeNull();
  });

  it('valor: quantidade × preço exato, arredondado ao centavo (meio para cima)', () => {
    expect(valueFromQuantity(500_000, '20264.35')).toBe(1_013_218);
    expect(valueFromQuantity(1_234_567_891, '45.483412400000')).toBe(5_615_236);
    expect(valueFromQuantity(1, '0.004999')).toBe(0);
    expect(valueFromQuantity(0, '1.00')).toBeNull();
    expect(valueFromQuantity(1_000_000, '1,00')).toBeNull();
    expect(centsToPrice(2_026_435)).toBe('20264.35');
    expect(centsToPrice(5)).toBe('0.05');
    expect(formatQuota('45.483412400000')).toBe('R$ 45,4834124');
    expect(formatQuota('1.000000000000')).toBe('R$ 1,00');
  });

  it('título: valor com o mesmo nome e vencimento; os motivos quando não há', () => {
    const prices: TreasuryPrices = { on: '2026-11-13', titles: [{ title: 'Tesouro Selic', maturityOn: '2029-03-01', puSellCents: 2_026_435, puBuyCents: 2_027_934, rateSellBp: 6, rateBuyBp: 5 }] };
    expect(treasuryValue({ subkind: 'tesouro_selic', maturityOn: '2029-03-01', quantityMicro: 500_000 }, prices)).toEqual({
      kind: 'ok',
      valueCents: 1_013_218,
      puSellCents: 2_026_435,
      on: '2026-11-13',
      title: 'Tesouro Selic',
    });
    expect(treasuryValue({ subkind: 'tesouro_selic', maturityOn: '2029-03-01', quantityMicro: null }, prices).kind).toBe('sem_quantidade');
    expect(treasuryValue({ subkind: 'tesouro_selic', maturityOn: null, quantityMicro: 1 }, prices).kind).toBe('sem_vencimento');
    expect(treasuryValue({ subkind: null, maturityOn: '2029-03-01', quantityMicro: 1 }, prices).kind).toBe('sem_tipo');
    expect(treasuryValue({ subkind: 'tesouro_reserva', maturityOn: '2029-03-01', quantityMicro: 1 }, prices).kind).toBe('reserva');
    expect(treasuryValue({ subkind: 'tesouro_selic', maturityOn: '2031-03-01', quantityMicro: 1 }, prices).kind).toBe('fora_da_oferta');
  });

  it('fundo: valor pela cota; sem CNPJ, sem quantidade, subclasses e não encontrado', () => {
    const quotes = { '00017024000153': { on: '2026-11-12', quota: '45.483412400000' }, '00888897000131': { subclasses: true as const }, '11111111000191': null };
    expect(fundValue({ fundCnpj: '00017024000153', quantityMicro: 1_234_567_891 }, quotes)).toEqual({ kind: 'ok', valueCents: 5_615_236, quota: '45.483412400000', on: '2026-11-12' });
    expect(fundValue({ fundCnpj: null, quantityMicro: 1 }, quotes).kind).toBe('sem_cnpj');
    expect(fundValue({ fundCnpj: '00017024000153', quantityMicro: null }, quotes).kind).toBe('sem_quantidade');
    expect(fundValue({ fundCnpj: '00888897000131', quantityMicro: 1 }, quotes).kind).toBe('subclasses');
    expect(fundValue({ fundCnpj: '11111111000191', quantityMicro: 1 }, quotes).kind).toBe('nao_encontrado');
    expect(fundValue({ fundCnpj: '12ABC34501DE35', quantityMicro: 1 }, quotes).kind).toBe('nao_encontrado');
  });

  it('textos: linhas com a data e a fonte, sem travessão e sem recomendação', () => {
    expect(PUBLIC_PRICE_TEXT.treasuryLine('0,5', 2_026_435, '2026-11-13')).toBe('0,5 títulos × R$ 20.264,35 (preço de resgate de 13/11/2026).');
    expect(PUBLIC_PRICE_TEXT.treasuryLine('1', 2_026_435, '2026-11-13')).toBe('1 título × R$ 20.264,35 (preço de resgate de 13/11/2026).');
    expect(PUBLIC_PRICE_TEXT.fundLine('1.234,567891', '45.483412400000', '2026-11-12')).toBe('1.234,567891 cotas × R$ 45,4834124 (cota de 12/11/2026).');
    expect(PUBLIC_PRICE_TEXT.reason.fora_da_oferta('2026-11-13')).toContain('13/11/2026');
    for (const t of [...allTexts(PUBLIC_PRICE_TEXT), PUBLIC_PRICE_TEXT.reason.sem_quantidade(true), PUBLIC_PRICE_TEXT.reason.sem_quantidade(false)]) {
      noDash(t);
      expect(t).not.toMatch(/fazer sentido|deveria|recomend|melhor investimento/i);
    }
  });
});

// ---------------------------------------------------------------------------
// Função "precos"
// ---------------------------------------------------------------------------

const AUTH_URL = 'https://projeto.supabase.co/auth/v1/user';
const CONFIG = { appUrl: 'https://app.clarevo.app.br', supabaseUrl: 'https://projeto.supabase.co', userApiKey: 'sb_publishable_teste' };
const req = (body: unknown, over: Partial<{ method: string; auth: string | null; origin: string | null }> = {}) => ({
  method: over.method ?? 'POST',
  header: (name: string) =>
    name === 'origin' ? (over.origin === undefined ? 'https://app.clarevo.app.br' : over.origin) : name === 'authorization' ? (over.auth === undefined ? 'Bearer token-da-sessao' : over.auth) : null,
  body: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
});

function deps(over: { treasury?: 'ok' | 'falha'; months?: Record<string, number | string>; calls?: string[]; now?: () => number; today?: string } = {}) {
  const calls = over.calls ?? [];
  const months = over.months ?? { '2026-11': CVM_CSV };
  return {
    config: CONFIG,
    fetchJson: async (url: string, init: { headers: Record<string, string> }) => {
      calls.push(`auth ${url}`);
      const ok = url === AUTH_URL && init.headers.Authorization === 'Bearer token-da-sessao';
      return { ok, status: ok ? 200 : 401, json: async () => (ok ? { id: 'pessoa' } : {}) };
    },
    fetchLines: async (url: string, _init: { timeoutMs: number }, onLine: (l: string) => boolean) => {
      calls.push(`linhas ${url.slice(0, 40)}`);
      if (over.treasury === 'falha') return { ok: false, status: 503 };
      let n = 0;
      for (const l of TESOURO_CSV) {
        n++;
        if (!onLine(l)) break;
      }
      calls.push(`lidas ${n}`);
      return { ok: true, status: 200 };
    },
    fetchBytes: async (url: string) => {
      const month = /fi_(\d{4})(\d{2})\.zip$/.exec(url)!;
      const key = `${month[1]}-${month[2]}`;
      calls.push(`zip ${key}`);
      const m = months[key];
      if (m === undefined) return { ok: false, status: 404, bytes: async () => new Uint8Array() };
      if (typeof m === 'number') return { ok: false, status: m, bytes: async () => new Uint8Array() };
      return { ok: true, status: 200, bytes: async () => zipOf('x.csv', m) };
    },
    inflateRaw: async function* (data: Uint8Array) {
      const text = inflateRawSync(data).toString('latin1');
      for (let i = 0; i < text.length; i += 50) yield text.slice(i, i + 50);
    },
    today: () => over.today ?? '2026-11-14',
    now: over.now,
    log: () => {},
  };
}

describe('função "precos" (D-099): Tesouro e CVM', () => {
  it('sessão, método e pedido: sem sessão 401, GET 405, pedido vazio ou com CNPJ estranho 400, OPTIONS com CORS', async () => {
    const h = createPrecosHandler(deps());
    expect((await h(req({ treasury: true }, { auth: null }))).status).toBe(401);
    expect((await h(req({ treasury: true }, { auth: 'Bearer outro' }))).status).toBe(401);
    expect((await h(req({ treasury: true }, { method: 'GET' }))).status).toBe(405);
    expect((await h(req({}))).status).toBe(400);
    expect((await h(req('{x'))).status).toBe(400);
    expect((await h(req({ fundos: ['00.017.024/0001-53'] }))).status).toBe(400);
    expect((await h(req({ fundos: Array.from({ length: 21 }, (_, i) => String(i).padStart(14, '0')) }))).status).toBe(400);
    const pre = await h(req({}, { method: 'OPTIONS' }));
    expect(pre.status).toBe(204);
    expect(pre.headers['Access-Control-Allow-Origin']).toBe('https://app.clarevo.app.br');
    expect((await h(req({}, { method: 'OPTIONS', origin: 'https://outro.site' }))).headers['Access-Control-Allow-Origin']).toBeUndefined();
    expect(requestedCnpjs(['00017024000153', '00017024000153'])).toEqual(['00017024000153']);
    expect(requestedCnpjs(undefined)).toEqual([]);
  });

  it('Tesouro e fundos: o dia mais recente (lê só até ele), a cota de cada CNPJ, subclasses e não encontrado; a segunda vez sai da memória', async () => {
    const calls: string[] = [];
    const h = createPrecosHandler(deps({ calls }));
    const r = await h(req({ treasury: true, fundos: ['00017024000153', '00888897000131', '11111111000191'] }));
    expect(r.status).toBe(200);
    const body = JSON.parse(r.body);
    expect(body.treasury.on).toBe('2026-11-13');
    expect(body.treasury.titles).toHaveLength(3);
    expect(body.fundos).toEqual({ '00017024000153': { on: '2026-11-12', quota: '45.483412400000' }, '00888897000131': { subclasses: true }, '11111111000191': null });
    expect(body.fetchedOn).toBe('2026-11-14');
    // Não encontrado no mês de hoje, passado o começo do mês: não busca o anterior.
    expect(calls.filter((c) => c.startsWith('zip'))).toEqual(['zip 2026-11']);
    expect(calls).toContain('lidas 5');
    calls.length = 0;
    const again = await h(req({ treasury: true, fundos: ['00017024000153'] }));
    expect(JSON.parse(again.body).fundos).toEqual({ '00017024000153': { on: '2026-11-12', quota: '45.483412400000' } });
    expect(calls.filter((c) => !c.startsWith('auth'))).toEqual([]);
  });

  it('começo do mês: o arquivo do mês ainda não existe (404) e a cota vem do mês anterior', async () => {
    const h = createPrecosHandler(deps({ months: { '2026-10': CVM_CSV } }));
    const body = JSON.parse((await h(req({ fundos: ['00017024000153'] }))).body);
    expect(body).toEqual({ treasury: null, fundos: { '00017024000153': { on: '2026-11-12', quota: '45.483412400000' } }, fetchedOn: '2026-11-14' });
  });

  it('fonte fora do ar: Tesouro null e o fundo de fora (não é "não encontrado"); as duas fora, 502; a falha não fica guardada', async () => {
    let t = 0;
    const calls: string[] = [];
    const h = createPrecosHandler(deps({ treasury: 'falha', months: { '2026-11': 500, '2026-10': 500 }, calls, now: () => t }));
    expect((await h(req({ treasury: true, fundos: ['00017024000153'] }))).status).toBe(502);
    const h2 = createPrecosHandler(deps({ treasury: 'falha' }));
    const body = JSON.parse((await h2(req({ treasury: true, fundos: ['00017024000153'] }))).body);
    expect(body.treasury).toBeNull();
    expect(body.fundos['00017024000153']).toEqual({ on: '2026-11-12', quota: '45.483412400000' });
    const h3 = createPrecosHandler(deps({ months: { '2026-11': CVM_CSV, '2026-10': 500 } }));
    const b3 = JSON.parse((await h3(req({ fundos: ['00017024000153', '11111111000191'] }))).body);
    expect(b3.fundos).toEqual({ '00017024000153': { on: '2026-11-12', quota: '45.483412400000' }, '11111111000191': null });
    // Depois de 6 horas, busca de novo.
    t = 7 * 60 * 60 * 1000;
    calls.length = 0;
    await h(req({ treasury: true }));
    expect(calls.some((c) => c.startsWith('linhas'))).toBe(true);
  });

  it('mês de hoje fora do ar: o fundo fica de fora (sem a cota do mês anterior) e a fonte não é consultada de novo por 5 minutos', async () => {
    let t = 0;
    const calls: string[] = [];
    const h = createPrecosHandler(deps({ months: { '2026-11': 500, '2026-10': CVM_CSV }, calls, now: () => t }));
    const r = JSON.parse((await h(req({ treasury: true, fundos: ['00017024000153'] }))).body);
    expect(r.fundos).toEqual({});
    expect(r.treasury.on).toBe('2026-11-13');
    expect(calls.filter((c) => c.startsWith('zip'))).toEqual(['zip 2026-11']);
    calls.length = 0;
    t = 4 * 60 * 1000;
    await h(req({ fundos: ['00017024000153'] }));
    expect(calls.filter((c) => c.startsWith('zip'))).toEqual([]);
    t = 6 * 60 * 1000;
    await h(req({ fundos: ['00017024000153'] }));
    expect(calls.filter((c) => c.startsWith('zip'))).toEqual(['zip 2026-11']);
  });

  it('começo do mês: a cota que falta no arquivo de hoje vem do mês anterior; só os CNPJs pedidos são lidos', async () => {
    const calls: string[] = [];
    const lateOct = CVM_CSV.replace(/2026-11-1[12]/g, '2026-10-30');
    const h = createPrecosHandler(deps({ today: '2026-11-04', months: { '2026-11': CVM_CSV.split('\r\n').slice(0, 2).join('\r\n'), '2026-10': lateOct }, calls }));
    const body = JSON.parse((await h(req({ fundos: ['00017024000153', '00888897000131'] }))).body);
    expect(body.fundos['00017024000153']).toEqual({ on: '2026-11-11', quota: '45.360755300000' });
    expect(body.fundos['00888897000131']).toEqual({ subclasses: true });
    expect(calls.filter((c) => c.startsWith('zip'))).toEqual(['zip 2026-11', 'zip 2026-10']);
    const r = cvmReader(new Set(['00017024000153']));
    for (const l of CVM_CSV.split('\n')) r.onLine(l);
    expect([...r.result().keys()]).toEqual(['00017024000153']);
  });

  it('a função gerada (supabase/functions/precos) está em dia com o núcleo e roda como no Deno, com o zip descomprimido pelo próprio fluxo', async () => {
    const root = join(__dirname, '../../..');
    execFileSync('node', [join(root, 'scripts/gerar-funcoes.js'), '--conferir']);
    const src = readFileSync(join(root, 'supabase/functions/precos/index.ts'), 'utf8');
    const env: Record<string, string> = { SUPABASE_URL: 'https://projeto.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_teste' };
    let serve: ((r: Request) => Promise<Response>) | undefined;
    const deno = { env: { get: (n: string) => env[n] }, serve: (h: (r: Request) => Promise<Response>) => (serve = h) };
    const sent: string[] = [];
    const fakeFetch = async (url: string, init: { signal?: AbortSignal; headers?: Record<string, string> }) => {
      expect(init.signal).toBeInstanceOf(AbortSignal);
      sent.push(url.replace(/^https:\/\/([^/]+).*?([^/]*)$/, '$1 $2'));
      if (url === AUTH_URL) return new Response(JSON.stringify({ id: 'pessoa' }), { status: init.headers?.Authorization === 'Bearer token-da-sessao' ? 200 : 401 });
      if (url.includes('tesourotransparente')) return new Response(TESOURO_CSV.join('\r\n'), { status: 200 });
      if (url.endsWith('202611.zip')) return new Response(Buffer.from(zipOf('inf.csv', CVM_CSV)), { status: 200 });
      return new Response('não achei', { status: 404 });
    };
    new Function('Deno', 'fetch', 'console', src)(deno, fakeFetch, { error: () => {} });
    const r = await serve!(new Request('https://f/precos', { method: 'POST', headers: { Authorization: 'Bearer token-da-sessao' }, body: JSON.stringify({ treasury: true, fundos: ['00017024000153'] }) }));
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.treasury.titles.map((x: { title: string }) => x.title)).toEqual(['Tesouro Selic', 'Tesouro Prefixado', 'Tesouro Renda+ Aposentadoria Extra']);
    expect(body.fundos).toEqual({ '00017024000153': { on: '2026-11-12', quota: '45.483412400000' } });
    expect((await serve!(new Request('https://f/precos', { method: 'POST', body: '{}' }))).status).toBe(401);
    // Só as três fontes públicas e o Supabase Auth; nenhum dado de pessoa vai para fora.
    expect(sent.every((s) => /^(projeto\.supabase\.co|www\.tesourotransparente\.gov\.br|dados\.cvm\.gov\.br) /.test(s))).toBe(true);
    expect(src).not.toMatch(/sb_secret_[A-Za-z0-9]{8,}|eyJ[A-Za-z0-9_-]{20,}\./);
  });
});

describe('MemoryRepository: quantidade e CNPJ, preços de exemplo e meta que lê os investimentos (como a 0037)', () => {
  const TODAY = '2026-11-14';
  const setup = async () => {
    const { MemoryRepository } = await import('../src');
    const repo = new MemoryRepository({ actorId: 'pessoa-teste', displayName: 'Pessoa de teste', today: () => TODAY });
    const space = await repo.ensurePersonalSpace('Conta principal');
    return { repo, ctx: space.personalContextId };
  };
  const code = async (p: Promise<unknown>) => {
    try {
      await p;
    } catch (e) {
      return (e as { code?: string }).code ?? 'outro';
    }
    return 'passou';
  };

  it('quantidade e CNPJ: gravados; sem a ficha ou sem os campos, ficam; null tira; trocar o tipo tira o que não vale', async () => {
    const { repo, ctx } = await setup();
    const w = await repo.createInvestment('i1', ctx, {
      name: 'Fundo DI',
      kind: 'fundos',
      investedCents: 100_000,
      startOn: '2026-10-01',
      currentCents: null,
      details: { ...EMPTY_INVESTMENT_DETAILS, quantityMicro: 1_234_567_891, fundCnpj: '00017024000153' },
    });
    const id = w.investment!.id;
    expect(w.investment).toMatchObject({ quantityMicro: 1_234_567_891, fundCnpj: '00017024000153' });
    let cur = (await repo.updateInvestment('e1', id, 1, { name: 'Fundo DI do banco', kind: 'fundos' })).investment!;
    expect(cur).toMatchObject({ quantityMicro: 1_234_567_891, fundCnpj: '00017024000153' });
    const { quantityMicro: _q, fundCnpj: _c, ...oldShape } = EMPTY_INVESTMENT_DETAILS;
    cur = (await repo.updateInvestment('e2', id, cur.version, { name: 'Fundo DI do banco', kind: 'fundos', details: { ...oldShape, institution: 'Banco Azul' } as typeof EMPTY_INVESTMENT_DETAILS })).investment!;
    expect(cur).toMatchObject({ quantityMicro: 1_234_567_891, fundCnpj: '00017024000153', institution: 'Banco Azul' });
    cur = (await repo.updateInvestment('e3', id, cur.version, { name: 'Fundo DI do banco', kind: 'fundos', details: { ...EMPTY_INVESTMENT_DETAILS, quantityMicro: 2_000_000 } })).investment!;
    expect(cur).toMatchObject({ quantityMicro: 2_000_000, fundCnpj: null });
    cur = (await repo.updateInvestment('e4', id, cur.version, { name: 'Fundo DI do banco', kind: 'renda_fixa' })).investment!;
    expect(cur).toMatchObject({ quantityMicro: null, fundCnpj: null });
    expect(await code(repo.updateInvestment('e5', id, cur.version, { name: 'X', kind: 'fundos', details: { ...EMPTY_INVESTMENT_DETAILS, fundCnpj: '00017024000154' } }))).toBe('cnpj_invalido');
    expect(await code(repo.updateInvestment('e6', id, cur.version, { name: 'X', kind: 'renda_fixa', details: { ...EMPTY_INVESTMENT_DETAILS, quantityMicro: 1 } }))).toBe('quantidade_invalida');
  });

  it('preços de exemplo: os títulos do dia útil anterior e uma cota por CNPJ, marcados como exemplo', async () => {
    const { repo } = await setup();
    const p = await repo.getPublicPrices({ treasury: true, fundos: ['00017024000153'] });
    expect(p.example).toBe(true);
    expect(p.treasury?.on).toBe('2026-11-13');
    expect(p.treasury?.titles.some((t) => t.title === 'Tesouro Selic' && t.maturityOn === '2029-03-01')).toBe(true);
    const q = p.fundos['00017024000153'];
    expect(q && 'quota' in q ? q.on : null).toBe('2026-11-12');
    expect((await repo.getPublicPrices({ treasury: false, fundos: [] })).treasury).toBeNull();
    // Segunda-feira: o dia útil anterior é a sexta.
    expect((await import('../src')).examplePublicPrices({ treasury: true, fundos: [] }, '2026-11-16').treasury?.on).toBe('2026-11-13');
  });

  it('meta pelos investimentos: a soma dos ativos ligados; de volta, os registros; na Família, contexto_invalido', async () => {
    const { repo, ctx } = await setup();
    const { goalDetailTexts, goalPace } = await import('../src');
    const g = (
      await repo.createGoal('g1', ctx, {
        goalType: 'objetivo',
        name: 'Viagem',
        targetCents: 500_000,
        targetMonth: null,
        plannedMonthlyCents: 50_000,
        essentialBaseCents: null,
        essentialMonths: null,
        essentialBaseSource: null,
        initialCents: 30_000,
        initialOn: '2026-10-01',
      })
    ).goal;
    expect(g.valueSource).toBe('registros');
    const a = (await repo.createInvestment('i1', ctx, { name: 'Caixinha', kind: 'renda_fixa', investedCents: 100_000, startOn: '2026-10-01', currentCents: 108_000, details: EMPTY_INVESTMENT_DETAILS, goalId: g.id })).investment!;
    const b = (await repo.createInvestment('i2', ctx, { name: 'Antigo', kind: 'renda_fixa', investedCents: 70_000, startOn: '2026-10-01', currentCents: null, details: EMPTY_INVESTMENT_DETAILS, goalId: g.id })).investment!;
    await repo.setInvestmentStatus('i3', b.id, b.version, 'encerrado');
    const w = await repo.setGoalValueSource('v1', g.id, g.version, 'investimentos');
    expect(w.goal).toMatchObject({ valueSource: 'investimentos', savedCents: 108_000, initialCents: 30_000, version: g.version + 1 });
    expect(await repo.setGoalValueSource('v1', g.id, g.version, 'investimentos')).toEqual(w);
    expect(await code(repo.setGoalValueSource('v2', g.id, g.version, 'registros'))).toBe('versao_desatualizada');
    expect(await code(repo.setGoalValueSource('v3', g.id, w.goal.version, 'extrato' as 'registros'))).toBe('origem_invalida');
    // O texto da composição e o ritmo.
    expect(goalDetailTexts(w.goal, [], TODAY).composition).toEqual(['Valor dos investimentos ligados: R$ 1.080,00, pela última atualização de cada um.']);
    expect(goalPace(w.goal, TODAY)).toBeNull();
    // A projeção começa no mês de hoje (os registros da meta não contam) e o guardado do mês não leva os registros dela.
    const { goalPlan, countedGoalMovements, savedInMonth } = await import('../src');
    const moves = [{ goalId: g.id, kind: 'aporte' as const, amountCents: 9_000, occurredOn: TODAY }];
    expect(goalPlan(w.goal, moves, TODAY).firstProjectedMonth).toBe('2026-11');
    expect(goalPlan({ ...w.goal, valueSource: 'registros' }, moves, TODAY).firstProjectedMonth).toBe('2026-12');
    expect(savedInMonth(countedGoalMovements(moves, [w.goal]), '2026-11')).toBe(0);
    expect(savedInMonth(countedGoalMovements(moves, [{ ...w.goal, valueSource: 'registros' }]), '2026-11')).toBe(9_000);
    // Um aporte no investimento conta na meta.
    await repo.addInvestmentMovement('m1', a.id, 'aporte', { amountCents: 5_000, occurredOn: TODAY, note: null });
    expect((await repo.getGoal(g.id))!.savedCents).toBe(108_000);
    const back = await repo.setGoalValueSource('v4', g.id, w.goal.version, 'registros');
    expect(back.goal).toMatchObject({ valueSource: 'registros', savedCents: 30_000 });
    const fam = await repo.createFamily('kf', 'Casa de teste');
    const sofa = (await repo.createGoal('g2', fam.context.id, { goalType: 'objetivo', name: 'Sofá', targetCents: 100_000, targetMonth: null, plannedMonthlyCents: null, essentialBaseCents: null, essentialMonths: null, essentialBaseSource: null, initialCents: null, initialOn: null })).goal;
    expect(await code(repo.setGoalValueSource('v5', sofa.id, sofa.version, 'investimentos'))).toBe('contexto_invalido');
  });
});
