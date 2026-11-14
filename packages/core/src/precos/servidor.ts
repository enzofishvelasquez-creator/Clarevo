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
  const months = new Map<string, { at: number; value: Map<string, Exclude<FundQuoteResult, null>> }>();

  const loadTreasury = async (): Promise<{ ok: boolean; value: TreasuryPrices | null }> => {
    if (treasury && now() - treasury.at < CACHE_MS) return { ok: true, value: treasury.value };
    try {
      const reader = treasuryReader();
      const r = await deps.fetchLines(TREASURY_PRICES_URL, { timeoutMs: 20000 }, reader.onLine);
      const value = reader.result();
      if (!r.ok || value === null) {
        deps.log?.(`precos: tesouro_${r.status}`);
        return { ok: false, value: null };
      }
      treasury = { at: now(), value };
      return { ok: true, value };
    } catch (e) {
      deps.log?.(`precos: tesouro_${e instanceof Error ? e.message : 'falha'}`);
      return { ok: false, value: null };
    }
  };

  /** As cotas do mês (todas, a mais recente de cada CNPJ); mês ainda sem arquivo (404) vem vazio. */
  const loadMonth = async (month: string): Promise<{ ok: boolean; value: Map<string, Exclude<FundQuoteResult, null>> }> => {
    const hit = months.get(month);
    if (hit && now() - hit.at < CACHE_MS) return { ok: true, value: hit.value };
    try {
      const r = await deps.fetchBytes(cvmDailyUrl(month), { timeoutMs: 40000 });
      if (r.status === 404) {
        const empty = new Map<string, Exclude<FundQuoteResult, null>>();
        months.set(month, { at: now(), value: empty });
        return { ok: true, value: empty };
      }
      if (!r.ok) {
        deps.log?.(`precos: cvm_${month}_${r.status}`);
        return { ok: false, value: new Map() };
      }
      const entry = zipFirstEntry(await r.bytes());
      if (!entry || entry.method !== 8) {
        deps.log?.(`precos: cvm_${month}_zip`);
        return { ok: false, value: new Map() };
      }
      const reader = cvmReader();
      let rest = '';
      for await (const chunk of deps.inflateRaw(entry.data)) {
        const lines = (rest + chunk).split('\n');
        rest = lines.pop() ?? '';
        for (const line of lines) reader.onLine(line);
      }
      if (rest !== '') reader.onLine(rest);
      const value = reader.result();
      // Só um mês por vez na memória (o atual e o anterior entram e saem): os dois juntos passariam de 50 mil fundos.
      for (const k of [...months.keys()]) if (k !== month && months.size >= 2) months.delete(k);
      months.set(month, { at: now(), value });
      return { ok: true, value };
    } catch (e) {
      deps.log?.(`precos: cvm_${month}_${e instanceof Error ? e.message : 'falha'}`);
      return { ok: false, value: new Map() };
    }
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
      // O mês de hoje e, para o que faltar (começo do mês, fundo que atrasou), o anterior.
      const current = monthOf(today);
      const cur = await loadMonth(current);
      const missing = cnpjs.filter((c) => !cur.value.has(c));
      const prev = missing.length > 0 ? await loadMonth(addMonths(current, -1)) : { ok: true, value: new Map<string, Exclude<FundQuoteResult, null>>() };
      if (cur.ok || prev.ok) anyOk = true;
      for (const c of cnpjs) {
        const q = cur.value.get(c) ?? prev.value.get(c);
        // Sem a fonte de um dos meses, quem não foi achado fica de fora (não é "não encontrado"): o app diz que não conseguiu buscar.
        if (q) fundos[c] = q;
        else if (cur.ok && prev.ok) fundos[c] = null;
      }
    }
    if (!anyOk) return reply(502, 'precos_indisponiveis');
    return { status: 200, body: JSON.stringify({ treasury, fundos, fetchedOn: today }), headers: { ...headers, 'Content-Type': JSON_TYPE } };
  };
}
