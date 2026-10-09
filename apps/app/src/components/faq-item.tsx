import { router } from 'expo-router';
import { ChevronDown, ChevronUp } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, ReduceMotion } from 'react-native-reanimated';

import { LinkButton, Txt, styles as ui } from '@/components/ui';
import { LEARN_UI_TEXT, explanationHref, type LearnAction, type Topic } from '@/lib/learn';
import { colors, fonts, motion, space } from '@/theme/tokens';

/**
 * Pergunta de "Dúvidas frequentes" que abre e fecha (spec3 §3.2 e §3.8). Botão com o estado aberto ou fechado; o
 * conteúdo aberto vem logo depois na ordem de leitura, sem mover o foco: o resumo, "Ler resposta completa" e as
 * ações do tema. Abre só com esmaecimento de 200 ms, sem animar altura; com "reduzir movimento", direto.
 */
export function FaqItem({ topic, actions = [], last }: { topic: Topic; actions?: readonly LearnAction[]; last?: boolean }) {
  const [open, setOpen] = useState(false);
  const Chevron = open ? ChevronUp : ChevronDown;
  return (
    <View style={[styles.item, !last && styles.divider]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={topic.title}
        accessibilityState={{ expanded: open }}
        aria-expanded={open}
        onPress={() => setOpen((o) => !o)}
        style={(s) => [styles.question, s.pressed && { opacity: 0.7 }, (s as { focused?: boolean }).focused && ui.focusRing]}>
        <Txt variant="label" style={styles.title}>
          {topic.title}
        </Txt>
        <Chevron size={20} color={colors.brand} aria-hidden />
      </Pressable>
      {open ? (
        <Animated.View entering={FadeIn.duration(motion.context).reduceMotion(ReduceMotion.System)} style={styles.answer}>
          <Txt color={colors.textSecondary}>{topic.short}</Txt>
          <View style={styles.links}>
            <LinkButton label={LEARN_UI_TEXT.faqReadMore} onPress={() => router.push(explanationHref(topic.slug, 'aprender'))} style={styles.link} />
            {actions.map((a) => (
              <LinkButton key={a.label} label={a.label} onPress={() => router.push(a.href)} style={styles.link} />
            ))}
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  item: { paddingVertical: space[1] },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  question: { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 56, paddingVertical: space[2] },
  title: { flex: 1, minWidth: 0, fontFamily: fonts.bold, fontSize: 16, lineHeight: 22 },
  answer: { gap: space[1], paddingBottom: space[3] },
  links: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space[4] },
  link: { alignSelf: 'flex-start', paddingHorizontal: 0 },
});
