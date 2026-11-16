/**
 * O `fetch` que o cliente do Supabase usa (lib/supabase.ts, `global.fetch`), em duas camadas sem dependência do Expo:
 * - `fetchWithTimeout`: toda chamada tem tempo máximo. No celular, a conexão do React Native não tem nenhum, e uma rede que não responde
 *   (sinal fraco, Wi-Fi com página de login) deixava a tela carregando para sempre. Ao estourar, a chamada falha como falta de conexão e
 *   não é repetida sozinha; as escritas levam chave de idempotência, então "Tentar novamente" não duplica nada.
 * - `withSessionGuard`: com uma pessoa na sessão do app, nenhuma leitura ou escrita sai sem o token dela. Sem conseguir renovar o token
 *   (sem conexão ao abrir o app, ou logo depois de uma falha, que a biblioteca guarda por um minuto), a biblioteca mandaria a chamada só
 *   com a chave pública, e o banco responderia "nada" (a RLS esconde tudo): o app mostraria "Sua primeira conta" ou listas vazias. A
 *   chamada falha como falta de conexão, e "Tentar novamente" funciona quando a sessão voltar.
 */

/** Tempo máximo de uma chamada comum. */
export const NET_TIMEOUT_MS = 15_000;
/** Tempo máximo das chamadas pesadas: fotos, importação em lote, exclusão da conta e as funções do servidor que consultam outros sites. */
export const NET_LONG_TIMEOUT_MS = 60_000;

const LONG_CALLS = /\/rest\/v1\/rpc\/(set_my_photo|set_goal_image|import_records|delete_my_account)\/?(\?|$)|\/functions\/v1\//;
/** Leituras e escritas de dados (não a entrada na conta, `/auth/v1`, que funciona sem sessão). */
const DATA_CALLS = /\/(rest|functions|storage)\/v1\//;

type Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

/** O tempo máximo de uma chamada, pelo endereço. */
export function timeoutFor(url: string): number {
  return LONG_CALLS.test(url) ? NET_LONG_TIMEOUT_MS : NET_TIMEOUT_MS;
}

/**
 * Falha que as bibliotecas tratam como chamada interrompida: o PostgREST não repete (um GET que já esperou o tempo todo não espera mais
 * três vezes), o Auth a vê como falha de rede que se pode tentar de novo (a sessão guardada fica) e o app a mostra como falta de conexão.
 */
function abortError(message: string): Error {
  const e = new Error(message);
  e.name = 'AbortError';
  return e;
}

export function fetchWithTimeout(base: Fetch, timeoutOf: (url: string) => number = timeoutFor): Fetch {
  return (input, init) => {
    const outer = init?.signal ?? null;
    if (outer?.aborted) return base(input, init);
    const controller = new AbortController();
    const forward = () => controller.abort();
    outer?.addEventListener('abort', forward);
    return new Promise<Response>((resolve, reject) => {
      const timer = setTimeout(() => {
        controller.abort();
        reject(abortError('Network request timed out'));
      }, timeoutOf(urlOf(input)));
      base(input, { ...init, signal: controller.signal })
        .then(resolve, reject)
        .finally(() => {
          clearTimeout(timer);
          outer?.removeEventListener('abort', forward);
        });
    });
  };
}

export function withSessionGuard(base: Fetch, options: { publicKey: string; sessionExpected: () => boolean }): Fetch {
  return (input, init) => {
    if (options.sessionExpected() && DATA_CALLS.test(urlOf(input))) {
      const authorization = new Headers(init?.headers ?? undefined).get('Authorization');
      if (!authorization || authorization === `Bearer ${options.publicKey}`) {
        return Promise.reject(abortError('Network request failed: session not refreshed'));
      }
    }
    return base(input, init);
  };
}
