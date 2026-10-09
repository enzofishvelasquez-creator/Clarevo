import type { RepoError } from '@clarevo/core';

import { isRefusal, type OperationAttempt } from '@/state/data';

/**
 * Escrita com chave de operação e reconciliação de resultado incerto (padrão das telas de conta a pagar e de gasto fixo,
 * agora para metas, renda de referência e plano de guardar). Quem chama guarda as chaves com useGoalOperationKey,
 * useIncomeReferenceOperationKey ou useSavingsOperationKey e passa o conteúdo enviado em `snapshot`.
 *
 * - ok: o servidor confirmou (o cache já está atualizado quando isto volta); nenhuma animação antes disso;
 * - reconciled: uma tentativa anterior com resultado incerto tinha sido gravada (findSaved) e os dados já foram
 *   recarregados: mostrar como concluído;
 * - refused: o servidor respondeu e recusou (nada foi gravado com a chave): mostrar o texto do código;
 * - uncertain: falha de rede ou erro desconhecido; a gravação pode ou não ter acontecido. A tentativa fica guardada
 *   e a próxima, com o mesmo conteúdo, usa a mesma chave (o banco devolve o estado atual, sem gravar de novo).
 */
export interface OperationKeys<F extends object> {
  hasPending: () => boolean;
  findSaved: () => Promise<(OperationAttempt & F) | null>;
  keyFor: (snapshot: string) => string;
  uncertain: (key: string, snapshot: string) => void;
  settled: () => void;
  refused: () => void;
}

export type WriteResult<T, F extends object> =
  | { status: 'ok'; value: T }
  | { status: 'reconciled'; saved: OperationAttempt & F }
  | { status: 'refused'; code: string; detail: string | null }
  | { status: 'uncertain' };

export async function guardedWrite<T, F extends object>(
  keys: OperationKeys<F>,
  snapshot: string,
  send: (key: string) => Promise<T>,
  accept?: (saved: OperationAttempt & F) => boolean,
  /**
   * Escritas sem busca de operação (renda de referência e resposta do plano de guardar): repetir uma vez, com a mesma chave e o
   * mesmo conteúdo, é a reconciliação (o banco devolve o estado atual, sem gravar de novo). Se a rede continua fora, a
   * segunda tentativa também fica incerta e quem chama mostra a falha.
   */
  options: { retryOnce?: boolean } = {},
): Promise<WriteResult<T, F>> {
  const first = await attempt(keys, snapshot, send, accept);
  if (first.status === 'uncertain' && options.retryOnce) return attempt(keys, snapshot, send, accept);
  return first;
}

async function attempt<T, F extends object>(
  keys: OperationKeys<F>,
  snapshot: string,
  send: (key: string) => Promise<T>,
  accept?: (saved: OperationAttempt & F) => boolean,
): Promise<WriteResult<T, F>> {
  if (keys.hasPending()) {
    try {
      const saved = await keys.findSaved();
      if (saved && (!accept || accept(saved))) {
        keys.settled();
        return { status: 'reconciled', saved };
      }
    } catch {
      // Não deu para conferir a tentativa anterior: ela continua guardada e é conferida de novo na próxima vez.
      return { status: 'uncertain' };
    }
  }
  const key = keys.keyFor(snapshot);
  try {
    const value = await send(key);
    keys.settled();
    return { status: 'ok', value };
  } catch (e) {
    if (isRefusal(e)) {
      keys.refused();
      const error = e as RepoError;
      return { status: 'refused', code: error.code, detail: error.detail ?? null };
    }
    keys.uncertain(key, snapshot);
    return { status: 'uncertain' };
  }
}
