import { FULL_ACCESS, type Access, type WebSubscriptionStatus } from '@clarevo/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { accessRefused } from '@/lib/access-refused';
import { useSession } from '@/state/session';

/**
 * A situação do acesso da pessoa (assinatura paga, D-083): my_access. Recarrega quando o banco recusa uma escrita por falta de
 * assinatura (o teste acabou com o app aberto) e ao voltar para o app depois de um tempo (staleTime padrão).
 */
export function useAccess() {
  const { repo, user } = useSession();
  const qc = useQueryClient();
  useEffect(() => accessRefused.listen(() => void qc.invalidateQueries({ queryKey: ['access'] })), [qc]);
  return useQuery({
    queryKey: ['access', user?.id ?? null],
    queryFn: (): Promise<Access> => repo!.getMyAccess(),
    enabled: Boolean(repo && user),
  });
}

/**
 * Se a pessoa anota e muda dados, pela assinatura. Enquanto carrega ou se a leitura falhar, vale "sim": a trava é do banco, e o app
 * não esconde os botões de quem pode anotar por causa de uma falha de rede.
 */
export function useAccessCanWrite(): boolean {
  return (useAccess().data ?? FULL_ACCESS).canWrite;
}

/** Recarregar a situação do acesso (depois de aceitar um benefício, entrar ou sair de uma Família) e a da assinatura no cartão. */
export function useReloadAccess() {
  const qc = useQueryClient();
  return () => Promise.all([qc.invalidateQueries({ queryKey: ['access'] }), qc.invalidateQueries({ queryKey: ['web-subscription'] })]);
}

/**
 * A assinatura no cartão feita na web (12/11/2026, teste no sandbox): se ainda está ativa no Asaas, e quando renova, ou se foi cancelada.
 * Depois de cancelar, o acesso continua até o fim do período pago, então só o Asaas diz que ela não renova. Só na web e só para quem
 * assinou na web (`enabled`); null quando não deu para saber (a tela segue como antes).
 */
export function useWebSubscriptionStatus(enabled: boolean) {
  const { repo, user } = useSession();
  return useQuery({
    queryKey: ['web-subscription', user?.id ?? null],
    queryFn: (): Promise<WebSubscriptionStatus | null> => repo!.getWebSubscriptionStatus(),
    enabled: Boolean(enabled && repo && user),
    staleTime: 60_000,
    retry: false,
  });
}
