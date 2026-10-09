import { router } from 'expo-router';
import { CircleQuestionMark } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeIn, ReduceMotion } from 'react-native-reanimated';

import { LinkButton, Txt } from '@/components/ui';
import { LEARN_UI_TEXT, explanationHref, topicBySlug, type TopicSlug } from '@/lib/learn';
import { colors, fonts, motion, radius, space } from '@/theme/tokens';

/**
 * "O que é isso?" ao lado de um termo (spec3 §3.7): `<TermHint term="Valor estimado" slug="estimativa" />`.
 * Abre no próprio lugar, sem navegar, um painel com o resumo do tema e "Ler explicação completa"; a explicação abre
 * por cima da tarefa e "Voltar à tarefa" volta para o formulário preenchido (CL C005).
 * Nome acessível "O que é isso? {termo}", com o estado aberto ou fechado. Tema em rascunho não desenha nada (R12).
 * O painel aparece só com esmaecimento de 200 ms, sem animar altura; com "reduzir movimento", direto.
 */
export function TermHint({ term, slug, style }: { term: string; slug: TopicSlug; style?: StyleProp<ViewStyle> }) {
  const [open, setOpen] = useState(false);
  const topic = topicBySlug(slug);
  if (!topic) return null;
  return (
    <View style={[styles.wrap, style]}>
      <LinkButton
        label={LEARN_UI_TEXT.termHint}
        icon={CircleQuestionMark}
        accessibilityLabel={LEARN_UI_TEXT.termHintA11y(term)}
        accessibilityState={{ expanded: open }}
        aria-expanded={open}
        onPress={() => setOpen((o) => !o)}
        style={styles.toggle}
      />
      {open ? (
        <Animated.View entering={FadeIn.duration(motion.context).reduceMotion(ReduceMotion.System)} style={styles.panel}>
          <Txt variant="body" color={colors.text} style={{ fontFamily: fonts.medium }}>
            {topic.short}
          </Txt>
          <LinkButton
            label={LEARN_UI_TEXT.readFull}
            color={colors.brandDeep}
            onPress={() => router.push(explanationHref(topic.slug, 'tarefa'))}
            style={styles.readFull}
          />
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'stretch', gap: space[1] },
  toggle: { alignSelf: 'flex-start', paddingHorizontal: 0 },
  panel: {
    backgroundColor: colors.accentTint,
    borderLeftWidth: 4,
    borderLeftColor: colors.accent,
    borderRadius: radius.sm,
    paddingVertical: space[3],
    paddingHorizontal: space[4],
    gap: space[1],
  },
  readFull: { alignSelf: 'flex-start', paddingHorizontal: 0 },
});
