import type { IsoDate } from './dates';
import { addDays, formatDateBR, isValidIsoDate } from './dates';
import type { InvestmentSubkind } from './investment-details';
import type { Cents } from './money';
import { formatBRL } from './money';

/**
 * Preço público dos títulos do Tesouro e cota diária dos fundos (D-099, itens 19 e 20; `docs/45_INVESTIMENTOS.md`, seção 9).
 *
 * T1. Tesouro: "Taxas dos Títulos Ofertados pelo Tesouro Direto", do Tesouro Transparente (dados abertos, licença ODbL), um CSV diário com
 *     o mais recente no topo. Vale o PU de venda da manhã (o preço de resgate antecipado no dia, para quem vende ao Tesouro) do título com o
 *     mesmo nome e o mesmo vencimento da ficha. Títulos fora da oferta do dia e o Tesouro Reserva não aparecem: a tela diz isso.
 * F1. Fundos: "Informe Diário" dos fundos, da CVM (dados abertos, licença ODbL), um zip por mês com a cota de cada dia útil. Vale a cota
 *     mais recente do CNPJ da ficha (a classe sem subclasse). CNPJ com mais de uma subclasse fica sem cota: cada subclasse tem a sua.
 * V1. Valor = quantidade × preço (ou cota), arredondado ao centavo, só com "Usar este valor" (por escolha da pessoa, como o valor pela
 *     taxa contratada). O valor do extrato é o que vale; a tela diz a data do preço e a fonte.
 */

/** Um título no dia (preços em centavos; taxas em centésimos de ponto ao ano). */
export interface TreasuryPrice {
  title: string;
  maturityOn: IsoDate;
  puSellCents: Cents;
  puBuyCents: Cents | null;
  rateSellBp: number | null;
  rateBuyBp: number | null;
}

/** Os títulos ofertados num dia ("Data Base" do arquivo). */
export interface TreasuryPrices {
  on: IsoDate;
  titles: TreasuryPrice[];
}

/** A cota mais recente de um fundo (texto decimal com ponto, como no arquivo da CVM, para não perder casas). */
export interface FundQuote {
  on: IsoDate;
  quota: string;
}

/** Resposta por CNPJ: a cota, "subclasses" (mais de uma cota para o mesmo CNPJ) ou null (não está no Informe Diário dos dois últimos meses). */
export type FundQuoteResult = FundQuote | { subclasses: true } | null;

/** O que a função "precos" devolve ao app. */
export interface PublicPrices {
  treasury: TreasuryPrices | null;
  fundos: Record<string, FundQuoteResult>;
  fetchedOn: IsoDate;
  /** Na demonstração, valores de exemplo (a tela diz isso). */
  example?: boolean;
}

export const TREASURY_PRICES_URL =
  'https://www.tesourotransparente.gov.br/ckan/dataset/df56aa42-484a-4a59-8184-7676580c81e3/resource/796d2059-14e9-44e3-80c9-2d9e30b405c1/download/precotaxatesourodireto.csv';
/** "AAAA-MM" para o zip do Informe Diário do mês. */
export const cvmDailyUrl = (month: string) => `https://dados.cvm.gov.br/dados/FI/DOC/INF_DIARIO/DADOS/inf_diario_fi_${month.replace('-', '')}.zip`;
/** No máximo 20 fundos por pedido (o app pede só os da carteira). */
export const FUND_QUERY_MAX = 20;

/** O nome do título no arquivo do Tesouro para cada tipo exato (o Tesouro Reserva não tem preço publicado nesse arquivo). */
export const TREASURY_TITLE_BY_SUBKIND: Partial<Readonly<Record<InvestmentSubkind, string>>> = {
  tesouro_selic: 'Tesouro Selic',
  tesouro_prefixado: 'Tesouro Prefixado',
  tesouro_prefixado_juros: 'Tesouro Prefixado com Juros Semestrais',
  tesouro_ipca: 'Tesouro IPCA+',
  tesouro_ipca_juros: 'Tesouro IPCA+ com Juros Semestrais',
  tesouro_renda: 'Tesouro Renda+ Aposentadoria Extra',
  tesouro_educa: 'Tesouro Educa+',
};

