import type { IsoDate } from '../dates';
import { addMonths, monthOf, todayIn } from '../dates';
import {
  FUND_QUERY_MAX,
  TREASURY_PRICES_URL,
  cvmDailyUrl,
  cvmReader,
  treasuryReader,
  zipFirstEntry,
  type FundQuoteResult,
  type TreasuryPrices,
} from '../investment-prices';
import { serviceKeyFrom } from '../servidor-comum';

/**
 * Função do servidor "precos" (D-099, itens 19 e 20; `docs/45_INVESTIMENTOS.md`, seção 9): busca nos dados abertos o preço do dia dos
 * títulos ofertados pelo Tesouro Direto (Tesouro Transparente) e a cota mais recente dos fundos pedidos (Informe Diário da CVM) e devolve
 * ao app. Recebe só os CNPJs dos fundos (dado público do fundo, não da pessoa) e não guarda nada em banco: a resposta fica 6 horas na
 * memória da função. Confere a sessão da pessoa no Supabase Auth, como a "indices", e é publicada com a verificação de JWT do painel
 * **desligada**.
 *
 * Pedido: POST {"treasury": true, "fundos": ["00017024000153", ...]} (até 20 CNPJs, só números e letras). Resposta 200:
 * {"treasury": {"on": "AAAA-MM-DD", "titles": [...]} | null, "fundos": {"<cnpj>": {"on", "quota"} | {"subclasses": true} | null},
 * "fetchedOn": "AAAA-MM-DD"}. Fonte fora do ar: a parte dela vem null (Tesouro) ou fica de fora (fundos), e a resposta não é guardada; as
 * duas fora: 502 {"erro": "precos_indisponiveis"}. Sem sessão válida: 401 {"erro": "nao_autenticado"}.
 */

export interface PrecosConfig {
  appUrl: string;
  supabaseUrl: string;
  userApiKey: string;
}

export function precosConfigFrom(env: (name: string) => string | undefined): PrecosConfig {
  const v = (name: string) => (env(name) ?? '').trim();
  return {
    appUrl: (v('CLAREVO_APP_URL') || 'https://app.clarevo.app.br').replace(/\/+$/, ''),
    supabaseUrl: v('SUPABASE_URL').replace(/\/+$/, ''),
    userApiKey: v('SUPABASE_PUBLISHABLE_KEY') || v('SUPABASE_ANON_KEY') || serviceKeyFrom(v),
  };
}

export function brazilToday(): IsoDate {
  return todayIn('America/Sao_Paulo');
}

