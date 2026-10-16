import { isRepoError, newOperationKey } from '@clarevo/core';
import { useRef } from 'react';

import { useRepo } from '@/state/session';

/** O servidor não respondeu (a conexão caiu): o resultado é incerto e a mesma chave deve ser reenviada. */
const UNCERTAIN_CODES: readonly string[] = ['rede', 'desconhecido'];

export type DeleteAttempt = { ok: true } | { ok: false; code: string };

/**
 * Excluir a conta (D-058): uma chave de operação por tentativa. A mesma chave segue enquanto o servidor não respondeu (a conexão
 * caiu: tocar de novo repete a operação, e o banco responde sem erro se a conta já foi excluída); depois de uma recusa definitiva, a
 * próxima tentativa usa chave nova. Fica só na memória da tela. `confirmation` é sempre a palavra exata, nunca o texto digitado.
 */
export function useDeleteAccount() {
  const repo = useRepo();
  const key = useRef<string | null>(null);
  return async (confirmation: string): Promise<DeleteAttempt> => {
    key.current ??= newOperationKey();
    try {
      await repo.deleteMyAccount(confirmation, key.current);
      key.current = null;
      return { ok: true };
    } catch (e) {
      const code = isRepoError(e) ? e.code : 'desconhecido';
      if (!UNCERTAIN_CODES.includes(code)) key.current = null;
      return { ok: false, code };
    }
  };
}
