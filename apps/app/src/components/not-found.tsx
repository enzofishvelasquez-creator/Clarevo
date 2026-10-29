import { NOT_FOUND_TEXT } from '@clarevo/core';
import { router } from 'expo-router';
import { View } from 'react-native';

import { AuthShell } from '@/components/auth-shell';
import { Button, Txt } from '@/components/ui';
import { useSession } from '@/state/session';
import { colors, space } from '@/theme/tokens';

/**
 * Endereço que não existe no app (`+not-found`) e a lista de rotas do roteador (`_sitemap`), que não é mostrada: uma tela em
 * português, no lugar da tela padrão em inglês. Com sessão, leva ao Resumo; sem sessão, ao início (o roteador decide a entrada).
 */
export function NotFound() {
  const { user } = useSession();
  return (
    <AuthShell title={NOT_FOUND_TEXT.title}>
      <Txt color={colors.textSecondary}>{NOT_FOUND_TEXT.body}</Txt>
      <View style={{ gap: space[3], marginTop: space[2] }}>
        <Button label={user ? NOT_FOUND_TEXT.goSummary : NOT_FOUND_TEXT.goStart} onPress={() => router.replace(user ? '/' : '/boas-vindas')} />
      </View>
    </AuthShell>
  );
}
