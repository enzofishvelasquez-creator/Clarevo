import { describe, expect, it } from 'vitest';
import { createIndicesHandler, indicesConfigFrom, indicesStartMonth } from '../src/indices/servidor';

const TODAY = '2026-11-11';
const req = (over: Partial<{ method: string; url: string; origin: string | null; body: string; auth: string | null }> = {}) => ({
  method: over.method ?? 'POST',
  url: over.url ?? 'https://projeto.supabase.co/functions/v1/indices',
  header: (name: string) =>
    name === 'origin' ? (over.origin === undefined ? 'https://app.clarevo.app.br' : over.origin) : name === 'authorization' ? (over.auth === undefined ? 'Bearer token-da-sessao' : over.auth) : null,
  body: async () => over.body ?? '{"desde":"2025-11"}',
});
const CONFIG = { appUrl: 'https://app.clarevo.app.br', supabaseUrl: 'https://projeto.supabase.co', userApiKey: 'sb_publishable_teste' };
const AUTH_URL = 'https://projeto.supabase.co/auth/v1/user';
type Fetch = Parameters<typeof createIndicesHandler>[0]['fetch'];
/** O Supabase Auth do teste: o token "token-da-sessao" é de uma pessoa; qualquer outro, 401. */
const withAuth =
  (bcb: Fetch): Fetch =>
  async (url, init) => {
    if (url === AUTH_URL) {
      const okToken = init.headers?.Authorization === 'Bearer token-da-sessao' && init.headers?.apikey === 'sb_publishable_teste';
      return { ok: okToken, status: okToken ? 200 : 401, json: async () => (okToken ? { id: '11111111-1111-4111-8111-111111111111' } : { msg: 'invalid' }) };
    }
    return bcb(url, init);
  };

