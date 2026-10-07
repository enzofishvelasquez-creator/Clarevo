import { router } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';

import { Logo } from '@/components/brand';
import { DemoPill, Screen, TopInset, Txt } from '@/components/ui';
import { useSession } from '@/state/session';
import { colors, space } from '@/theme/tokens';

/**
 * Estrutura das telas de entrada: faixa azul com o logo e conteúdo em superfície clara.
 * `back` mostra o botão de voltar (para telas abertas a partir de outra).
 */
export function AuthShell({
  title,
  subtitle,
  children,
  art,
  back,
}: {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  art?: ReactNode;
  back?: boolean;
}) {
  const { auth } = useSession();
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.surface }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <TopInset color={colors.brand} />
      <View style={styles.band}>
        <View style={styles.bandInner}>
          {back ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Voltar"
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/boas-vindas'))}
              hitSlop={6}
              style={styles.back}>
              <ArrowLeft size={22} color={colors.textOnBrand} />
            </Pressable>
          ) : null}
          <Logo height={34} variant="reverso" />
          <View style={{ flex: 1 }} />
          {auth.mode === 'demo' ? <DemoPill /> : null}
        </View>
      </View>
      <Screen contentStyle={styles.content}>
        {art}
        {title ? (
          <Txt variant="title" style={styles.title} accessibilityRole="header" aria-level={1}>
            {title}
          </Txt>
        ) : null}
        {subtitle ? <Txt color={colors.textSecondary}>{subtitle}</Txt> : null}
        {children}
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  band: { backgroundColor: colors.brand, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  bandInner: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    paddingHorizontal: space[6],
    paddingVertical: space[5],
  },
  back: { width: 44, height: 44, marginLeft: -space[3], alignItems: 'center', justifyContent: 'center' },
  content: { padding: space[6], gap: space[4], backgroundColor: colors.surface, flexGrow: 1 },
  title: { fontSize: 26, lineHeight: 34 },
});
