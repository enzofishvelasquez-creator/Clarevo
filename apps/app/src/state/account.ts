import { deleteOutcomeUncertain, isRepoError, newOperationKey } from '@clarevo/core';
import { useRef } from 'react';

import { deletedAccountIntent } from '@/lib/nav';
import { useRepo } from '@/state/session';

export type DeleteAttempt = { ok: true } | { ok: false; code: string };

/**
 * Excluir a conta (D-058): uma chave de operação por tentativa. A mesma chave segue enquanto o servidor não respondeu (a conexão
 * caiu: tocar de novo repete a operação, e o banco responde sem erro se a conta já foi excluída); depois de uma recusa definitiva, a
 * próxima tentativa usa chave nova. Fica só na memória da tela. `confirmation` é sempre a palavra exata, nunca o texto digitado.
 *
 * A intenção de excluir é marcada ANTES da chamada (`deletedAccountIntent`): se a resposta se perder e a sessão cair, o app sabe que a
 * conta pode ter sido excluída, limpa o aparelho e diz que não foi possível confirmar, em vez de abrir Entrar sem dizer nada. A
 * resposta do servidor a confirma; uma recusa definitiva a limpa (a conta segue); a falta de resposta a mantém marcada.
 */
export function useDeleteAccount() {
  const repo = useRepo();
  const key = useRef<string | null>(null);
  return async (confirmation: string): Promise<DeleteAttempt> => {
    key.current ??= newOperationKey();
    deletedAccountIntent.begin();
    try {
      await repo.deleteMyAccount(confirmation, key.current);
      key.current = null;
      deletedAccountIntent.confirm();
      return { ok: true };
    } catch (e) {
      const code = isRepoError(e) ? e.code : 'desconhecido';
      if (!deleteOutcomeUncertain(code)) {
        key.current = null;
        deletedAccountIntent.clear();
      }
      return { ok: false, code };
    }
  };
}
