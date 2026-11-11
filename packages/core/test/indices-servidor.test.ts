import { describe, expect, it } from 'vitest';
import { createIndicesHandler, indicesConfigFrom, indicesStartMonth } from '../src/indices/servidor';

const TODAY = '2026-11-11';
const req = (over: Partial<{ method: string; url: string; origin: string | null; body: string }> = {}) => ({
  method: over.method ?? 'POST',
  url: over.url ?? 'https://projeto.supabase.co/functions/v1/indices',
  header: (name: string) => (name === 'origin' ? (over.origin === undefined ? 'https://app.clarevo.app.br' : over.origin) : null),
  body: async () => over.body ?? '{"desde":"2025-11"}',
});

describe('função "indices" (D-093): CDI e IPCA do Banco Central', () => {
  it('o mês de partida: o pedido, limitado a 2000-01 e ao mês de hoje; sem pedido, 24 meses antes', () => {
    expect(indicesStartMonth('2025-11', TODAY)).toBe('2025-11');
    expect(indicesStartMonth('1990-01', TODAY)).toBe('2000-01');
    expect(indicesStartMonth('2027-01', TODAY)).toBe('2026-11');
    expect(indicesStartMonth('lixo', TODAY)).toBe('2024-11');
    expect(indicesStartMonth(null, TODAY)).toBe('2024-11');
    expect(indicesConfigFrom(() => undefined).appUrl).toBe('https://app.clarevo.app.br');
    expect(indicesConfigFrom(() => 'https://outro.app/').appUrl).toBe('https://outro.app');
  });

  it('busca as duas séries, devolve só os meses válidos e guarda por 6 horas', async () => {
    const urls: string[] = [];
    let clock = 0;
    const handler = createIndicesHandler({
      config: { appUrl: 'https://app.clarevo.app.br' },
      today: () => TODAY,
      now: () => clock,
      fetch: async (url) => {
        urls.push(url);
        const body = url.includes('sgs.4391') ? [{ data: '01/10/2026', valor: '0,93' }, { data: 'x', valor: '1' }] : [{ data: '01/10/2026', valor: '0,25' }];
        return { ok: true, status: 200, json: async () => body };
      },
    });
    const r = await handler(req());
    expect(r.status).toBe(200);
    expect(JSON.parse(r.body)).toEqual({ cdi: { '2026-10': 0.93 }, ipca: { '2026-10': 0.25 }, fetchedOn: TODAY });
    expect(r.headers['Access-Control-Allow-Origin']).toBe('https://app.clarevo.app.br');
    expect(urls.sort()).toEqual([
      'https://api.bcb.gov.br/dados/serie/bcdata.sgs.433/dados?formato=json&dataInicial=01/11/2025&dataFinal=11/11/2026',
      'https://api.bcb.gov.br/dados/serie/bcdata.sgs.4391/dados?formato=json&dataInicial=01/11/2025&dataFinal=11/11/2026',
    ]);
    await handler(req());
    expect(urls).toHaveLength(2);
    clock = 6 * 60 * 60 * 1000 + 1;
    await handler(req());
    expect(urls).toHaveLength(4);
  });

  it('o Banco Central fora do ar: 502, sem índice inventado; outra origem não recebe CORS; método errado, 405', async () => {
    const handler = createIndicesHandler({
      config: { appUrl: 'https://app.clarevo.app.br' },
      today: () => TODAY,
      fetch: async () => ({ ok: false, status: 503, json: async () => null }),
    });
    const r = await handler(req({ origin: 'https://outro.site' }));
    expect(r.status).toBe(502);
    expect(JSON.parse(r.body)).toEqual({ erro: 'indices_indisponiveis' });
    expect(r.headers['Access-Control-Allow-Origin']).toBeUndefined();
    expect((await handler(req({ method: 'OPTIONS' }))).status).toBe(204);
    expect((await handler(req({ method: 'DELETE' }))).status).toBe(405);
    // GET com ?desde.
    const ok = createIndicesHandler({ config: { appUrl: 'x' }, today: () => TODAY, fetch: async (url) => ({ ok: true, status: 200, json: async () => (url.includes('01/01/2026') ? [] : null) }) });
    expect((await ok(req({ method: 'GET', url: 'https://x/functions/v1/indices?desde=2026-01' }))).status).toBe(200);
  });
});