// ---------------------------------------------------------------------------
// Leitura dos arquivos (servidor)
// ---------------------------------------------------------------------------

/** "13/11/2026" para "2026-11-13" (null se não for data). */
function brDate(text: string): IsoDate | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text.trim());
  if (!m) return null;
  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  return isValidIsoDate(iso) ? iso : null;
}

/** "20264,35" para 2026435 centavos; "0,05" com `scale` 100 para 5. null se não for número. */
function brNumber(text: string, scale: number): number | null {
  const t = text.trim();
  if (!/^-?\d+(,\d+)?$/.test(t)) return null;
  const n = Math.round(Number(t.replace(',', '.')) * scale);
  return Number.isSafeInteger(n) ? n : null;
}

/** Uma linha do CSV do Tesouro: Tipo Titulo;Data Vencimento;Data Base;Taxa Compra;Taxa Venda;PU Compra;PU Venda;PU Base. */
export function parseTreasuryLine(line: string): (TreasuryPrice & { on: IsoDate }) | null {
  const p = line.replace(/\r$/, '').split(';');
  if (p.length < 7) return null;
  const maturityOn = brDate(p[1]!);
  const on = brDate(p[2]!);
  const puSellCents = brNumber(p[6]!, 100);
  if (!maturityOn || !on || puSellCents === null || puSellCents <= 0) return null;
  return {
    title: p[0]!.trim(),
    maturityOn,
    on,
    rateBuyBp: brNumber(p[3]!, 100),
    rateSellBp: brNumber(p[4]!, 100),
    puBuyCents: brNumber(p[5]!, 100),
    puSellCents,
  };
}

/**
 * Lê as linhas do CSV do Tesouro até o fim do dia mais recente (o arquivo vem do mais novo ao mais velho). `onLine` devolve false para parar
 * a leitura: o servidor não baixa o arquivo inteiro.
 */
export function treasuryReader(): { onLine: (line: string) => boolean; result: () => TreasuryPrices | null } {
  let header = true;
  let on: IsoDate | null = null;
  const titles: TreasuryPrice[] = [];
  return {
    onLine: (line) => {
      if (header) {
        header = false;
        if (/^Tipo Titulo/i.test(line)) return true;
      }
      const row = parseTreasuryLine(line);
      if (!row) return true;
      if (on === null) on = row.on;
      if (row.on !== on) return false;
      const { on: _, ...price } = row;
      titles.push(price);
      return true;
    },
    result: () => (on === null || titles.length === 0 ? null : { on, titles }),
  };
}

/** "00.017.024/0001-53" para "00017024000153". */
const cnpjDigits = (text: string) => text.toUpperCase().replace(/[.\/\s-]/g, '');

/**
 * Lê as linhas do Informe Diário da CVM (TP_FUNDO_CLASSE;CNPJ_FUNDO_CLASSE;ID_SUBCLASSE;DT_COMPTC;VL_TOTAL;VL_QUOTA;...) e guarda, para cada
 * CNPJ, a cota mais recente da classe sem subclasse e se ele tem subclasses. Com `wanted` (CNPJs de 14 caracteres), só as linhas desses
 * CNPJs são lidas por inteiro: o arquivo do mês tem meio milhão de linhas, e a função do servidor tem pouco tempo de processamento.
 * Linhas de outro formato são ignoradas.
 */
