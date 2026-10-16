import { DELETE_TEXT } from '@clarevo/core';
import { Redirect, router } from 'expo-router';
import { View } from 'react-native';

import { AuthShell } from '@/components/auth-shell';
import { Button, Txt } from '@/components/ui';
import { useSession } from '@/state/session';
import { colors, space } from '@/theme/tokens';

/**
 * Depois de excluir a conta (D-058): a sessão terminou e esta é a tela de entrada. Diz que a conta foi excluída e que o e-mail ficou
 * livre; oferece criar uma conta nova (que começa vazia) ou voltar ao início. Aberta sem sessão, como as telas de entrada, e fora do grupo protegido de entrada (o roteador a abre assim que a sessão termina).
 */
export default function ContaExcluida() {
  const { user } = useSession();
  // A tela é só para quem está sem sessão: quem a abre com a conta aberta volta ao início.
  if (user) return <Redirect href="/" />;
  return (
    <AuthShell title={DELETE_TEXT.doneTitle}>
      <Txt color={colors.textSecondary}>{DELETE_TEXT.doneBody}</Txt>
      <View style={{ gap: space[3], marginTop: space[2] }}>
        <Button label={DELETE_TEXT.doneCreate} onPress={() => router.push('/criar-conta')} />
        <Button label={DELETE_TEXT.doneStart} tone="soft" onPress={() => router.replace('/boas-vindas')} />
      </View>
    </AuthShell>
  );
}
