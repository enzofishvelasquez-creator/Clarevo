import { useEffect, useRef } from 'react';

/**
 * Chama `reset` quando o espaço da tela muda depois de aberta (D-113b: a pílula das telas de consulta troca o espaço sem sair da tela).
 * Serve para o que a tela guarda e que só vale num espaço: a conta escolhida, as linhas marcadas, a categoria tocada num gráfico. Não
 * chama na primeira leitura nem enquanto o espaço carrega (`contextId` indefinido).
 */
export function useContextChange(contextId: string | undefined, reset: () => void) {
  const last = useRef(contextId);
  const latest = useRef(reset);
  latest.current = reset;
  useEffect(() => {
    if (!contextId) return;
    if (last.current && last.current !== contextId) latest.current();
    last.current = contextId;
  }, [contextId]);
}
