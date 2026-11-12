import { ACCOUNT_MARK_KEYS, ACCOUNT_MARK_TEXT, LEVEL_TEXT, accountLevel, type AccountMarkKey } from '@clarevo/core';
import { router, type Href } from 'expo-router';
import { Check, ChevronRight } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated';

import { SubHeader } from '@/components/header';
import { LevelList, LevelSummary } from '@/components/level-parts';
import { ErrorState, LoadingState } from '@/components/states';
import { Card, Screen, Txt, styles as ui } from '@/components/ui';
import { useAccountMarks } from '@/state/access';
import { colors, space } from '@/theme/tokens';

const T = LEVEL_TEXT;

/**
 * Conta > Nível da conta (D-095, `docs/48_NIVEIS.md`): o nível de agora, com o caminho até o próximo, os quatro níveis, o que ainda dá
 * para conhecer (cada marco leva à tela dele) e o que já foi feito. Em tom discreto, como no gov.br: cartões brancos, a cor do nível só no
 * selo pequeno. O nível mede o quanto da Clarevo a pessoa já usa, nunca dinheiro, e nunca desce. Só consulta: nada aqui grava.
 */
export default function NivelScreen() {
  const marks = useAccountMarks();
  const level = marks.data ? accountLevel(marks.data) : null;
  const todo = marks.data ? ACCOUNT_MARK_KEYS.filter((k) => !marks.data![k]) : [];
  const done = marks.data ? ACCOUNT_MARK_KEYS.filter((k) => marks.data![k]) : [];
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SubHeader title={T.screenTitle} />
      <Screen contentStyle={{ padding: space[5], gap: space[4] }}>
        {marks.isPending ? (
          <LoadingState />
        ) : !marks.data || !level ? (
          <ErrorState message={T.loadFailed} onRetry={() => marks.refetch()} />
        ) : (
          <>
            <Animated.View entering={FadeInDown.duration(320).reduceMotion(ReduceMotion.System)}>
              <Card style={{ gap: space[3] }}>
                <LevelSummary marks={marks.data} badge={44} />
                <Txt variant="caption" color={colors.textSecondary}>
                  {T.what}
                </Txt>
              </Card>
            </Animated.View>
            <Card style={{ gap: space[1], paddingVertical: space[3] }}>
              <Txt variant="title" accessibilityRole="header" aria-level={2}>
                {T.levelsTitle}
              </Txt>
              <LevelList level={level} />
            </Card>
            {todo.length > 0 ? (
              <Card style={{ gap: space[1], paddingVertical: space[3] }}>
                <Txt variant="title" accessibilityRole="header" aria-level={2}>
                  {T.todoTitle}
                </Txt>
                <Txt variant="caption" color={colors.textSecondary}>
                  {T.todoNote}
                </Txt>
                {todo.map((k, i) => (
                  <MarkRow key={k} mark={k} done={false} last={i === todo.length - 1} />
                ))}
              </Card>
            ) : null}
            {done.length > 0 ? (
              <Card style={{ gap: space[1], paddingVertical: space[3] }}>
                <Txt variant="title" accessibilityRole="header" aria-level={2}>
                  {T.doneTitle}
                </Txt>
                {done.map((k, i) => (
                  <MarkRow key={k} mark={k} done last={i === done.length - 1} />
                ))}
              </Card>
            ) : null}
          </>
        )}
      </Screen>
    </View>
  );
}

/** Um marco: feito (com o visto azul) ou ainda não (um círculo vazio; leva à tela dele, quando há uma). */
function MarkRow({ mark, done, last }: { mark: AccountMarkKey; done: boolean; last: boolean }) {
  const { title, href } = ACCOUNT_MARK_TEXT[mark];
  const content = (
    <>
      <View style={[styles.dot, done ? styles.dotDone : styles.dotTodo]}>{done ? <Check size={16} color={colors.brand} aria-hidden /> : null}</View>
      <Txt variant="label" style={{ flex: 1 }}>
        {title}
      </Txt>
      {!done && href ? <ChevronRight size={18} color={colors.textSecondary} aria-hidden /> : null}
    </>
  );
  if (done || !href) {
    return (
      <View style={[styles.mark, !last && styles.divider]} accessible accessibilityRole="image" accessibilityLabel={done ? T.markDone(title) : T.markTodo(title)}>
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
  mark: { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 48, paddingVertical: space[2] },
  dot: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  dotDone: { backgroundColor: colors.brandTint },
  dotTodo: { borderWidth: 1.5, borderColor: colors.textSecondary },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.border },
});
