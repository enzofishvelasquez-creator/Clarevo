import { readSefazPage, type AccessKeyInfo, type SefazFetch, type SefazReadResult } from '@clarevo/core';
import { fetch as expoFetch } from 'expo/fetch';
import { Platform } from 'react-native';

/**
 * Lê a página pública da Sefaz-RJ no próprio aparelho (D-038). Só no celular: no navegador o CORS bloqueia a leitura, e a tela mostra
 * apenas "Ver a nota no site da Sefaz". Sem servidor do Clarevo; sem credenciais; a página é descartada depois da leitura.
 *
 * Gancho só do roteiro de testes da web: se a página tiver `globalThis.__clarevoSefazFetch`, ele faz o papel do `fetch` (o roteiro o
 * define com uma página sintética para exercitar o caminho completo; no navegador de uma pessoa ele não existe, e a leitura segue
 * indisponível).
 */
function testFetch(): SefazFetch | null {
  const hook = (globalThis as { __clarevoSefazFetch?: unknown }).__clarevoSefazFetch;
  return typeof hook === 'function' ? (hook as SefazFetch) : null;
}

export function sefazReadAvailable(): boolean {
  return Platform.OS !== 'web' || testFetch() !== null;
}

/**
 * O `fetch` global do React Native pode ignorar `redirect: 'manual'` e seguir os redirecionamentos por conta própria. Por isso, no
 * celular a leitura usa o `fetch` de `expo/fetch` (Expo SDK 57), que repassa `redirect` ao código nativo: no Android o OkHttp passa a
 * não seguir redirecionamentos e no iOS a URLSession devolve a resposta 3xx, com o cabeçalho Location, para o Clarevo conferir o
 * domínio de cada salto (`readSefazPage`). Mesmo assim, as garantias que não dependem do `fetch` continuam valendo: o domínio da
 * resposta final (`url`) precisa ser o oficial e a página precisa ser da mesma nota (chave de acesso).
 */
export function readSefazOnDevice(officialUrl: string, key: AccessKeyInfo): Promise<SefazReadResult> {
  return readSefazPage(testFetch() ?? ((url, init) => expoFetch(url, init)), officialUrl, key);
}
