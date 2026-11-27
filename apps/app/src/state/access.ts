import {
  FULL_ACCESS,
  shownAccountLevel,
  type Access,
  type AccountLevel,
  type AccountLevelState,
  type OwnWebEntitlement,
  type ShownAccountLevel,
  type WebSubscriptionStatus,
  type WebWithdrawalState,
} from '@clarevo/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { accessRefused } from '@/lib/access-refused';
import { forgetChosenPlanUnlessUseful } from '@/lib/chosen-plan';
import { useSession } from '@/state/session';

/**
 * A situação do acesso da pessoa (assinatura paga, D-083): my_access. Recarrega quando o banco recusa uma escrita por falta de
 * assinatura (o teste acabou com o app aberto) e ao voltar para o app depois de um tempo (staleTime padrão). Quando a situação chega e a
 * conta já não escolhe plano (por exemplo, quem entrou já assina), o plano escolhido no site sai do aparelho (revisão independente da D-131).
 */
export function useAccess() {
  const { repo, user } = useSession();
  const qc = useQueryClient();
  useEffect(
    () =>
      accessRefused.listen(() => {
        void qc.invalidateQueries({ queryKey: ['access'] });
        void qc.invalidateQueries({ queryKey: ['web-entitlements'] });
      }),
    [qc],
  );
  const query = useQuery({
    queryKey: ['access', user?.id ?? null],
    queryFn: (): Promise<Access> => repo!.getMyAccess(),
    enabled: Boolean(repo && user),
  });
  const status = query.data?.status;
  useEffect(() => {
    if (status) forgetChosenPlanUnlessUseful(status);
  }, [status]);
  return query;
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
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['access'] }),
      qc.invalidateQueries({ queryKey: ['web-subscription'] }),
      qc.invalidateQueries({ queryKey: ['web-entitlements'] }),
      qc.invalidateQueries({ queryKey: ['web-withdrawal'] }),
    ]);
}

/**
 * O próprio direito pela web (D-129, `plan_entitlements` com a RLS, sem chamar o Asaas): se há assinatura no cartão, paga ou marcada para o
 * fim do teste, e se a primeira cobrança ainda não foi paga (`pendingFirstCharge`). Com ele, a situação no Asaas (`situacao`, que gasta a
 * cota da API do Asaas) só é pedida quando há um direito pela web que vale. `enabled`: só para quem pode ter um (o teste e quem assina na
 * web). Uma falha de leitura devolve erro (`isError`), e quem usa decide (excluir a conta não segue sem saber).
 */
export function useOwnWebEntitlements(enabled: boolean) {
  const { repo, user } = useSession();
  return useQuery({
    queryKey: ['web-entitlements', user?.id ?? null],
    queryFn: (): Promise<OwnWebEntitlement[]> => repo!.getOwnWebEntitlements(),
    enabled: Boolean(enabled && repo && user),
    staleTime: 60_000,
    retry: false,
  });
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

/**
 * A desistência em 7 dias (D-131, item F): se há compra pela web no prazo, ou o pedido já recebido, lido na função do servidor (o Asaas e o
 * banco; nada do aparelho decide o prazo). Só com a desistência aberta (ou no teste da equipe) e só para quem assina pela web (`enabled`);
 * null quando não deu para saber (a tela não mostra nada).
 */
export function useWebWithdrawal(enabled: boolean) {
  const { repo, user } = useSession();
  return useQuery({
    queryKey: ['web-withdrawal', user?.id ?? null],
    queryFn: (): Promise<WebWithdrawalState | null> => repo!.getWebWithdrawal(),
    enabled: Boolean(enabled && repo && user),
    staleTime: 60_000,
    retry: false,
  });
}

/**
 * Os marcos do nível da conta e o tempo sem anotar (D-095, D-111): `my_account_marks(true)`, uma leitura por pessoa. Quem mostra o nível pede
 * de novo ao voltar para a tela (`refetch`), porque qualquer anotação pode ter concluído um marco ou zerado o tempo sem anotar. Falha de
 * leitura não mostra nível nenhum.
 */
export function useAccountLevelState() {
  const { repo, user } = useSession();
  return useQuery({
    queryKey: ['account-marks', user?.id ?? null],
    queryFn: (): Promise<AccountLevelState> => repo!.getAccountLevel(),
    enabled: Boolean(repo && user),
    staleTime: 15_000,
    retry: false,
  });
}

/** O nível mostrado hoje (D-111: o dos marcos, menos um degrau a cada 60 dias sem anotar) e o aviso, ou nulo enquanto carrega ou se a leitura falhar. */
export function useShownLevel(): ShownAccountLevel | null {
  const { today } = useSession();
  const state = useAccountLevelState().data;
  return state ? shownAccountLevel(state, today) : null;
}

/** O nível mostrado (o selo de Conta), ou nulo enquanto carrega ou se a leitura falhar. */
export function useAccountLevel(): AccountLevel | null {
  return useShownLevel()?.level ?? null;
}