export function cvmReader(wanted?: ReadonlySet<string>): {
  onLine: (line: string) => void;
  result: () => Map<string, { on: IsoDate; quota: string } | { subclasses: true }>;
} {
  const plain = new Map<string, { on: IsoDate; quota: string }>();
  const subs = new Set<string>();
  // O arquivo traz o CNPJ formatado ("00.017.024/0001-53"); a comparação aceita as duas formas.
  const accept = wanted ? new Set([...wanted].flatMap((c) => [c, formatCnpjDots(c)])) : null;
  return {
    onLine: (line) => {
      const a = line.indexOf(';');
      const b = a < 0 ? -1 : line.indexOf(';', a + 1);
      if (b < 0) return;
      const rawCnpj = line.slice(a + 1, b);
      if (accept && !accept.has(rawCnpj)) return;
      const p = line.replace(/\r$/, '').split(';');
      if (p.length < 6) return;
      const cnpj = cnpjDigits(rawCnpj);
      const on = p[3]!.trim();
      const quota = p[5]!.trim();
      if (!/^[0-9A-Z]{14}$/.test(cnpj) || !isValidIsoDate(on) || !/^\d+(\.\d+)?$/.test(quota) || Number(quota) <= 0) return;
      if (p[2]!.trim() !== '') {
        subs.add(cnpj);
        return;
      }
      const before = plain.get(cnpj);
      if (!before || on >= before.on) plain.set(cnpj, { on, quota });
    },
    result: () => {
      const out = new Map<string, { on: IsoDate; quota: string } | { subclasses: true }>(plain);
      for (const c of subs) if (!plain.has(c)) out.set(c, { subclasses: true });
      return out;
    },
  };
}

/** "00017024000153" para "00.017.024/0001-53" (o formato do arquivo da CVM). */
const formatCnpjDots = (c: string) => `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`;

/** O primeiro arquivo de um zip (cabeçalho local): o método (8 = deflate, 0 = sem compressão) e os bytes comprimidos. null se não for zip. */
export function zipFirstEntry(bytes: Uint8Array): { method: number; data: Uint8Array } | null {
  if (bytes.length < 30) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0x04034b50) return null;
  const flags = view.getUint16(6, true);
  const method = view.getUint16(8, true);
  let size = view.getUint32(18, true);
  const nameLen = view.getUint16(26, true);
  const extraLen = view.getUint16(28, true);
  const start = 30 + nameLen + extraLen;
  // Com o tamanho só no descritor do fim (bit 3), o arquivo vai até o diretório central; o inflate para no fim do fluxo comprimido.
  if (flags & 0x08 || size === 0) size = bytes.length - start;
  if (start + size > bytes.length) return null;
  return { method, data: bytes.subarray(start, start + size) };
}

/** O dia útil anterior (sem feriados: só para os exemplos da demonstração). */
function previousWeekday(day: IsoDate): IsoDate {
  let d = addDays(day, -1);
  for (let i = 0; i < 3; i++) {
    const w = new Date(`${d}T12:00:00Z`).getUTCDay();
    if (w !== 0 && w !== 6) break;
    d = addDays(d, -1);
  }
  return d;
}

/** Títulos de exemplo da demonstração (preços parecidos com os de novembro de 2026, nunca os publicados no dia). */
const EXAMPLE_TITLES: readonly TreasuryPrice[] = [
  { title: 'Tesouro Selic', maturityOn: '2027-03-01', puSellCents: 2_029_156, puBuyCents: 2_030_253, rateSellBp: 4, rateBuyBp: 3 },
  { title: 'Tesouro Selic', maturityOn: '2029-03-01', puSellCents: 2_026_435, puBuyCents: 2_027_934, rateSellBp: 6, rateBuyBp: 5 },
  { title: 'Tesouro Selic', maturityOn: '2031-03-01', puSellCents: 2_019_226, puBuyCents: 2_021_126, rateSellBp: 12, rateBuyBp: 11 },
  { title: 'Tesouro Prefixado', maturityOn: '2028-01-01', puSellCents: 85_940, puBuyCents: 86_087, rateSellBp: 1_439, rateBuyBp: 1_427 },
  { title: 'Tesouro Prefixado', maturityOn: '2032-01-01', puSellCents: 48_087, puBuyCents: 48_370, rateSellBp: 1_544, rateBuyBp: 1_532 },
  { title: 'Tesouro IPCA+', maturityOn: '2029-05-15', puSellCents: 398_295, puBuyCents: 399_596, rateSellBp: 759, rateBuyBp: 747 },
  { title: 'Tesouro IPCA+', maturityOn: '2035-05-15', puSellCents: 251_406, puBuyCents: 253_908, rateSellBp: 789, rateBuyBp: 777 },
  { title: 'Tesouro IPCA+ com Juros Semestrais', maturityOn: '2035-05-15', puSellCents: 440_310, puBuyCents: 429_588, rateSellBp: 785, rateBuyBp: 773 },
  { title: 'Tesouro Prefixado com Juros Semestrais', maturityOn: '2035-01-01', puSellCents: 80_013, puBuyCents: 80_488, rateSellBp: 1_551, rateBuyBp: 1_539 },
  { title: 'Tesouro Renda+ Aposentadoria Extra', maturityOn: '2049-12-15', puSellCents: 198_233, puBuyCents: 200_714, rateSellBp: 770, rateBuyBp: 758 },
];

