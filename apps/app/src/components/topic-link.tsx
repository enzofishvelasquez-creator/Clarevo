import { router } from 'expo-router';
import { ChevronRight, type LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { LinkButton, Txt, styles as ui } from '@/components/ui';
import { LEARN_UI_TEXT, explanationHref, isTopicPublished, topicReadingMinutes, type LearnOrigin, type Topic, type TopicSlug } from '@/lib/learn';
import { colors, fonts, space } from '@/theme/tokens';

/**
 * Link de texto para a explicação de um tema (spec3 §3.7), como "Quanto custa pagar depois do vencimento?".
 * Tema em rascunho não desenha nada (R12). Aberto de uma tarefa, a explicação termina em "Voltar à tarefa".
 */
export function TopicLink({
  slug,
  label,
  origem = 'tarefa',
  color,
  icon,
  style,
}: {
  slug: TopicSlug;
  label: string;
  origem?: LearnOrigin;
  color?: string;
  icon?: LucideIcon;
  style?: StyleProp<ViewStyle>;
}) {
  if (!isTopicPublished(slug)) return null;
  return <LinkButton label={label} color={color} icon={icon} style={style} onPress={() => router.push(explanationHref(slug, origem))} />;
}

/**
 * Linha de tema nas listas de Aprender: título, subtítulo e tempo de leitura, com seta.
 * Leitor de tela: "{título}. {subtítulo}. Leitura de 1 minuto." `onAccent`: dentro do card lima "Comece por aqui".
 */
export function TopicRow({
  topic,
  caption,
  onPress,
  last,
  onAccent,
}: {
  topic: Topic;
  /** Texto abaixo do título; por padrão, o subtítulo (perguntas não têm). */
  caption?: string | null;
  onPress: () => void;
  last?: boolean;
  onAccent?: boolean;
}) {
  const minutes = topicReadingMinutes(topic);
  const sub = caption === undefined ? topic.subtitle : caption;
  const secondary = onAccent ? colors.text : colors.textSecondary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={LEARN_UI_TEXT.rowA11y(topic.title, sub, minutes)}
      onPress={onPress}
      style={(s) => [
        styles.row,
        !last && (onAccent ? styles.dividerOnAccent : styles.divider),
        s.pressed && { opacity: 0.7 },
        (s as { focused?: boolean }).focused && ui.focusRing,
      ]}>
      <View style={styles.texts}>
        <Txt variant="label" style={styles.title}>
          {topic.title}
        </Txt>
        {sub ? (
          <Txt variant="caption" color={secondary}>
            {sub}
          </Txt>
        ) : null}
      </View>
      <View style={styles.end}>
        <Txt variant="caption" color={secondary} style={{ fontFamily: fonts.semibold }} maxFontSizeMultiplier={1.6}>
          {LEARN_UI_TEXT.minutesShort(minutes)}
        </Txt>
        <ChevronRight size={20} color={onAccent ? colors.text : colors.textSecondary} aria-hidden />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: space[3], minHeight: 56 },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  dividerOnAccent: { borderBottomWidth: 1, borderBottomColor: 'rgba(23,34,59,0.14)' },
  texts: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontFamily: fonts.bold, fontSize: 16, lineHeight: 22 },
  end: { flexDirection: 'row', alignItems: 'center', gap: space[1], flexShrink: 0 },
});
