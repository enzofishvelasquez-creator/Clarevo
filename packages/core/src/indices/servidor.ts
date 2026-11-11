import type { IsoDate, IsoMonth } from '../dates';
import { addMonths, isValidIsoMonth, monthOf, monthsBetween, todayIn } from '../dates';
import { BCB_SERIES, bcbSeriesUrl, parseBcbSeries } from '../investments';

/**
 * Função do servidor "indices" (D-093, `docs/45_INVESTIMENTOS.md`): busca no Banco Central as séries mensais do CDI (4391, acumulado no
 * mês) e do IPCA (433, variação mensal), que são públicas, e devolve ao app para comparar com a rentabilidade dos investimentos. Não
 * recebe nem guarda dado de ninguém: só o mês de partida. Guarda a resposta por 6 horas na memória da função (o Banco Central atualiza
 * uma vez por mês), para não repetir a consulta a cada tela aberta. Publicada com "Verify JWT" ligado: só quem está no app consulta.
 *
 * Pedido: POST com {"desde": "AAAA-MM"} (ou GET com ?desde=AAAA-MM); sem mês válido, os 24 meses anteriores ao mês de hoje; nunca antes
 * de 2000-01 nem depois do mês de hoje. Resposta 200: {"cdi": {"AAAA-MM": 0.93, ...}, "ipca": {...}, "fetchedOn": "AAAA-MM-DD"};
 * 502 {"erro": "indices_indisponiveis"} quando o Banco Central não responde (o app diz que não conseguiu, nunca inventa índice).
 */

export interface IndicesConfig {
  /** Endereço do app (CORS): só ele e o app em desenvolvimento no próprio computador recebem resposta no navegador. */
  appUrl: string;
}

/** Hoje no horário de Brasília (o dia do pedido; os índices são mensais). */
export function brazilToday(): IsoDate {
  return todayIn('America/Sao_Paulo');
}

export function indicesConfigFrom(env: (name: string) => string | undefined): IndicesConfig {
  return { appUrl: (env('CLAREVO_APP_URL') ?? 'https://app.clarevo.app.br').replace(/\/+$/, '') };
}

export interface IndicesFetch {
  (url: string, init: { timeoutMs: number }): Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;
}

export interface IndicesRequest {
  method: string;
  url: string;
  header: (name: string) => string | null;
  body: () => Promise<string>;
}

export interface IndicesResponse {
  status: number;
  body: string;
  headers: Record<string, string>;
}

const CACHE_MS = 6 * 60 * 60 * 1000;
const FIRST_MONTH: IsoMonth = '2000-01';
const JSON_TYPE = 'application/json; charset=utf-8';

function cors(origin: string | null, appUrl: string): Record<string, string> {
  if (origin === null) return {};
  if (origin !== appUrl && !/^http:\/\/localhost(:\d+)?$/.test(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

/** O mês de partida pedido, dentro de 2000-01 e do mês de hoje; sem pedido válido, 24 meses antes do mês de hoje. */
export function indicesStartMonth(requested: unknown, today: IsoDate): IsoMonth {
  const current = monthOf(today);
  const fallback = addMonths(current, -24);
  const m = typeof requested === 'string' && isValidIsoMonth(requested) ? requested : fallback;
  if (monthsBetween(FIRST_MONTH, m) < 0) return FIRST_MONTH;
  if (monthsBetween(m, current) < 0) return current;
  return m;
}

export function createIndicesHandler(deps: { config: IndicesConfig; fetch: IndicesFetch; today: () => IsoDate; now?: () => number; log?: (m: string) => void }) {
  const cache = new Map<string, { at: number; body: string }>();
  const now = deps.now ?? (() => Date.now());
  return async (req: IndicesRequest): Promise<IndicesResponse> => {
    const headers = cors(req.header('origin'), deps.config.appUrl);
    if (req.method === 'OPTIONS') return { status: 204, body: '', headers };
    if (req.method !== 'GET' && req.method !== 'POST') return { status: 405, body: JSON.stringify({ erro: 'metodo' }), headers: { ...headers, 'Content-Type': JSON_TYPE } };
    let requested: unknown = null;
    if (req.method === 'GET') {
      try {
        requested = new URL(req.url).searchParams.get('desde');
      } catch {
        requested = null;
      }
    } else {
      try {
        const parsed = JSON.parse((await req.body()) || '{}') as { desde?: unknown };
        requested = parsed?.desde ?? null;
      } catch {
        requested = null;
      }
    }
    const today = deps.today();
    const from = indicesStartMonth(requested, today);
    const key = `${from}|${today}`;
    const hit = cache.get(key);
    if (hit && now() - hit.at < CACHE_MS) return { status: 200, body: hit.body, headers: { ...headers, 'Content-Type': JSON_TYPE } };
    try {
      const get = async (code: number) => {
        const r = await deps.fetch(bcbSeriesUrl(code, `${from}-01`, today), { timeoutMs: 8000 });
        if (!r.ok) throw new Error(`bcb_${code}_${r.status}`);
        return parseBcbSeries(await r.json());
      };
      const [cdi, ipca] = await Promise.all([get(BCB_SERIES.cdi), get(BCB_SERIES.ipca)]);
      const body = JSON.stringify({ cdi, ipca, fetchedOn: today });
      cache.set(key, { at: now(), body });
      return { status: 200, body, headers: { ...headers, 'Content-Type': JSON_TYPE } };
    } catch (e) {
      deps.log?.(`indices: ${e instanceof Error ? e.message : 'falha'}`);
      return { status: 502, body: JSON.stringify({ erro: 'indices_indisponiveis' }), headers: { ...headers, 'Content-Type': JSON_TYPE } };
    }
  };
}
