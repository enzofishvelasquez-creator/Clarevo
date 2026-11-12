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
import { Award, ChevronRight } from 'lucide-react-native';
import { useCallback, useEffect } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, ReduceMotion, ZoomIn } from 'react-native-reanimated';

import { useNotice } from '@/components/notice-queue';
import { Button, Card, LinkButton, Txt } from '@/components/ui';
import { useLevelSeen } from '@/lib/level-seen';
import { useAccountMarks } from '@/state/access';
import { useSession } from '@/state/session';
import { colors, fonts, levelColors, radius, space } from '@/theme/tokens';

const T = LEVEL_TEXT;
/** Na web, o rótulo de um bloco só é lido com um papel; no celular, o papel "imagem" faria o leitor dizer "imagem" numa linha de texto. */
export const WEB_IMG = Platform.OS === 'web' ? ('image' as const) : undefined;

/**
 * Os níveis em tom discreto (pedido do Enzo em 12/11/2026, no jeito do gov.br): a cor do nível fica só no selo pequeno; os cartões são
 * os de sempre, brancos, sem borda colorida nem fundo forte, e a barra usa as cores da marca.
 */

/** O selo do nível: um círculo pequeno na cor do nível, com a medalha. Só decoração: o nome do nível vem sempre escrito ao lado. */
export function LevelBadge({ level, size = 32 }: { level: AccountLevel; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: levelColors[level], alignItems: 'center', justifyContent: 'center' }}>
      <Award size={Math.round(size * 0.58)} color={colors.textOnAccent} aria-hidden />
    </View>
  );
}

/** A barra fina do caminho até o próximo nível: azul sobre o azul claro (contraste de 4,9:1 entre a barra e o trilho). */
export function LevelProgressBar({ marks }: { marks: AccountMarks }) {
  const p = accountLevelProgress(marks);
  const now = Math.round(p.fraction * 100);
  return (
    <View
      style={styles.track}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={p.next ? T.progressLabel : T.progressLabelTop}
      accessibilityValue={{ min: 0, max: 100, now }}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={now}>
      <View style={[styles.fill, { width: `${Math.max(4, now)}%` }]} />
    </View>
  );
}

/** O resumo do nível: o selo, "Nível Ouro", quantos marcos, a barra e o que falta (ou que é o mais alto). */
export function LevelSummary({ marks, badge = 32 }: { marks: AccountMarks; badge?: number }) {
  const p = accountLevelProgress(marks);
  return (
    <View style={{ gap: space[3] }}>
      <View style={styles.row}>
        <LevelBadge level={p.level} size={badge} />
        <View style={{ flex: 1, gap: 2 }}>
          <Txt variant="label" style={{ fontFamily: fonts.bold }}>
            {T.level(p.level)}
          </Txt>
          <Txt variant="caption" color={colors.textSecondary}>
            {T.progress(p.done, p.total)}
          </Txt>
        </View>
      </View>
      <LevelProgressBar marks={marks} />
      <Txt variant="caption" color={colors.textSecondary}>
        {p.next ? T.next(p.missing, p.next) : T.top}
      </Txt>
    </View>
  );
}

/** Os quatro níveis numa lista simples, com o selo pequeno, quantos marcos cada um pede e "Seu nível" no de agora. */
export function LevelList({ level }: { level: AccountLevel }) {
  return (
    <View>
      {ACCOUNT_LEVELS.map((l, i) => {
        const current = l === level;
        return (
          <View
            key={l}
            style={[styles.levelRow, i < ACCOUNT_LEVELS.length - 1 && styles.divider]}
            accessible
            accessibilityRole={WEB_IMG}
            accessibilityLabel={T.levelRowLabel(LEVEL_NAME[l], LEVEL_THRESHOLD[l], current)}>
            <LevelBadge level={l} size={24} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt variant="label" style={{ fontFamily: current ? fonts.bold : fonts.regular }}>
                {LEVEL_NAME[l]}
              </Txt>
              <Txt variant="caption" color={colors.textSecondary}>
                {T.levelFrom(LEVEL_THRESHOLD[l])}
              </Txt>
            </View>
            {current ? (
              <View style={styles.tag}>
                <Txt variant="caption" color={colors.brandText} style={{ fontFamily: fonts.bold }}>
                  {T.yourLevel}
                </Txt>
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

/**
 * Card "Nível da conta" em Conta (D-095): um cartão como os outros de Conta, com o resumo do nível e "Ver meu nível".
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
  return (
    <Card style={{ gap: space[3] }}>
      <Txt variant="title" accessibilityRole="header" aria-level={2}>
        {T.cardTitle}
      </Txt>
      <LevelSummary marks={marks.data} />
      <LinkButton label={T.open} trailing={ChevronRight} onPress={() => router.push('/conta/nivel')} style={{ alignSelf: 'flex-start' }} />
    </Card>
  );
}

/**
 * O card de comemoração da troca de nível, no Resumo (D-095): um cartão branco, discreto, com o selo do nível novo, o recado e "Ver meu
 * nível" e "Fechar", que guardam o nível como visto. Aparece quando o nível de agora é maior que o último que este aparelho mostrou; na
 * primeira vez no aparelho, só guarda o nível de agora, sem comemorar. Os marcos são pedidos de novo a cada volta ao Resumo.
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
  // Entra na fila de avisos do Resumo (um aviso temporário por vez).
  const show = useNotice('nivel', Boolean(level && loaded && shouldCelebrateLevel(last, level)));
  if (!show || !level) return null;
  return (
    <Animated.View entering={FadeInDown.duration(320).reduceMotion(ReduceMotion.System)}>
      <Card style={{ gap: space[3] }}>
        <View style={styles.row}>
          <Animated.View entering={ZoomIn.delay(120).duration(360).reduceMotion(ReduceMotion.System)}>
            <LevelBadge level={level} size={40} />
          </Animated.View>
          <View style={{ flex: 1, gap: 2 }}>
            <Txt variant="caption" color={colors.brandText} style={{ fontFamily: fonts.bold }}>
              {T.celebrateEyebrow}
            </Txt>
            <Txt variant="title" accessibilityRole="header" aria-level={2}>
              {T.celebrateTitle(level)}
            </Txt>
          </View>
        </View>
        <Txt color={colors.textSecondary}>{T.celebrateBody[level]}</Txt>
        <View style={styles.actions}>
          <Button
            label={T.open}
            tone="soft"
            onPress={() => {
              mark(level);
              router.push('/conta/nivel');
            }}
            style={{ flexGrow: 1, maxWidth: '100%' }}
          />
          <LinkButton label={T.celebrateDismiss} onPress={() => mark(level)} />
        </View>
      </Card>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  track: { height: 6, borderRadius: radius.pill, overflow: 'hidden', backgroundColor: colors.brandTint },
  fill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.brandMark },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  actions: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space[3] },
  levelRow: { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 52, paddingVertical: space[2] },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  tag: { backgroundColor: colors.brandTint, borderRadius: radius.pill, paddingHorizontal: space[2], paddingVertical: 2 },
});
