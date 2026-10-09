import { ChevronDown, ChevronUp } from 'lucide-react-native';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, ReduceMotion } from 'react-native-reanimated';

import { Card, Txt, styles as ui } from '@/components/ui';
import { LEARN_UI_TEXT, type Topic } from '@/lib/learn';
import { colors, fonts, motion, radius, space, tabular } from '@/theme/tokens';

/** Passos da conta: o texto do core separa cada passo com " · ". */
export function calculationLines(calculation: string): string[] {
  return calculation
    .split(' · ')
    .map((l) => l.trim())
    .filter(Boolean);
}

/**
 * Exemplo fictício de um tema (spec3 §3.8): cartão "Exemplo", "Ver a conta" recolhido (abre só com esmaecimento de
 * 200 ms, sem animar altura) e o cartão "Hipóteses do exemplo". Os passos da conta ficam agrupados para o leitor de
 * tela. Tema com conta e sem exemplo (estimativa) mostra "Ver a conta" no cartão das hipóteses.
 */
export function TopicExample({ topic }: { topic: Topic }) {
  const [open, setOpen] = useState(false);
  const lines = topic.calculation ? calculationLines(topic.calculation) : [];
  const Chevron = open ? ChevronUp : ChevronDown;
  // "Ver a conta" aparece sempre que há passos: no cartão Exemplo; sem exemplo, no das hipóteses; sem nenhum dos dois, num cartão só dele.
  const calculation =
    lines.length > 0 ? (
      <View>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          aria-expanded={open}
          onPress={() => setOpen((o) => !o)}
          hitSlop={6}
          style={(s) => [styles.toggle, s.pressed && { opacity: 0.7 }, (s as { focused?: boolean }).focused && ui.focusRing]}>
          <Txt variant="label" color={colors.brand} style={{ fontFamily: fonts.bold, fontSize: 16 }}>
            {LEARN_UI_TEXT.showCalculation}
          </Txt>
          <Chevron size={18} color={colors.brand} aria-hidden />
        </Pressable>
        {open ? (
          <Animated.View entering={FadeIn.duration(motion.context).reduceMotion(ReduceMotion.System)}>
            <View
              role="group"
              accessible={Platform.OS !== 'web'}
              accessibilityLabel={Platform.OS !== 'web' ? lines.join('. ') : undefined}
              style={styles.calc}>
              {lines.map((line, i) => (
                <Txt key={`${i}-${line}`} variant="label" style={[tabular, { fontFamily: fonts.medium }]}>
                  {line}
                </Txt>
              ))}
            </View>
          </Animated.View>
        ) : null}
      </View>
    ) : null;
  return (
    <>
      {topic.example ? (
        <Card style={styles.card}>
          <Txt variant="title" accessibilityRole="header" aria-level={2}>
            {LEARN_UI_TEXT.example}
          </Txt>
          <Txt>{topic.example}</Txt>
          {calculation}
        </Card>
      ) : null}
      {topic.hypotheses ? (
        <Card style={styles.card}>
          <Txt variant="label" color={colors.textSecondary} style={{ fontFamily: fonts.bold }}>
            {LEARN_UI_TEXT.hypotheses}
          </Txt>
          <Txt variant="caption" color={colors.text}>
            {topic.hypotheses}
          </Txt>
          {topic.example ? null : calculation}
        </Card>
      ) : null}
      {!topic.example && !topic.hypotheses && calculation ? <Card style={styles.card}>{calculation}</Card> : null}
    </>
  );
}

const styles = StyleSheet.create({
  card: { gap: space[2] },
  toggle: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: space[1], minHeight: 44 },
  calc: { gap: space[2], padding: space[3], borderRadius: radius.sm, backgroundColor: colors.brandTint },
});
