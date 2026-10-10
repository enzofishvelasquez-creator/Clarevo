import { readSefazPage, type AccessKeyInfo, type SefazFetch, type SefazReadResult } from '@clarevo/core';
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

export function readSefazOnDevice(officialUrl: string, key: AccessKeyInfo): Promise<SefazReadResult> {
  return readSefazPage(testFetch() ?? ((url, init) => fetch(url, init)), officialUrl, key);
}
