import { router } from 'expo-router';
import { ArrowRight } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { Screen, TopInset, Txt } from '@/components/ui';
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
      <TopInset color={colors.background} />
      <Screen contentStyle={{ padding: space[6], gap: space[4] }}>
        <Txt variant="title" style={{ fontSize: 24, lineHeight: 32 }} accessibilityRole="header">
          Aprender
        </Txt>
        <Txt color={colors.textSecondary}>Explicações curtas e opcionais, ligadas ao que você faz no app.</Txt>
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
});
