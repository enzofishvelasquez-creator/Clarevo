import {
  ACCOUNT_LEVELS,
  LEVEL_NAME,
  LEVEL_TEXT,
  LEVEL_THRESHOLD,
  accountLevelProgress,
  shouldCelebrateLevel,
  type AccountLevel,
  type AccountMarks,
} from '@clarevo/core';
import { router, useFocusEffect } from 'expo-router';
import { Award } from 'lucide-react-native';
import { useCallback, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, ReduceMotion, ZoomIn } from 'react-native-reanimated';

import { BadgeConfetti } from '@/components/subscription-parts';
import { Button, Card, LinkButton, Txt } from '@/components/ui';
import { useLevelSeen } from '@/lib/level-seen';
import { useAccountMarks } from '@/state/access';
import { useSession } from '@/state/session';
import { colors, fonts, levelColors, radius, space } from '@/theme/tokens';

const T = LEVEL_TEXT;

/** O selo do nível: um círculo na cor do nível, com a medalha. Só decoração: o nome do nível vem sempre escrito ao lado. */
export function LevelBadge({ level, size = 44 }: { level: AccountLevel; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: levelColors[level].main, alignItems: 'center', justifyContent: 'center' }}>
      <Award size={Math.round(size * 0.55)} color={colors.text} aria-hidden />
    </View>
  );
}

/** A barra do caminho até o próximo nível, na cor do nível. `onBrand`: sobre o azul. */
export function LevelProgressBar({ marks, onBrand = false }: { marks: AccountMarks; onBrand?: boolean }) {
  const p = accountLevelProgress(marks);
  return (
    <View
      style={[styles.track, { backgroundColor: onBrand ? 'rgba(255,255,255,0.28)' : colors.border }]}
      accessibilityRole="progressbar"
      accessibilityLabel={T.progressLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(p.fraction * 100) }}>
      <View style={[styles.fill, { width: `${Math.max(4, Math.round(p.fraction * 100))}%`, backgroundColor: levelColors[p.level].main }]} />
    </View>
  );
}

/** Os quatro níveis em fila, com o de agora em destaque e quantos marcos cada um pede. */
export function LevelLadder({ level }: { level: AccountLevel }) {
  return (
    <View style={styles.ladder}>
      {ACCOUNT_LEVELS.map((l) => {
        const current = l === level;
        return (
          <View
            key={l}
            style={[styles.step, { backgroundColor: levelColors[l].tint, borderColor: current ? levelColors[l].main : 'transparent' }]}
            accessible
            accessibilityLabel={`${LEVEL_NAME[l]}, ${LEVEL_THRESHOLD[l]} marcos${current ? ', o seu nível' : ''}`}>
            <LevelBadge level={l} size={28} />
            <Txt variant="caption" style={{ fontFamily: current ? fonts.extrabold : fonts.semibold }} numberOfLines={1}>
              {LEVEL_NAME[l]}
            </Txt>
            <Txt variant="caption" color={colors.textSecondary}>
              {LEVEL_THRESHOLD[l]}
            </Txt>
          </View>
        );
      })}
    </View>
  );
}

/**
 * Card "Nível da conta" em Conta (D-095): o selo, o nível, quantos marcos e o que falta para o próximo, com a borda na cor do nível.
 * Sem os marcos (carregando ou falha de leitura), nada aparece: o nível nunca é inventado.
 */
export function LevelCard() {
  const marks = useAccountMarks();
  const { refetch } = marks;
  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );
  if (!marks.data) return null;
  const p = accountLevelProgress(marks.data);
  return (
    <Card style={[{ gap: space[3], borderWidth: 2, borderColor: levelColors[p.level].main }]}>
      <Txt variant="title" accessibilityRole="header" aria-level={2}>
        {T.cardTitle}
      </Txt>
      <View style={styles.row}>
        <LevelBadge level={p.level} />
        <View style={{ flex: 1, gap: 2 }}>
          <Txt variant="label" style={{ fontFamily: fonts.extrabold, fontSize: 18, lineHeight: 26 }}>
            {T.level(p.level)}
          </Txt>
          <Txt variant="caption" color={colors.textSecondary}>
            {T.progress(p.done, p.total)}
          </Txt>
        </View>
      </View>
      <LevelProgressBar marks={marks.data} />
      <Txt variant="caption" color={colors.textSecondary}>
        {p.next ? T.next(p.missing, p.next) : T.top}
      </Txt>
      <Button label={T.open} icon={Award} tone="soft" onPress={() => router.push('/conta/nivel')} />
    </Card>
  );
}

/**
 * O card de comemoração da troca de nível, no Resumo (D-095): aparece quando o nível de agora é maior que o último que este aparelho
 * mostrou, com a borda e o selo na cor do nível novo. "Ver meu nível" e "Fechar" guardam o nível como visto. Na primeira vez no
 * aparelho, só guarda o nível de agora, sem comemorar. Os marcos são pedidos de novo a cada volta ao Resumo.
 */
export function LevelUpCard() {
  const { user, auth } = useSession();
  const marks = useAccountMarks();
  const seen = useLevelSeen(user?.id, auth.mode !== 'demo');
  const { refetch } = marks;
  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );
  const progress = marks.data ? accountLevelProgress(marks.data) : null;
  const level = progress?.level ?? null;
  const { loaded, level: last, mark } = seen;
  useEffect(() => {
    if (level && loaded && last === null) mark(level);
  }, [level, loaded, last, mark]);
  if (!level || !loaded || !shouldCelebrateLevel(last, level)) return null;
  return (
    <Animated.View entering={FadeInDown.duration(320).reduceMotion(ReduceMotion.System)}>
      <Card style={[{ gap: space[3], borderWidth: 2, borderColor: levelColors[level].main, backgroundColor: levelColors[level].tint, overflow: 'hidden' }]}>
        <View style={styles.row}>
          <View style={{ flex: 1, gap: space[1] }}>
            <View style={[styles.eyebrow, { backgroundColor: levelColors[level].main }]}>
              <Txt variant="caption" style={{ fontFamily: fonts.bold }}>
                {T.celebrateEyebrow}
              </Txt>
            </View>
          </View>
          <View>
            <BadgeConfetti />
            <Animated.View entering={ZoomIn.delay(120).duration(360).reduceMotion(ReduceMotion.System)}>
              <LevelBadge level={level} size={56} />
            </Animated.View>
          </View>
        </View>
        <Txt variant="title" accessibilityRole="header" aria-level={2} style={{ fontSize: 22, lineHeight: 30 }}>
          {T.celebrateTitle(level)}
        </Txt>
        <Txt>{T.celebrateBody[level]}</Txt>
        <View style={styles.actions}>
          <Button
            label={T.open}
            icon={Award}
            onPress={() => {
              mark(level);
              router.push('/conta/nivel');
            }}
            style={{ flexGrow: 1 }}
          />
          <LinkButton label={T.celebrateDismiss} onPress={() => mark(level)} />
        </View>
      </Card>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  track: { height: 10, borderRadius: radius.pill, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.pill },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  eyebrow: { alignSelf: 'flex-start', borderRadius: radius.pill, paddingHorizontal: space[3], paddingVertical: space[1] },
  actions: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space[3] },
  ladder: { flexDirection: 'row', gap: space[2] },
  step: { flex: 1, minWidth: 0, alignItems: 'center', gap: 2, paddingVertical: space[2], paddingHorizontal: 2, borderRadius: radius.sm, borderWidth: 2 },
});
