import type { GoalStatus } from '@clarevo/core';

/**
 * A tentativa incerta guardada (snapshot de changeStatus: ['situacao', metaId, versão, situação]) pedia esta situação?
 * Uma resposta perdida de "Arquivar" seguida de "Reativar" também é 'situacao_meta' da mesma meta; só a situação pedida diz se
 * a tentativa achada no banco é a que a pessoa quer agora. Snapshot ilegível: não aceita (a escrita é enviada com chave nova).
 */
export function statusAttemptMatches(snapshot: string, status: GoalStatus): boolean {
  try {
    const parsed: unknown = JSON.parse(snapshot);
    return Array.isArray(parsed) && parsed[0] === 'situacao' && parsed[3] === status;
  } catch {
    return false;
  }
}