describe('função "indices" (D-093): CDI e IPCA do Banco Central', () => {
  it('o mês de partida: o pedido, limitado a 2000-01 e ao mês de hoje; sem pedido, 24 meses antes', () => {
    expect(indicesStartMonth('2025-11', TODAY)).toBe('2025-11');
    expect(indicesStartMonth('1990-01', TODAY)).toBe('2000-01');
    expect(indicesStartMonth('2027-01', TODAY)).toBe('2026-11');
    expect(indicesStartMonth('lixo', TODAY)).toBe('2024-11');
    expect(indicesStartMonth(null, TODAY)).toBe('2024-11');
    expect(indicesConfigFrom(() => undefined)).toEqual({ appUrl: 'https://app.clarevo.app.br', supabaseUrl: '', userApiKey: '' });
    expect(indicesConfigFrom(() => 'https://outro.app/').appUrl).toBe('https://outro.app');
    const env: Record<string, string> = { SUPABASE_URL: 'https://projeto.supabase.co/', SUPABASE_ANON_KEY: 'anon', SUPABASE_SECRET_KEYS: '{"default":"sb_secret_x"}' };
    expect(indicesConfigFrom((n) => env[n])).toEqual({ appUrl: 'https://app.clarevo.app.br', supabaseUrl: 'https://projeto.supabase.co', userApiKey: 'anon' });
    expect(indicesConfigFrom((n) => ({ ...env, SUPABASE_ANON_KEY: '' })[n]).userApiKey).toBe('sb_secret_x');
    expect(indicesConfigFrom((n) => ({ ...env, SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_y' })[n]).userApiKey).toBe('sb_publishable_y');
  });

  it('busca as quatro séries (CDI, IPCA, Selic do mês e poupança), devolve só os meses válidos e guarda por 6 horas', async () => {
    const urls: string[] = [];
    let clock = 0;
    const handler = createIndicesHandler({
      config: CONFIG,
      today: () => TODAY,
      now: () => clock,
      fetch: withAuth(async (url) => {
        urls.push(url);
        const body = url.includes('sgs.4391') ? [{ data: '01/10/2026', valor: '0,93' }, { data: 'x', valor: '1' }] : [{ data: '01/10/2026', valor: '0,25' }];
        return { ok: true, status: 200, json: async () => body };
      }),
    });
    const r = await handler(req());
    expect(r.status).toBe(200);
    expect(JSON.parse(r.body)).toEqual({ cdi: { '2026-10': 0.93 }, ipca: { '2026-10': 0.25 }, selic: { '2026-10': 0.25 }, poupanca: { '2026-10': 0.25 }, fetchedOn: TODAY });
    expect(r.headers['Access-Control-Allow-Origin']).toBe('https://app.clarevo.app.br');
    expect(urls.sort()).toEqual([
      'https://api.bcb.gov.br/dados/serie/bcdata.sgs.195/dados?formato=json&dataInicial=01/11/2025&dataFinal=11/11/2026',
      'https://api.bcb.gov.br/dados/serie/bcdata.sgs.433/dados?formato=json&dataInicial=01/11/2025&dataFinal=11/11/2026',
      'https://api.bcb.gov.br/dados/serie/bcdata.sgs.4390/dados?formato=json&dataInicial=01/11/2025&dataFinal=11/11/2026',
      'https://api.bcb.gov.br/dados/serie/bcdata.sgs.4391/dados?formato=json&dataInicial=01/11/2025&dataFinal=11/11/2026',
    ]);
    await handler(req());
    expect(urls).toHaveLength(4);
    clock = 6 * 60 * 60 * 1000 + 1;
    await handler(req());
    expect(urls).toHaveLength(8);
  });

  it('o Banco Central fora do ar: 502, sem índice inventado; outra origem não recebe CORS; método errado, 405', async () => {
    const handler = createIndicesHandler({
      config: CONFIG,
      today: () => TODAY,
      fetch: withAuth(async () => ({ ok: false, status: 503, json: async () => null })),
    });
    const r = await handler(req({ origin: 'https://outro.site' }));
    expect(r.status).toBe(502);
    expect(JSON.parse(r.body)).toEqual({ erro: 'indices_indisponiveis' });
    expect(r.headers['Access-Control-Allow-Origin']).toBeUndefined();
    expect((await handler(req({ method: 'OPTIONS' }))).status).toBe(204);
    expect((await handler(req({ method: 'DELETE' }))).status).toBe(405);
    // GET com ?desde.
    const ok = createIndicesHandler({ config: { ...CONFIG, appUrl: 'x' }, today: () => TODAY, fetch: withAuth(async (url) => ({ ok: true, status: 200, json: async () => (url.includes('01/01/2026') ? [] : null) })) });
    expect((await ok(req({ method: 'GET', url: 'https://x/functions/v1/indices?desde=2026-01' }))).status).toBe(200);
  });

  it('cada série à parte: o IPCA ainda não publicado (404) ou com falha não derruba o CDI, e a resposta incompleta não fica guardada', async () => {
    let calls = 0;
    let ipcaStatus = 404;
    const handler = createIndicesHandler({
      config: CONFIG,
      today: () => TODAY,
      fetch: withAuth(async (url) => {
        calls += 1;
        if (url.includes('sgs.433')) return { ok: false, status: ipcaStatus, json: async () => null };
        return { ok: true, status: 200, json: async () => [{ data: '01/10/2026', valor: '0,93' }] };
      }),
    });
    const r = await handler(req());
    expect(r.status).toBe(200);
    expect(JSON.parse(r.body)).toEqual({ cdi: { '2026-10': 0.93 }, ipca: {}, selic: { '2026-10': 0.93 }, poupanca: { '2026-10': 0.93 }, fetchedOn: TODAY });
    // 404 é "ainda sem dado": a resposta fica guardada.
    await handler(req());
    expect(calls).toBe(4);
    // Falha só do IPCA: 200 com o CDI, sem guardar (a próxima tenta de novo).
    ipcaStatus = 500;
    const other = createIndicesHandler({ config: { ...CONFIG, appUrl: 'x' }, today: () => TODAY, fetch: withAuth(async (url) => (url.includes('sgs.433') ? { ok: false, status: 500, json: async () => null } : { ok: true, status: 200, json: async () => [] })) });
    expect((await other(req())).status).toBe(200);
  });

  it('a Selic do mês ou a poupança com falha: 200 com o CDI e o IPCA, e a resposta fica guardada (sem quatro consultas a cada abertura)', async () => {
    let calls = 0;
    const handler = createIndicesHandler({
      config: CONFIG,
      today: () => TODAY,
      fetch: withAuth(async (url) => {
        calls += 1;
        if (url.includes('sgs.195')) return { ok: false, status: 500, json: async () => null };
        return { ok: true, status: 200, json: async () => [{ data: '01/10/2026', valor: '0,93' }] };
      }),
    });
    const r = await handler(req());
    expect(r.status).toBe(200);
    expect(JSON.parse(r.body)).toMatchObject({ cdi: { '2026-10': 0.93 }, ipca: { '2026-10': 0.93 }, poupanca: {} });
    await handler(req());
    expect(calls).toBe(4);
  });

  it('a poupança (série diária) começa no máximo 118 meses antes: o Banco Central limita a consulta a 10 anos', async () => {
    const urls: string[] = [];
    const handler = createIndicesHandler({ config: CONFIG, today: () => TODAY, fetch: withAuth(async (url) => (urls.push(url), { ok: true, status: 200, json: async () => [] })) });
    await handler(req({ method: 'GET', url: 'https://x/functions/v1/indices?desde=2010-01' }));
    expect(urls.find((u) => u.includes('sgs.195'))).toContain('dataInicial=01/01/2017');
    expect(urls.find((u) => u.includes('sgs.4391'))).toContain('dataInicial=01/01/2010');
  });

  it('só quem está no app: confere a sessão no Supabase Auth antes de tudo, com qualquer chave de assinatura', async () => {
    const urls: string[] = [];
    let authDown = false;
    const handler = createIndicesHandler({
      config: CONFIG,
      today: () => TODAY,
      fetch: async (url, init) => {
        urls.push(url);
        if (url === AUTH_URL && authDown) throw new Error('timeout');
        return withAuth(async () => ({ ok: true, status: 200, json: async () => [] }))(url, init);
      },
    });
    // Sem token, com a chave pública no lugar do token ou com token vencido: 401, sem consultar o Banco Central.
    for (const auth of [null, 'Bearer sb_publishable_teste', 'Bearer token-vencido', 'token-sem-bearer']) {
      const r = await handler(req({ auth }));
      expect(r.status).toBe(401);
      expect(JSON.parse(r.body)).toEqual({ erro: 'nao_autenticado' });
      expect(r.headers['Access-Control-Allow-Origin']).toBe('https://app.clarevo.app.br');
    }
    expect(urls.some((u) => u.includes('bcb.gov.br'))).toBe(false);
    // O pré-voo do navegador (OPTIONS) não leva token e passa.
    expect((await handler(req({ method: 'OPTIONS', auth: null }))).status).toBe(204);
    // Com a sessão: 200.
    expect((await handler(req())).status).toBe(200);
    // O Supabase Auth fora do ar: 502, sem índice.
    authDown = true;
    const down = await handler(req());
    expect(down.status).toBe(502);
    expect(JSON.parse(down.body)).toEqual({ erro: 'sessao_indisponivel' });
    // Sem o endereço do projeto ou a chave: 503.
    const bare = createIndicesHandler({ config: { ...CONFIG, supabaseUrl: '' }, today: () => TODAY, fetch: withAuth(async () => ({ ok: true, status: 200, json: async () => [] })) });
    expect((await bare(req())).status).toBe(503);
  });
});
