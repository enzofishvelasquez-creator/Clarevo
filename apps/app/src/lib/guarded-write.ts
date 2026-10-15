/**
 * Escrita com chave de operação e reconciliação de resultado incerto (padrão das telas de conta a pagar e de gasto fixo, agora para
 * metas, renda de referência, plano de guardar, cartões e contas). A regra e os casos estão em `packages/core/src/pending.ts`, onde
 * os testes rodam com o repositório em memória; aqui só o caminho que as telas já usavam.
 */
export { guardedWrite, type OperationKeys, type WriteResult } from '@clarevo/core';
