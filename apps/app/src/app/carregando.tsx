import { LOAD_ERROR_TEXT, loadErrorText, signedOutScreen } from '@clarevo/core';
import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import { router, type Href } from 'expo-router';
import { LogOut } from 'lucide-react-native';
import { useEffect, useSyncExternalStore } from 'react';
import { StyleSheet, View } from 'react-native';

import { LogoSymbol } from '@/components/brand';
import { FeedbackButton } from '@/components/feedback-button';
import { ErrorState, LoadingState } from '@/components/states';
import { Button } from '@/components/ui';
import { pendingBenefit, pendingBusinessInvite, pendingInvite } from '@/lib/invite-target';
import { afterLogin, restoreTarget, signOutIntent, signupEntryTarget } from '@/lib/nav';
import { useSession } from '@/state/session';
import { useSpaceStatus } from '@/state/space-status';
import { colors, space } from '@/theme/tokens';

/** Tela neutra enquanto a sessão e o espaço são conferidos. Decide para onde seguir. */
export default function Carregando() {
  const { status, retry } = useSpaceStatus();
  const { user, recovery, signOut } = useSession();
  // Falha ao carregar a conta (teste com pessoas, 16/11/2026): o erro da consulta do espaço (`['space', id]`, de app/_layout.tsx) diz se
  // foi a conexão. Enquanto uma nova tentativa roda, a tela volta a "Preparando seu espaço…"; quando ela termina, o texto é o do último erro.
  const queryClient = useQueryClient();
  const spaceError = useSyncExternalStore(
    (onChange) => queryClient.getQueryCache().subscribe(onChange),
    () => queryClient.getQueryState(['space', user?.id])?.error ?? null,
  );
  const retrying = useIsFetching({ queryKey: ['space', user?.id] }) > 0;
  const failed = status === 'erro' && !retrying;

  useEffect(() => {
    // O link de cadastro do site (`signupEntryTarget`) vale só para quem abre a página sem sessão; com sessão, sai da memória sem uso.
    if (user) signupEntryTarget.take();
    if (recovery && user) router.replace('/nova-senha');
    // Sem sessão: Entrar, para retomar o destino de quem teve a sessão encerrada; Criar conta, quando a página abriu pelo link de cadastro
    // do site (com o plano escolhido no endereço); senão, as boas-vindas.
    else if (status === 'sem-sessao') router.replace(signedOutScreen(afterLogin.pending(), signupEntryTarget.take()) as Href);
    else if (status === 'sem-conta') router.replace('/primeira-conta');
    else if (status === 'pronto' && user) {
      const target = afterLogin.take(user.id);
      // Um convite para a Família que esperava a entrada (D-055) volta a abrir; o endereço pedido antes tem a vez primeiro.
      const invite = pendingInvite.take();
      // O mesmo vale para o convite da empresa (D-056) e para o convite do negócio (D-120).
      const benefit = pendingBenefit.take();
      const business = pendingBusinessInvite.take();
      if (target) restoreTarget(target);
      else if (invite) restoreTarget(`/convite/${invite}`);
      else if (business) restoreTarget(`/convite/negocio/${business}`);
      else if (benefit) restoreTarget(`/beneficio/${benefit}`);
      else router.replace('/');
    }
  }, [status, recovery, user]);

  return (
    <View style={styles.wrap}>
      <LogoSymbol size={72} variant="reverso" animated />
      {failed ? (
        // Sem beco sem saída: além de tentar de novo, sair da conta (a entrada volta a aparecer) ou mandar o problema para a equipe.
        <View style={{ alignSelf: 'stretch', gap: space[3] }}>
          <ErrorState message={loadErrorText(spaceError)} onRetry={retry} onBrand />
          <Button
            label={LOAD_ERROR_TEXT.signOut}
            icon={LogOut}
            tone="onBrand"
            onPress={() => {
              signOutIntent.mark();
              signOut().catch(() => {});
            }}
          />
          <FeedbackButton label={LOAD_ERROR_TEXT.report} screen="/carregando" tone="onBrand" onBrand />
        </View>
      ) : (
        <LoadingState label="Preparando seu espaço…" color={colors.textOnBrand} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', gap: space[6], padding: space[8] },
});