/** Na demonstração: os títulos de exemplo do dia útil anterior e, para cada CNPJ válido pedido, uma cota de exemplo de dois dias úteis antes. */
export function examplePublicPrices(request: { treasury: boolean; fundos: readonly string[] }, today: IsoDate): PublicPrices {
  const on = previousWeekday(today);
  const fundos: Record<string, FundQuoteResult> = {};
  for (const c of request.fundos) {
    const sum = [...c].reduce((s, ch) => s + (ch.charCodeAt(0) - 48), 0);
    fundos[c] = { on: previousWeekday(on), quota: `${10 + (sum % 90)}.${String((sum * 7919) % 1_000_000).padStart(6, '0')}` };
  }
  return { treasury: request.treasury ? { on, titles: EXAMPLE_TITLES.map((x) => ({ ...x })) } : null, fundos, fetchedOn: today, example: true };
}

// ---------------------------------------------------------------------------
// Valor pela quantidade (app)
// ---------------------------------------------------------------------------

/** Quantidade (milionésimos) × preço (texto decimal com ponto, até 12 casas), em centavos arredondados (meio para cima). Conta exata. */
export function valueFromQuantity(quantityMicro: number, price: string): Cents | null {
  const m = /^(\d+)(?:\.(\d{1,12}))?$/.exec(price);
  if (!m || !Number.isSafeInteger(quantityMicro) || quantityMicro <= 0) return null;
  const priceScaled = BigInt(m[1]! + (m[2] ?? '').padEnd(12, '0')); // preço × 10^12
  const product = BigInt(quantityMicro) * priceScaled; // valor × 10^18
  const divisor = 10n ** 16n; // centavos = valor × 10^2
  const cents = (product + divisor / 2n) / divisor;
  return cents <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(cents) : null;
}

