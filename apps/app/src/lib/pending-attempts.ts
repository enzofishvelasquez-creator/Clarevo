import { PendingAttemptStore } from '@clarevo/core';

/**
 * Tentativas de escrita com resultado incerto (CL-03 e CL-19), fora dos formulários: só na memória do app, por pessoa e por tipo de
 * formulário. Assim, sair do formulário e anotar de novo depois de um "Não deu para confirmar se salvou" ainda confere a tentativa
 * anterior e reusa a chave, sem duplicar. Nada disto vai ao aparelho nem ao servidor; some ao sair da conta, ao trocar de pessoa e ao
 * recarregar a página (as regras estão em `packages/core/src/pending.ts`).
 */
export const pendingAttempts = new PendingAttemptStore();
