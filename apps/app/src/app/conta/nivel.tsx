import { ACCOUNT_MARK_KEYS, ACCOUNT_MARK_TEXT, LEVEL_TEXT, accountLevelProgress, type AccountMarkKey } from '@clarevo/core';
import { router, type Href } from 'expo-router';
import { Check, ChevronRight } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated';

import { SubHeader } from '@/components/header';
import { LevelBadge, LevelLadder, LevelProgressBar } from '@/components/level-parts';
import { ErrorState, LoadingState } from '@/components/states';
import { HeroBackdrop } from '@/components/subscription-parts';
import { Card, Screen, Txt, styles as ui } from '@/components/ui';
import { useAccountMarks } from '@/state/access';
import { colors, levelColors, radius, space } from '@/theme/tokens';

const T = LEVEL_TEXT;

/**
 * Conta > Nível da conta (D-095, `docs/48_NIVEIS.md`): o nível de agora no alto, com o caminho até o próximo, os quatro níveis, o que
 * ainda dá para conhecer (cada marco leva à tela dele) e o que já foi feito. O nível mede o quanto da Clarevo a pessoa já usa, nunca
 * dinheiro, e nunca desce. Só consulta: nada aqui grava.
 */
export default function NivelScreen() {
  const marks = useAccountMarks();
  const p = marks.data ? accountLevelProgress(marks.data) : null;
  const todo = marks.data ? ACCOUNT_MARK_KEYS.filter((k) => !marks.data![k]) : [];
  const done = marks.data ? ACCOUNT_MARK_KEYS.filter((k) => marks.data![k]) : [];
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SubHeader title={T.screenTitle} />
      <Screen contentStyle={{ padding: space[5], gap: space[4] }}>
        {marks.isPending ? (
          <LoadingState />
        ) : !marks.data || !p ? (
          <ErrorState message={T.loadFailed} onRetry={() => marks.refetch()} />
        ) : (
          <>
            <Animated.View entering={FadeInDown.duration(320).reduceMotion(ReduceMotion.System)} style={styles.hero}>
              <HeroBackdrop />
              <View style={styles.heroTop}>
                <View style={[styles.ring, { borderColor: levelColors[p.level].main }]}>
                  <LevelBadge level={p.level} size={56} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Txt variant="hero" color={colors.textOnBrand} accessibilityRole="header" aria-level={2} style={{ fontSize: 28, lineHeight: 36 }}>
                    {T.level(p.level)}
                  </Txt>
                  <Txt color={colors.textOnBrandSoft}>{T.progress(p.done, p.total)}</Txt>
                </View>
              </View>
              <LevelProgressBar marks={marks.data} onBrand />
              <Txt variant="label" color={colors.textOnBrand}>
                {p.next ? T.next(p.missing, p.next) : T.top}
              </Txt>
              <Txt variant="caption" color={colors.textOnBrandSoft}>
                {T.what}
              </Txt>
            </Animated.View>
            <LevelLadder level={p.level} />
            {todo.length > 0 ? (
              <Card style={{ gap: space[1], paddingVertical: space[3] }}>
                <Txt variant="title" accessibilityRole="header" aria-level={2}>
                  {T.todoTitle}
                </Txt>
                <Txt variant="caption" color={colors.textSecondary}>
                  {T.todoNote}
                </Txt>
                {todo.map((k, i) => (
                  <MarkRow key={k} mark={k} done={false} last={i === todo.length - 1} tint={colors.brandTint} />
                ))}
              </Card>
            ) : null}
            {done.length > 0 ? (
              <Card style={{ gap: space[1], paddingVertical: space[3] }}>
                <Txt variant="title" accessibilityRole="header" aria-level={2}>
                  {T.doneTitle}
                </Txt>
                {done.map((k, i) => (
                  <MarkRow key={k} mark={k} done last={i === done.length - 1} tint={levelColors[p.level].main} />
                ))}
              </Card>
            ) : null}
          </>
        )}
      </Screen>
    </View>
  );
}

/** Um marco: feito (com o visto na cor do nível) ou ainda não (leva à tela dele, quando há uma). */
function MarkRow({ mark, done, last, tint }: { mark: AccountMarkKey; done: boolean; last: boolean; tint: string }) {
  const { title, href } = ACCOUNT_MARK_TEXT[mark];
  const content = (
    <>
      <View style={[styles.dot, { backgroundColor: tint }]}>{done ? <Check size={16} color={colors.text} aria-hidden /> : null}</View>
      <Txt variant="label" style={{ flex: 1 }}>
        {title}
      </Txt>
      {!done && href ? <ChevronRight size={18} color={colors.textSecondary} aria-hidden /> : null}
    </>
  );
  if (done || !href) {
    return (
      <View style={[styles.mark, !last && styles.divider]} accessible accessibilityLabel={done ? T.markDone(title) : T.markTodo(title)}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={T.markTodo(title)}
      onPress={() => router.push(href as Href)}
      style={(st) => [styles.mark, !last && styles.divider, st.pressed && { opacity: 0.7 }, (st as { focused?: boolean }).focused && ui.focusRing]}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hero: { backgroundColor: colors.brand, borderRadius: radius.xl, padding: space[5], gap: space[3], overflow: 'hidden' },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: space[4] },
  ring: { padding: 3, borderRadius: 40, borderWidth: 3, backgroundColor: colors.surface },
  mark: { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 48, paddingVertical: space[2] },
  dot: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.border },
});
