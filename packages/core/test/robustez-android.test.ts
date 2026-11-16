/// <reference types="node" />
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as core from '../src';
import { APP_DIR, loadApp } from './app-sandbox';

/**
 * Robustez no Android (revisão independente de 16/11/2026), provada sem aparelho com os arquivos do app carregados no sandbox:
 * - lib/net-fetch.ts: tempo máximo das chamadas ao servidor e nenhuma chamada de dados só com a chave pública enquanto há pessoa na sessão;
 * - lib/external-screen.ts: a marca "o app abriu uma tela de fora" (câmera, galeria, seletor de arquivos, compartilhar, configurações);
 * - lib/supabase.ts: sem conexão ao abrir, com o token vencido, a sessão guardada no aparelho continua (marcada `offline`);
 * - lib/nav.ts: a aba Investir volta como aba.
 */

const SRC = path.join(APP_DIR, 'src');

afterEach(() => {
  vi.useRealTimers();
});

describe('lib/net-fetch.ts: o tempo máximo das chamadas', () => {
  const net = loadApp(path.join(SRC, 'lib', 'net-fetch.ts'), { platform: 'android' });

  it('15 s nas chamadas comuns; 60 s na foto do perfil, na imagem da meta, na importação, na exclusão da conta e nas funções do servidor', () => {
    const base = 'https://projeto.supabase.co';
    expect(net.NET_TIMEOUT_MS).toBe(15_000);
    expect(net.NET_LONG_TIMEOUT_MS).toBe(60_000);
    for (const long of ['/rest/v1/rpc/set_my_photo', '/rest/v1/rpc/set_goal_image', '/rest/v1/rpc/import_records', '/rest/v1/rpc/delete_my_account', '/functions/v1/precos']) {
      expect(net.timeoutFor(base + long), long).toBe(60_000);
    }
    for (const common of ['/rest/v1/rpc/create_record', '/rest/v1/rpc/my_photo', '/rest/v1/records?select=*', '/auth/v1/token?grant_type=refresh_token', '/rest/v1/rpc/set_my_photo_extra']) {
      expect(net.timeoutFor(base + common), common).toBe(15_000);
    }
  });

  it('uma rede que não responde: a chamada é cancelada no tempo e falha como interrompida (sem repetir sozinha)', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const base = vi.fn((_input: unknown, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return new Promise<Response>(() => {});
    });
    const fetch = net.fetchWithTimeout(base) as typeof globalThis.fetch;
    const call = fetch('https://projeto.supabase.co/rest/v1/records?select=*', { method: 'GET' });
    const failed = expect(call).rejects.toMatchObject({ name: 'AbortError' });
    await vi.advanceTimersByTimeAsync(14_999);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await failed;
    expect(signal?.aborted).toBe(true);
  });

  it('a resposta que chega antes: passa sem mudança e o relógio é desligado; o cancelamento de quem chamou chega à chamada', async () => {
    vi.useFakeTimers();
    const response = { ok: true } as Response;
    const fetch = net.fetchWithTimeout(async () => response) as typeof globalThis.fetch;
    await expect(fetch('https://projeto.supabase.co/rest/v1/x', {})).resolves.toBe(response);
    expect(vi.getTimerCount()).toBe(0);

    let inner: AbortSignal | undefined;
    const slow = net.fetchWithTimeout((_input: unknown, init?: RequestInit) => {
      inner = init?.signal ?? undefined;
      return new Promise<Response>((_resolve, reject) => inner?.addEventListener('abort', () => reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }))));
    }) as typeof globalThis.fetch;
    const outer = new AbortController();
    const call = slow('https://projeto.supabase.co/rest/v1/x', { signal: outer.signal });
    outer.abort();
    await expect(call).rejects.toMatchObject({ name: 'AbortError' });
    expect(inner?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('lib/net-fetch.ts: nenhuma chamada de dados só com a chave pública enquanto há pessoa na sessão', () => {
  const net = loadApp(path.join(SRC, 'lib', 'net-fetch.ts'), { platform: 'android' });
  const KEY = 'chave-publica';
  const setup = (expected: boolean) => {
    const base = vi.fn(async () => ({ ok: true }) as Response);
    const state = { expected };
    const fetch = net.withSessionGuard(base, { publicKey: KEY, sessionExpected: () => state.expected }) as typeof globalThis.fetch;
    return { base, state, fetch };
  };
  const auth = (token: string | null) => ({ headers: new Headers(token ? { Authorization: `Bearer ${token}`, apikey: KEY } : { apikey: KEY }) });

  it('com pessoa na sessão e sem o token dela (renovação sem conexão): a leitura falha como falta de conexão e não sai', async () => {
    const t = setup(true);
    await expect(t.fetch('https://projeto.supabase.co/rest/v1/persons?select=id', auth(KEY))).rejects.toMatchObject({ name: 'AbortError' });
    await expect(t.fetch('https://projeto.supabase.co/functions/v1/precos', auth(null))).rejects.toMatchObject({ name: 'AbortError' });
    expect(t.base).not.toHaveBeenCalled();
  });

  it('com o token da pessoa, sem pessoa na sessão ou na entrada na conta (/auth/v1): a chamada sai', async () => {
    const t = setup(true);
    await t.fetch('https://projeto.supabase.co/rest/v1/persons?select=id', auth('token-da-pessoa'));
    await t.fetch('https://projeto.supabase.co/auth/v1/token?grant_type=refresh_token', auth(KEY));
    t.state.expected = false;
    await t.fetch('https://projeto.supabase.co/rest/v1/rpc/preview_family_invite', auth(KEY));
    expect(t.base).toHaveBeenCalledTimes(3);
  });
});

describe('lib/external-screen.ts: a marca de tela de fora', () => {
  const setup = () => {
    const listeners = new Set<(state: string) => void>();
    const reactNative = {
      AppState: {
        addEventListener: (_type: string, fn: (state: string) => void) => {
          listeners.add(fn);
          return { remove: () => listeners.delete(fn) };
        },
      },
    };
    const mod = loadApp(path.join(SRC, 'lib', 'external-screen.ts'), { platform: 'android', mocks: { 'react-native': reactNative } });
    return { mod, listeners, emit: (state: string) => [...listeners].forEach((fn) => fn(state)) };
  };

  it('dura a promessa inteira, também quando ela falha, e conta telas abertas uma por cima da outra', async () => {
    const { mod } = setup();
    expect(mod.externalScreenOpen()).toBe(false);
    let finish: () => void = () => {};
    const first = mod.withExternalScreen(() => new Promise<void>((resolve) => (finish = resolve)));
    const second = mod.withExternalScreen(async () => {
      throw new Error('seletor falhou');
    });
    expect(mod.externalScreenOpen()).toBe(true);
    await expect(second).rejects.toThrow('seletor falhou');
    expect(mod.externalScreenOpen()).toBe(true);
    finish();
    await first;
    expect(mod.externalScreenOpen()).toBe(false);
  });

  it('as configurações do aparelho: até voltar ao primeiro plano depois de sair; sem sair em 5 s, a marca acaba sozinha', () => {
    vi.useFakeTimers();
    const { mod, listeners, emit } = setup();
    mod.openingExternalScreen();
    emit('active');
    expect(mod.externalScreenOpen()).toBe(true);
    emit('background');
    vi.advanceTimersByTime(60_000);
    expect(mod.externalScreenOpen()).toBe(true);
    emit('active');
    expect(mod.externalScreenOpen()).toBe(false);
    expect(listeners.size).toBe(0);

    mod.openingExternalScreen();
    vi.advanceTimersByTime(4_999);
    expect(mod.externalScreenOpen()).toBe(true);
    vi.advanceTimersByTime(1);
    expect(mod.externalScreenOpen()).toBe(false);
    expect(listeners.size).toBe(0);
  });
});

describe('lib/nav.ts: abas substituem a pilha', () => {
  it('Movimentos, Metas, Investir e Aprender voltam como aba; as outras telas abrem por cima do Resumo', () => {
    const router = { replace: vi.fn(), push: vi.fn(), dismissTo: vi.fn() };
    const nav = loadApp(path.join(SRC, 'lib', 'nav.ts'), { platform: 'android', mocks: { '@clarevo/core': core, 'expo-router': { router } } });
    for (const tab of ['/movimentacoes', '/metas', '/investimentos', '/investimentos?filtro=1', '/aprender/']) {
      router.replace.mockClear();
      router.push.mockClear();
      nav.restoreTarget(tab);
      expect(router.replace, tab).toHaveBeenCalledWith(tab);
      expect(router.push, tab).not.toHaveBeenCalled();
    }
    router.replace.mockClear();
    nav.restoreTarget('/investimento/abc');
    expect(router.replace).toHaveBeenCalledWith('/');
    expect(router.push).toHaveBeenCalledWith('/investimento/abc');
  });
});

describe('lib/supabase.ts: sem conexão ao abrir, a sessão guardada continua', () => {
  const STORAGE_KEY = 'sb-projeto-auth-token';
  const storedSession = {
    access_token: 'token-vencido',
    refresh_token: 'renovacao',
    expires_at: 1,
    user: { id: 'pessoa-1', email: 'ana@exemplo.com', user_metadata: { display_name: 'Ana' }, email_confirmed_at: '2026-10-01T00:00:00Z' },
  };

  function setup(options: { getSession: () => Promise<unknown>; stored?: string | null; platform?: 'android' | 'web' }) {
    const authListeners: ((event: string, session: unknown) => void)[] = [];
    let createOptions: { global?: { fetch?: typeof globalThis.fetch } } = {};
    const client = {
      storageKey: STORAGE_KEY,
      auth: {
        getSession: vi.fn(options.getSession),
        onAuthStateChange: (fn: (event: string, session: unknown) => void) => {
          authListeners.push(fn);
          return { data: { subscription: { unsubscribe: () => {} } } };
        },
        signInWithPassword: vi.fn(async () => ({ error: null })),
        startAutoRefresh: () => {},
        stopAutoRefresh: () => {},
      },
    };
    // O lib/auth.ts de verdade (AuthError com o código), com a marca de entrada observada.
    const authModule = loadApp(path.join(SRC, 'lib', 'auth.ts'), { platform: options.platform ?? 'android' });
    const signInMark = authModule.signInMark as { set: () => void; happened: () => boolean };
    vi.spyOn(signInMark, 'set');
    const getItem = vi.fn(async (key: string) => (key === STORAGE_KEY ? (options.stored ?? null) : null));
    const prevUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
    const prevKey = process.env.EXPO_PUBLIC_SUPABASE_KEY;
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://projeto.supabase.co';
    process.env.EXPO_PUBLIC_SUPABASE_KEY = 'chave-publica';
    try {
      const mod = loadApp(path.join(SRC, 'lib', 'supabase.ts'), {
        platform: options.platform ?? 'android',
        mocks: {
          '@clarevo/core': core,
          '@react-native-async-storage/async-storage': { default: { getItem }, getItem },
          '@supabase/supabase-js': {
            createClient: (_url: string, _key: string, opts: typeof createOptions) => {
              createOptions = opts;
              return client;
            },
          },
          'expo-linking': { createURL: (p: string) => `clarevo://${p}`, parse: () => ({}) },
          'react-native': { AppState: { addEventListener: () => ({ remove: () => {} }) }, Platform: { OS: options.platform ?? 'android' } },
          './auth': authModule,
          './supabase-repository': { SupabaseRepository: class {} },
        },
      });
      const auth = new mod.SupabaseAuth();
      const emit = (event: string, session: unknown) => authListeners.forEach((fn) => fn(event, session));
      return { auth, client, getItem, signInMark, emit, fetch: () => createOptions.global?.fetch };
    } finally {
      process.env.EXPO_PUBLIC_SUPABASE_URL = prevUrl;
      process.env.EXPO_PUBLIC_SUPABASE_KEY = prevKey;
    }
  }

  const offlineError = { name: 'AuthRetryableFetchError', message: 'Network request failed', status: 0 };

  it('token vencido e sem conexão: vale a pessoa da sessão guardada, marcada offline (e não a tela de boas-vindas)', async () => {
    const t = setup({ getSession: async () => ({ data: { session: null }, error: offlineError }), stored: JSON.stringify(storedSession) });
    await expect(t.auth.init()).resolves.toEqual({
      user: { id: 'pessoa-1', email: 'ana@exemplo.com', displayName: 'Ana', emailConfirmed: true },
      recovery: false,
      offline: true,
    });
    expect(t.getItem).toHaveBeenCalledWith(STORAGE_KEY);
  });

  it('a conferência que lança também conta como falta de conexão; sem sessão guardada legível, nenhuma pessoa, mas offline', async () => {
    const thrown = setup({ getSession: async () => Promise.reject(new Error('travou')), stored: JSON.stringify(storedSession) });
    await expect(thrown.auth.init()).resolves.toMatchObject({ user: { id: 'pessoa-1' }, offline: true });
    for (const stored of [null, '{nao é json', JSON.stringify({ user: { id: 'pessoa-1' } })]) {
      const t = setup({ getSession: async () => ({ data: { session: null }, error: offlineError }), stored });
      await expect(t.auth.init(), String(stored)).resolves.toEqual({ user: null, recovery: false, offline: true });
    }
  });

  it('sem sessão guardada, ou com a renovação recusada pelo servidor: sem pessoa e sem a marca offline (a sessão acabou)', async () => {
    const none = setup({ getSession: async () => ({ data: { session: null }, error: null }), stored: JSON.stringify(storedSession) });
    await expect(none.auth.init()).resolves.toEqual({ user: null, recovery: false });
    const refused = setup({
      getSession: async () => ({ data: { session: null }, error: { name: 'AuthApiError', message: 'Invalid Refresh Token', code: 'refresh_token_not_found', status: 400 } }),
      stored: JSON.stringify(storedSession),
    });
    await expect(refused.auth.init()).resolves.toEqual({ user: null, recovery: false });
  });

  it('com a sessão restaurada sem conexão, nenhuma leitura sai só com a chave pública; depois do fim da sessão, sai', async () => {
    const t = setup({ getSession: async () => ({ data: { session: null }, error: offlineError }), stored: JSON.stringify(storedSession) });
    await t.auth.init();
    const fetch = t.fetch()!;
    expect(fetch).toBeTypeOf('function');
    const anon = { headers: new Headers({ Authorization: 'Bearer chave-publica', apikey: 'chave-publica' }) };
    await expect(fetch('https://projeto.supabase.co/rest/v1/persons?select=id', anon)).rejects.toMatchObject({ name: 'AbortError' });
    const real = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('[]'));
    try {
      t.emit('SIGNED_OUT', null);
      await expect(fetch('https://projeto.supabase.co/rest/v1/persons?select=id', anon)).resolves.toBeInstanceOf(Response);
      expect(real).toHaveBeenCalledTimes(1);
    } finally {
      real.mockRestore();
    }
  });

  it('o aviso inicial da biblioteca ("sem sessão" sem conexão) não apaga a pessoa; os outros avisos chegam', async () => {
    vi.useFakeTimers();
    const t = setup({ getSession: async () => ({ data: { session: null }, error: offlineError }), stored: JSON.stringify(storedSession) });
    const listener = vi.fn();
    t.auth.subscribe(listener);
    t.emit('INITIAL_SESSION', null);
    vi.advanceTimersByTime(10);
    expect(listener).not.toHaveBeenCalled();
    t.emit('TOKEN_REFRESHED', storedSession);
    vi.advanceTimersByTime(10);
    expect(listener).toHaveBeenCalledWith({ user: expect.objectContaining({ id: 'pessoa-1' }), recovery: false });
  });

  it('entrar com e-mail e senha marca a entrada neste uso do app (a biometria ao abrir não trava quem acabou de entrar)', async () => {
    const t = setup({ getSession: async () => ({ data: { session: null }, error: null }) });
    await t.auth.signIn(' ana@exemplo.com ', 'senha1234');
    expect(t.client.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'ana@exemplo.com', password: 'senha1234' });
    expect(t.signInMark.set).toHaveBeenCalledTimes(1);
  });
});
