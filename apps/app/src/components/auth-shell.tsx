import { router } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Pressable, StyleSheet, View } from 'react-native';

import { Logo } from '@/components/brand';
import { DemoPill, Screen, TopInset, Txt, styles as ui } from '@/components/ui';
import { KEYBOARD_BEHAVIOR } from '@/lib/keyboard';
import { useWideLayout } from '@/lib/layout';
import { useSession } from '@/state/session';
import { cardShadowOpacity, colors, radius, space } from '@/theme/tokens';

/**
 * Estrutura das telas de entrada: faixa azul com o logo e conteúdo em superfície clara.
 * `back` mostra o botão de voltar (para telas abertas a partir de outra).
 * Versão para computador: um cartão branco centralizado no fundo da página, com o logotipo em cima, sem a faixa azul de ponta a ponta
 * (revisão de 23/11/2026: a faixa com os cantos do celular e a coluna branca no meio do cinza pareciam uma tela de celular colada).
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
  const wide = useWideLayout();
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/boas-vindas'));
  const heading = (
    <>
      {art}
      {title ? (
        <Txt variant="title" style={styles.title} accessibilityRole="header" aria-level={1}>
          {title}
        </Txt>
      ) : null}
      {subtitle ? <Txt color={colors.textSecondary}>{subtitle}</Txt> : null}
    </>
  );

  if (wide) {
    return (
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={KEYBOARD_BEHAVIOR}>
        <Screen contentStyle={styles.wideOuter}>
          <View style={styles.wideBrand}>
            <Logo height={30} />
            {auth.mode === 'demo' ? <DemoPill /> : null}
          </View>
          <View style={styles.wideCard}>
            {/* A seta fica no alto do cartão, alinhada com o título (o desenho tem 12 px de folga no botão). */}
            {back ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Voltar"
                onPress={goBack}
                hitSlop={6}
                style={(s) => [styles.back, styles.wideBack, (s as { focused?: boolean }).focused && ui.focusRing]}>
                <ArrowLeft size={22} color={colors.brandText} />
              </Pressable>
            ) : null}
            {heading}
            {children}
          </View>
        </Screen>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.surface }} behavior={KEYBOARD_BEHAVIOR}>
      <TopInset color={colors.brand} />
      <View style={styles.band}>
        <View style={styles.bandInner}>
          {back ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Voltar" onPress={goBack} hitSlop={6} style={styles.back}>
              <ArrowLeft size={22} color={colors.textOnBrand} />
            </Pressable>
          ) : null}
          <Logo height={26} variant="reverso" />
          <View style={{ flex: 1 }} />
          {auth.mode === 'demo' ? <DemoPill /> : null}
        </View>
      </View>
      <Screen contentStyle={styles.content}>
        {heading}
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
  // A mesma largura da faixa (560 px) também no computador (auditoria de 18/11/2026: a faixa tinha 560 e o conteúdo, 760, e a seta de voltar
  // não ficava alinhada com o título).
  content: { padding: space[6], gap: space[4], backgroundColor: colors.surface, flexGrow: 1, maxWidth: 560 },
  title: { fontSize: 26, lineHeight: 34 },
  // Computador: o logotipo e o cartão no meio da janela (no alto, quando o conteúdo é mais alto que ela, e aí a página rola).
  wideOuter: { maxWidth: 560, flexGrow: 1, justifyContent: 'center', gap: space[6], paddingTop: space[8], paddingBottom: space[8], paddingHorizontal: 0 },
  wideBrand: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space[3] },
  // O cartão tem 560 px com a margem de dentro, como a coluna do celular, e o raio e a sombra dos cartões do app (`Card`).
  wideCard: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space[8],
    gap: space[4],
    shadowColor: colors.shadow,
    shadowOpacity: cardShadowOpacity,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
  },
  // A seta encosta no alto do cartão: sem isso, o respiro de cima (32 px) e a altura do botão afastavam demais o título.
  wideBack: { marginTop: -space[3], marginBottom: -space[2] },
});
