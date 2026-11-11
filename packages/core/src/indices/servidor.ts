import type { IsoDate, IsoMonth } from '../dates';
import { addMonths, isValidIsoMonth, monthOf, monthsBetween, todayIn } from '../dates';
import { BCB_SERIES, bcbSeriesUrl, parseBcbSeries } from '../investments';
import { serviceKeyFrom } from '../servidor-comum';

/**
 * Função do servidor "indices" (D-093, `docs/45_INVESTIMENTOS.md`): busca no Banco Central as séries mensais do CDI (4391, acumulado no
 * mês) e do IPCA (433, variação mensal), que são públicas, e devolve ao app para comparar com a rentabilidade dos investimentos. Não
 * recebe nem guarda dado de ninguém: só o mês de partida. Guarda a resposta por 6 horas na memória da função (o Banco Central atualiza
 * uma vez por mês), para não repetir a consulta a cada tela aberta. Só quem está no app consulta: a função confere a sessão da pessoa no
 * Supabase Auth (GET /auth/v1/user), como a da assinatura, e é publicada com a verificação de JWT do painel **desligada** (a do painel só
 * aceita tokens assinados com o segredo antigo e recusaria as sessões assinadas com as chaves novas do Supabase).
 *
 * Pedido: POST com {"desde": "AAAA-MM"} (ou GET com ?desde=AAAA-MM); sem mês válido, os 24 meses anteriores ao mês de hoje; nunca antes
 * de 2000-01 nem depois do mês de hoje. Resposta 200: {"cdi": {"AAAA-MM": 0.93, ...}, "ipca": {...}, "fetchedOn": "AAAA-MM-DD"};
 * 502 {"erro": "indices_indisponiveis"} quando o Banco Central não responde (o app diz que não conseguiu, nunca inventa índice).
 * Sem sessão válida: 401 {"erro": "nao_autenticado"}; o Supabase Auth fora do ar: 502 {"erro": "sessao_indisponivel"}.
 */

export interface IndicesConfig {
  /** Endereço do app (CORS): só ele e o app em desenvolvimento no próprio computador recebem resposta no navegador. */
  appUrl: string;
  /** Endereço do projeto (SUPABASE_URL) e a chave pública usada para conferir a sessão; o Supabase fornece os dois. Vazio: 503. */
  supabaseUrl: string;
  userApiKey: string;
}

/** Hoje no horário de Brasília (o dia do pedido; os índices são mensais). */
export function brazilToday(): IsoDate {
  return todayIn('America/Sao_Paulo');
}

export function indicesConfigFrom(env: (name: string) => string | undefined): IndicesConfig {
  const v = (name: string) => (env(name) ?? '').trim();
  return {
    appUrl: (v('CLAREVO_APP_URL') || 'https://app.clarevo.app.br').replace(/\/+$/, ''),
    supabaseUrl: v('SUPABASE_URL').replace(/\/+$/, ''),
    userApiKey: v('SUPABASE_PUBLISHABLE_KEY') || v('SUPABASE_ANON_KEY') || serviceKeyFrom(v),
  };
}

export interface IndicesFetch {
  (url: string, init: { timeoutMs: number; headers?: Record<string, string> }): Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;
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
    const reply = (status: number, erro: string) => ({ status, body: JSON.stringify({ erro }), headers: { ...headers, 'Content-Type': JSON_TYPE } });
    if (req.method !== 'GET' && req.method !== 'POST') return reply(405, 'metodo');
    // A sessão da pessoa, conferida pelo próprio Supabase Auth (assinatura e validade), com qualquer tipo de chave de assinatura.
    const auth = /^Bearer\s+(\S+)$/i.exec(req.header('authorization') ?? '');
    if (!auth) return reply(401, 'nao_autenticado');
    if (deps.config.supabaseUrl === '' || deps.config.userApiKey === '') {
      deps.log?.('indices: configuracao');
      return reply(503, 'indisponivel');
    }
    try {
      const r = await deps.fetch(`${deps.config.supabaseUrl}/auth/v1/user`, { timeoutMs: 8000, headers: { apikey: deps.config.userApiKey, Authorization: `Bearer ${auth[1]}` } });
      if (r.status === 401 || r.status === 403) return reply(401, 'nao_autenticado');
      const id = r.ok ? ((await r.json()) as { id?: unknown } | null)?.id : null;
      if (typeof id !== 'string' || id === '') {
        deps.log?.(`indices: auth_${r.status}`);
        return r.ok ? reply(401, 'nao_autenticado') : reply(502, 'sessao_indisponivel');
      }
    } catch (e) {
      deps.log?.(`indices: auth_${e instanceof Error ? e.message : 'falha'}`);
      return reply(502, 'sessao_indisponivel');
    }
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
    // Cada série à parte (revisão de 11/11/2026): o IPCA do mês ainda não publicado (404, ou uma falha só dele) não leva o CDI junto.
    // Só as duas falhando dá 502; resposta com uma série faltando não fica guardada, para a próxima consulta tentar de novo.
    const get = async (code: number): Promise<{ ok: boolean; series: Record<IsoMonth, number> }> => {
      try {
        const r = await deps.fetch(bcbSeriesUrl(code, `${from}-01`, today), { timeoutMs: 8000 });
        if (r.status === 404) return { ok: true, series: {} };
        if (!r.ok) {
          deps.log?.(`indices: bcb_${code}_${r.status}`);
          return { ok: false, series: {} };
        }
        return { ok: true, series: parseBcbSeries(await r.json()) };
      } catch (e) {
        deps.log?.(`indices: bcb_${code}_${e instanceof Error ? e.message : 'falha'}`);
        return { ok: false, series: {} };
      }
    };
    const [cdi, ipca] = await Promise.all([get(BCB_SERIES.cdi), get(BCB_SERIES.ipca)]);
    if (!cdi.ok && !ipca.ok) return reply(502, 'indices_indisponiveis');
    const body = JSON.stringify({ cdi: cdi.series, ipca: ipca.series, fetchedOn: today });
    if (cdi.ok && ipca.ok) cache.set(key, { at: now(), body });
    return { status: 200, body, headers: { ...headers, 'Content-Type': JSON_TYPE } };
  };
}