/** 2026435 centavos para "20264.35". */
export const centsToPrice = (cents: Cents) => `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;

/** "45.360755300000" para "R$ 45,3607553" (sem os zeros do fim; ao menos 2 casas). */
export function formatQuota(quota: string): string {
  const [int, frac = ''] = quota.split('.');
  const f = frac.replace(/0+$/, '').padEnd(2, '0');
  return `R$ ${Number(int).toLocaleString('pt-BR')},${f}`;
}

export type TreasuryValue =
  | { kind: 'ok'; valueCents: Cents; puSellCents: Cents; on: IsoDate; title: string }
  | { kind: 'sem_quantidade' | 'sem_vencimento' | 'sem_tipo' | 'reserva' | 'fora_da_oferta' };

/** O valor de um título público pelo preço do dia, ou o motivo de não haver. */
export function treasuryValue(
  inv: { subkind: InvestmentSubkind | null; maturityOn: IsoDate | null; quantityMicro: number | null },
  prices: TreasuryPrices,
): TreasuryValue {
  if (inv.subkind === 'tesouro_reserva') return { kind: 'reserva' };
  const title = inv.subkind ? TREASURY_TITLE_BY_SUBKIND[inv.subkind] : undefined;
  if (!title) return { kind: 'sem_tipo' };
  if (!inv.maturityOn) return { kind: 'sem_vencimento' };
  if (inv.quantityMicro === null) return { kind: 'sem_quantidade' };
  const found = prices.titles.find((t) => t.title === title && t.maturityOn === inv.maturityOn);
  if (!found) return { kind: 'fora_da_oferta' };
  const valueCents = valueFromQuantity(inv.quantityMicro, centsToPrice(found.puSellCents));
  if (valueCents === null) return { kind: 'fora_da_oferta' };
  return { kind: 'ok', valueCents, puSellCents: found.puSellCents, on: prices.on, title };
}

export type FundValue =
  | { kind: 'ok'; valueCents: Cents; quota: string; on: IsoDate }
  | { kind: 'sem_cnpj' | 'sem_quantidade' | 'subclasses' | 'nao_encontrado' };

/** O valor de um fundo pela cota mais recente, ou o motivo de não haver. */
export function fundValue(inv: { fundCnpj: string | null; quantityMicro: number | null }, quotes: Record<string, FundQuoteResult>): FundValue {
  if (!inv.fundCnpj) return { kind: 'sem_cnpj' };
  if (inv.quantityMicro === null) return { kind: 'sem_quantidade' };
  const q = quotes[inv.fundCnpj];
  if (!q) return { kind: 'nao_encontrado' };
  if ('subclasses' in q) return { kind: 'subclasses' };
  const valueCents = valueFromQuantity(inv.quantityMicro, q.quota);
  if (valueCents === null) return { kind: 'nao_encontrado' };
  return { kind: 'ok', valueCents, quota: q.quota, on: q.on };
}

// ---------------------------------------------------------------------------
// Textos
// ---------------------------------------------------------------------------

export const PUBLIC_PRICE_TEXT = {
  treasuryTitle: 'Valor pelo preço publicado',
  fundTitle: 'Valor pela cota do fundo',
  /** "Valor estimado: R$ 10.132,18" */
  value: (cents: Cents) => `Valor estimado: ${formatBRL(cents)}`,
  /** "0,5 título × R$ 20.264,35 (preço de resgate de 13/11/2026)." */
  treasuryLine: (quantity: string, puSellCents: Cents, on: IsoDate) =>
    `${quantity} ${quantity === '1' ? 'título' : 'títulos'} × ${formatBRL(puSellCents)} (preço de resgate de ${formatDateBR(on)}).`,
  /** "1.234,56 cotas × R$ 45,3607553 (cota de 13/11/2026)." */
  fundLine: (quantity: string, quota: string, on: IsoDate) => `${quantity} ${quantity === '1' ? 'cota' : 'cotas'} × ${formatQuota(quota)} (cota de ${formatDateBR(on)}).`,
  treasurySource: 'Fonte: Tesouro Nacional, dados abertos do Tesouro Transparente (licença ODbL). O preço publicado é o do dia e pode ser revisto.',
  fundSource: 'Fonte: CVM, dados abertos do Informe Diário dos fundos (licença ODbL). A cota sai com alguns dias de atraso.',
  statementNote: 'O valor do seu extrato é o que vale.',
  use: 'Usar este valor',
  used: 'Valor atualizado pelo preço público.',
  /** Na demonstração, os preços são de exemplo. */
  demo: 'Na demonstração, o preço e a cota são valores de exemplo, não os publicados.',
  loading: 'Buscando o preço publicado…',
  unavailable: 'Não foi possível buscar o preço publicado agora. Tente mais tarde ou atualize pelo extrato.',
  reason: {
    sem_quantidade: (fund: boolean) => `Informe a quantidade de ${fund ? 'cotas' : 'títulos'} em Editar para ver o valor pelo ${fund ? 'preço da cota' : 'preço publicado'}.`,
    sem_vencimento: 'Informe o vencimento do título em Editar para achar o preço publicado.',
    sem_tipo: 'Escolha qual é o título em Editar para achar o preço publicado.',
    reserva: 'O Tesouro Reserva não tem preço no arquivo de títulos ofertados pelo Tesouro Nacional. Atualize pelo extrato.',
    fora_da_oferta: (on: IsoDate) => `Este título, com este vencimento, não está entre os ofertados pelo Tesouro Nacional em ${formatDateBR(on)}. Confira o vencimento em Editar ou atualize pelo extrato.`,
    sem_cnpj: 'Informe o CNPJ do fundo em Editar para buscar a cota publicada pela CVM.',
    subclasses: 'Este CNPJ tem mais de uma subclasse, cada uma com a sua cota. Atualize pelo extrato.',
    nao_encontrado: 'A Clarevo não achou a cota deste CNPJ no Informe Diário da CVM dos dois últimos meses. Confira o CNPJ em Editar ou atualize pelo extrato.',
  },
} as const;