export interface PrecosDeps {
  config: PrecosConfig;
  /** Confere a sessão: GET com cabeçalhos, devolve o status e o JSON. */
  fetchJson: (url: string, init: { timeoutMs: number; headers: Record<string, string> }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;
  /** Lê um texto linha a linha; `onLine` devolve false para parar (e cancelar o resto do download). */
  fetchLines: (url: string, init: { timeoutMs: number }, onLine: (line: string) => boolean) => Promise<{ ok: boolean; status: number }>;
  /** Baixa um arquivo inteiro (o zip da CVM, de 4 a 11 MB). */
  fetchBytes: (url: string, init: { timeoutMs: number }) => Promise<{ ok: boolean; status: number; bytes: () => Promise<Uint8Array> }>;
  /** Descomprime um fluxo deflate (sem cabeçalho) em pedaços de texto. */
  inflateRaw: (data: Uint8Array) => AsyncIterable<string>;
  today: () => IsoDate;
  now?: () => number;
  log?: (m: string) => void;
}

export interface PrecosRequest {
  method: string;
  header: (name: string) => string | null;
  body: () => Promise<string>;
}

export interface PrecosResponse {
  status: number;
  body: string;
  headers: Record<string, string>;
}

const CACHE_MS = 6 * 60 * 60 * 1000;
/** Uma fonte fora do ar não é consultada de novo por 5 minutos. */
const FAILURE_MS = 5 * 60 * 1000;
/** Nos primeiros dias do mês, a cota que falta no arquivo do mês é procurada no anterior. */
const EARLY_MONTH_DAYS = 10;
const JSON_TYPE = 'application/json; charset=utf-8';

function cors(origin: string | null, appUrl: string): Record<string, string> {
  if (origin === null) return {};
  if (origin !== appUrl && !/^http:\/\/localhost(:\d+)?$/.test(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

/** Os CNPJs pedidos: só 14 caracteres de números e letras maiúsculas, sem repetir, no máximo 20. null se o pedido não serve. */
export function requestedCnpjs(value: unknown): string[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > FUND_QUERY_MAX) return null;
  const out: string[] = [];
  for (const v of value) {
    if (typeof v !== 'string' || !/^[0-9A-Z]{14}$/.test(v)) return null;
    if (!out.includes(v)) out.push(v);
  }
  return out;
}

export function createPrecosHandler(deps: PrecosDeps) {
  const now = deps.now ?? (() => Date.now());
  let treasury: { at: number; value: TreasuryPrices } | null = null;
  let treasuryFailedAt = -Infinity;
  /**
   * Por mês: as cotas achadas e os CNPJs já procurados (as funções do servidor reiniciam com frequência, então só os CNPJs pedidos são
   * lidos por inteiro), se o arquivo ainda não existe (404) e quando falhou pela última vez. Uma leitura por mês de cada vez.
   */
  const months = new Map<string, { at: number; missingFile: boolean; quotes: Map<string, Exclude<FundQuoteResult, null>>; looked: Set<string> }>();
  const monthFailedAt = new Map<string, number>();
  const monthLocks = new Map<string, Promise<unknown>>();

  const loadTreasury = async (): Promise<{ ok: boolean; value: TreasuryPrices | null }> => {
    if (treasury && now() - treasury.at < CACHE_MS) return { ok: true, value: treasury.value };
    // Falha recente: não espera de novo a fonte fora do ar a cada pedido.
    if (now() - treasuryFailedAt < FAILURE_MS) return { ok: false, value: null };
    try {
      const reader = treasuryReader();
      const r = await deps.fetchLines(TREASURY_PRICES_URL, { timeoutMs: 20000 }, reader.onLine);
      const value = reader.result();
      if (!r.ok || value === null) {
        deps.log?.(`precos: tesouro_${r.status}`);
        treasuryFailedAt = now();
        return { ok: false, value: null };
      }
      treasury = { at: now(), value };
      return { ok: true, value };
    } catch (e) {
      deps.log?.(`precos: tesouro_${e instanceof Error ? e.message : 'falha'}`);
      treasuryFailedAt = now();
      return { ok: false, value: null };
    }
  };

  /** Lê o mês para os CNPJs pedidos que ainda não foram procurados nele (os já procurados saem da memória). */
  const loadMonthNow = async (month: string, cnpjs: readonly string[]): Promise<{ ok: boolean; missingFile: boolean; quotes: Map<string, Exclude<FundQuoteResult, null>> }> => {
    let entry = months.get(month);
    if (entry && now() - entry.at >= CACHE_MS) {
      months.delete(month);
      entry = undefined;
    }
    const need = cnpjs.filter((c) => !entry?.looked.has(c));
    if (entry && (need.length === 0 || entry.missingFile)) return { ok: true, missingFile: entry.missingFile, quotes: entry.quotes };
    if (now() - (monthFailedAt.get(month) ?? -Infinity) < FAILURE_MS) return { ok: false, missingFile: false, quotes: entry?.quotes ?? new Map() };
    const keep = entry ?? { at: now(), missingFile: false, quotes: new Map<string, Exclude<FundQuoteResult, null>>(), looked: new Set<string>() };
    const fail = (why: string) => {
      deps.log?.(`precos: cvm_${month}_${why}`);
      monthFailedAt.set(month, now());
      return { ok: false, missingFile: false, quotes: keep.quotes };
    };
    try {
      const r = await deps.fetchBytes(cvmDailyUrl(month), { timeoutMs: 25000 });
      if (r.status === 404) {
        const empty = { at: now(), missingFile: true, quotes: new Map<string, Exclude<FundQuoteResult, null>>(), looked: new Set<string>() };
        months.set(month, empty);
        return { ok: true, missingFile: true, quotes: empty.quotes };
      }
      if (!r.ok) return fail(String(r.status));
      const zipEntry = zipFirstEntry(await r.bytes());
      if (!zipEntry || zipEntry.method !== 8) return fail('zip');
      const reader = cvmReader(new Set(need));
      let rest = '';
      for await (const chunk of deps.inflateRaw(zipEntry.data)) {
        const lines = (rest + chunk).split('\n');
        rest = lines.pop() ?? '';
        for (const line of lines) reader.onLine(line);
      }
      if (rest !== '') reader.onLine(rest);
      for (const [c, q] of reader.result()) keep.quotes.set(c, q);
      for (const c of need) keep.looked.add(c);
      // Só dois meses na memória (o de hoje e o anterior).
      for (const k of [...months.keys()]) if (k !== month && months.size >= 2) months.delete(k);
      months.set(month, keep);
      return { ok: true, missingFile: false, quotes: keep.quotes };
    } catch (e) {
      return fail(e instanceof Error ? e.message : 'falha');
    }
  };

  /** Um mês de cada vez: dois pedidos ao mesmo tempo não descomprimem o mesmo arquivo duas vezes. */
  const loadMonth = (month: string, cnpjs: readonly string[]) => {
    const before = monthLocks.get(month) ?? Promise.resolve();
    const run = before.then(() => loadMonthNow(month, cnpjs));
    monthLocks.set(month, run.catch(() => undefined));
    return run;
  };

  return async (req: PrecosRequest): Promise<PrecosResponse> => {
    const headers = cors(req.header('origin'), deps.config.appUrl);
    if (req.method === 'OPTIONS') return { status: 204, body: '', headers };
    const reply = (status: number, erro: string) => ({ status, body: JSON.stringify({ erro }), headers: { ...headers, 'Content-Type': JSON_TYPE } });
    if (req.method !== 'POST') return reply(405, 'metodo');
    const auth = /^Bearer\s+(\S+)$/i.exec(req.header('authorization') ?? '');
    if (!auth) return reply(401, 'nao_autenticado');
    if (deps.config.supabaseUrl === '' || deps.config.userApiKey === '') {
      deps.log?.('precos: configuracao');
      return reply(503, 'indisponivel');
    }
    try {
      const r = await deps.fetchJson(`${deps.config.supabaseUrl}/auth/v1/user`, { timeoutMs: 8000, headers: { apikey: deps.config.userApiKey, Authorization: `Bearer ${auth[1]}` } });
      if (r.status === 401 || r.status === 403) return reply(401, 'nao_autenticado');
      const id = r.ok ? ((await r.json()) as { id?: unknown } | null)?.id : null;
      if (typeof id !== 'string' || id === '') {
        deps.log?.(`precos: auth_${r.status}`);
        return r.ok ? reply(401, 'nao_autenticado') : reply(502, 'sessao_indisponivel');
      }
    } catch (e) {
      deps.log?.(`precos: auth_${e instanceof Error ? e.message : 'falha'}`);
      return reply(502, 'sessao_indisponivel');
    }
    let parsed: { treasury?: unknown; fundos?: unknown };
    try {
      parsed = JSON.parse((await req.body()) || '{}') as { treasury?: unknown; fundos?: unknown };
    } catch {
      return reply(400, 'pedido_invalido');
    }
    const cnpjs = requestedCnpjs(parsed?.fundos);
    if (cnpjs === null) return reply(400, 'pedido_invalido');
    const wantTreasury = parsed?.treasury === true;
    if (!wantTreasury && cnpjs.length === 0) return reply(400, 'pedido_invalido');

    const today = deps.today();
    let anyOk = false;
    let treasury: TreasuryPrices | null = null;
    if (wantTreasury) {
      const t = await loadTreasury();
      treasury = t.value;
      if (t.ok) anyOk = true;
    }
    const fundos: Record<string, FundQuoteResult> = {};
    if (cnpjs.length > 0) {
      // O mês de hoje. O anterior só quando o de hoje ainda não tem arquivo ou nos primeiros dias do mês (a cota sai com atraso); com o
      // mês de hoje fora do ar, nada do anterior (a cota velha pareceria a de agora): o fundo fica de fora e o app diz que não conseguiu.
      const current = monthOf(today);
      const cur = await loadMonth(current, cnpjs);
      if (cur.ok) {
        anyOk = true;
        const missing = cnpjs.filter((c) => !cur.quotes.has(c));
        const early = Number(today.slice(8, 10)) <= EARLY_MONTH_DAYS;
        const prev = missing.length > 0 && (cur.missingFile || early) ? await loadMonth(addMonths(current, -1), missing) : null;
        for (const c of cnpjs) {
          const q = cur.quotes.get(c) ?? prev?.quotes.get(c);
          if (q) fundos[c] = q;
          else if (!prev || prev.ok) fundos[c] = null;
        }
      }
    }
    if (!anyOk) return reply(502, 'precos_indisponiveis');
    return { status: 200, body: JSON.stringify({ treasury, fundos, fetchedOn: today }), headers: { ...headers, 'Content-Type': JSON_TYPE } };
  };
}
