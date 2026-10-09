import { CALC_UI_TEXT } from '@clarevo/core';
import { router } from 'expo-router';
import { ArrowRight, Calculator } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppHeader } from '@/components/header';
import { Body, Screen, Txt } from '@/components/ui';
import { TOPICS } from '@/lib/topics';
import { colors, fonts, radius, space } from '@/theme/tokens';

const TONES = [
  { bg: colors.accent, fg: colors.text },
  { bg: colors.brand, fg: colors.textOnBrand },
  { bg: colors.surface, fg: colors.text },
  { bg: colors.surface, fg: colors.text },
];

export default function AprenderScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Screen wide>
        <AppHeader title="Aprender" />
        <Body>
        <Txt color={colors.textSecondary}>Explicações curtas e opcionais, ligadas ao que você faz no app.</Txt>
        {/* Calculadoras no topo (docs/08 §2.2): card branco, ícone azul, antes dos temas. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${CALC_UI_TEXT.learnCardTitle}. ${CALC_UI_TEXT.learnCardCaption}`}
          onPress={() => router.push('/calcular')}
          style={(s) => [styles.item, styles.calc, s.pressed && { opacity: 0.85 }, (s as { focused?: boolean }).focused && styles.focusRing]}>
          <View style={styles.calcIcon}>
            <Calculator size={22} color={colors.brand} strokeWidth={2.25} aria-hidden />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Txt variant="label" style={{ fontFamily: fonts.extrabold, fontSize: 17 }}>
              {CALC_UI_TEXT.learnCardTitle}
            </Txt>
            <Txt variant="caption">{CALC_UI_TEXT.learnCardCaption}</Txt>
          </View>
          <ArrowRight size={20} color={colors.brand} aria-hidden />
        </Pressable>
        {TOPICS.map((t, i) => {
          const tone = TONES[i % TONES.length]!;
          return (
            <Pressable
              key={t.slug}
              accessibilityRole="button"
              onPress={() => router.push(`/explicacao/${t.slug}`)}
              style={(s) => [styles.item, { backgroundColor: tone.bg }, s.pressed && { opacity: 0.85 }]}>
              <View style={{ flex: 1 }}>
                <Txt variant="label" color={tone.fg} style={{ fontFamily: fonts.extrabold, fontSize: 17 }}>
                  {t.title}
                </Txt>
                <Txt variant="caption" color={tone.fg}>
                  {t.subtitle}
                </Txt>
              </View>
              <ArrowRight size={20} color={tone.fg} />
            </Pressable>
          );
        })}
        </Body>
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  item: {
    borderRadius: radius.lg,
    padding: space[5],
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 72,
  },
  calc: { backgroundColor: colors.surface },
  calcIcon: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.brandTint, alignItems: 'center', justifyContent: 'center' },
  focusRing: { outlineWidth: 3, outlineColor: colors.brand, outlineStyle: 'solid', outlineOffset: 2 } as object,
});
