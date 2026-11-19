import { NOT_FOUND_TEXT } from '@clarevo/core';
import { router } from 'expo-router';
import { View } from 'react-native';

import { AuthShell } from '@/components/auth-shell';
import { SubHeader } from '@/components/header';
import { Button, Card, Screen, Txt } from '@/components/ui';
import { useSession } from '@/state/session';
import { colors, space } from '@/theme/tokens';

/**
 * Endereço que não existe no app (`+not-found`) e a lista de rotas do roteador (`_sitemap`), que não é mostrada: uma tela em
 * português, no lugar da tela padrão em inglês. Com sessão, leva ao Resumo; sem sessão, ao início (o roteador decide a entrada).
 */
export function NotFound() {
  const { user } = useSession();
  // Com sessão, dentro do app: o cabeçalho das telas internas (voltar e o título), como as telas irmãs (auditoria de 18/11/2026: a tela
  // repetia o logotipo ao lado da barra lateral). Sem sessão, a moldura da entrada, com o logotipo.
  if (user) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <SubHeader title={NOT_FOUND_TEXT.title} onBack={() => router.replace('/')} />
        <Screen contentStyle={{ padding: space[5], gap: space[4] }}>
          <Card style={{ gap: space[3] }}>
            <Txt color={colors.textSecondary}>{NOT_FOUND_TEXT.body}</Txt>
            <Button label={NOT_FOUND_TEXT.goSummary} onPress={() => router.replace('/')} />
          </Card>
        </Screen>
      </View>
    );
  }
  return (
    <AuthShell title={NOT_FOUND_TEXT.title}>
      <Txt color={colors.textSecondary}>{NOT_FOUND_TEXT.body}</Txt>
      <View style={{ gap: space[3], marginTop: space[2] }}>
        <Button label={NOT_FOUND_TEXT.goStart} onPress={() => router.replace('/boas-vindas')} />
      </View>
    </AuthShell>
  );
}
