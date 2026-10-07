import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';

import { Logo } from '@/components/brand';
import { DemoBadge, Screen, TopInset, Txt } from '@/components/ui';
import { useSession } from '@/state/session';
import { colors, space } from '@/theme/tokens';

/** Estrutura das telas de entrada: faixa azul com o logo e conteúdo em superfície clara. */
export function AuthShell({ title, subtitle, children, art }: { title?: string; subtitle?: string; children: ReactNode; art?: ReactNode }) {
  const { auth } = useSession();
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.surface }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <TopInset color={colors.brand} />
      <View style={styles.band}>
        <Logo height={36} variant="reverso" />
      </View>
      <Screen contentStyle={styles.content}>
        {auth.mode === 'demo' ? <DemoBadge /> : null}
        {art}
        {title ? (
          <Txt variant="title" style={styles.title} accessibilityRole="header">
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
  band: { backgroundColor: colors.brand, paddingHorizontal: space[6], paddingVertical: space[5], borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  content: { padding: space[6], gap: space[4], backgroundColor: colors.surface, flexGrow: 1 },
  title: { fontSize: 26, lineHeight: 34 },
});
