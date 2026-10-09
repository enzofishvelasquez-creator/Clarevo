import { ERROR_TEXT } from '@clarevo/core';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { LogoSymbol } from '@/components/brand';
import { ErrorState, LoadingState } from '@/components/states';
import { afterLogin, restoreTarget } from '@/lib/nav';
import { useSession } from '@/state/session';
import { useSpaceStatus } from '@/state/space-status';
import { colors, space } from '@/theme/tokens';

/** Tela neutra enquanto a sessão e o espaço são conferidos. Decide para onde seguir. */
export default function Carregando() {
  const { status, retry } = useSpaceStatus();
  const { user, recovery } = useSession();

  useEffect(() => {
    if (recovery && user) router.replace('/nova-senha');
    else if (status === 'sem-sessao') router.replace(afterLogin.pending() ? '/entrar' : '/boas-vindas');
    else if (status === 'sem-conta') router.replace('/primeira-conta');
    else if (status === 'pronto' && user) {
      const target = afterLogin.take(user.id);
      if (target) restoreTarget(target);
      else router.replace('/');
    }
  }, [status, recovery, user]);

  return (
    <View style={styles.wrap}>
      <LogoSymbol size={72} variant="reverso" animated />
      {status === 'erro' ? (
        <View style={{ alignSelf: 'stretch' }}>
          <ErrorState message={ERROR_TEXT.carregar_falhou} onRetry={retry} onBrand />
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
