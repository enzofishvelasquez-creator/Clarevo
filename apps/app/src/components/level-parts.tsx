import {
  ACCOUNT_LEVELS,
  LEVEL_NAME,
  LEVEL_TEXT,
  accountLevelProgress,
  levelToRemember,
  shouldCelebrateLevel,
  type AccountLevel,
  type AccountMarks,
  type LevelWarning,
  type ShownAccountLevel,
} from '@clarevo/core';
import { router, useFocusEffect } from 'expo-router';
import { Award, ChevronRight } from 'lucide-react-native';
import { useCallback, useEffect } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, ReduceMotion, ZoomIn } from 'react-native-reanimated';

import { useNotice } from '@/components/notice-queue';
import { Button, Card, LinkButton, Txt } from '@/components/ui';
import { useLevelSeen, useLevelWarningDismissed } from '@/lib/level-seen';
import { useAccountLevelState, useShownLevel } from '@/state/access';
import { useSession } from '@/state/session';
import { colors, fonts, levelColors, radius, space } from '@/theme/tokens';

const T = LEVEL_TEXT;
/** Na web, o rótulo de um bloco só é lido com um papel; no celular, o papel "imagem" faria o leitor dizer "imagem" numa linha de texto. */
export const WEB_IMG = Platform.OS === 'web' ? ('image' as const) : undefined;

/**
 * Os níveis em tom discreto (pedido do Enzo em 12/11/2026, no jeito do gov.br): a cor do nível fica só no selo pequeno; os cartões são
 * os de sempre, brancos, sem borda colorida nem fundo forte, e a barra usa as cores da marca. O aviso de queda (D-111) segue o mesmo tom:
 * texto comum, sem cor de alerta, com "Agora não".
 */

/** O selo do nível: um círculo pequeno na cor do nível, com a medalha. Só decoração: o nome do nível vem sempre escrito ao lado. */
export function LevelBadge({ level, size = 32 }: { level: AccountLevel; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: levelColors[level], alignItems: 'center', justifyContent: 'center' }}>
      <Award size={Math.round(size * 0.58)} color={colors.textOnAccent} aria-hidden />
    </View>
  );
}

/** A barra fina do caminho até o próximo nível pelos marcos: azul sobre o azul claro (contraste de 4,9:1 entre a barra e o trilho). */
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

/**
 * O resumo do nível: o selo e o nome do nível mostrado ("Nível Ouro"), quantos marcos, a barra e o que falta (ou que é o mais alto). Com o
 * nível abaixo do que os marcos dão (D-111), o recado de que ele volta ao anotar, sem contar dias.
 */
export function LevelSummary({ marks, shown, badge = 32 }: { marks: AccountMarks; shown: ShownAccountLevel; badge?: number }) {
  const p = accountLevelProgress(marks);
  const caption = shown.stepsDown > 0
    ? T.below(shown.stepsDown, shown.marksLevel)
    : !p.next
      ? T.top
      : p.missingGroup === 'investimentos'
        ? T.nextInvesting(p.missing, p.next)
        : T.next(p.missing, p.next);
  return (
    <View style={{ gap: space[3] }}>
      <View style={styles.row}>
        <LevelBadge level={shown.level} size={badge} />
        <View style={{ flex: 1, gap: 2 }}>
          <Txt variant="label" style={{ fontFamily: fonts.bold }}>
            {T.level(shown.level)}
          </Txt>
          <Txt variant="caption" color={colors.textSecondary}>
            {T.progress(p.done, p.total)}
          </Txt>
        </View>
      </View>
      <LevelProgressBar marks={marks} />
      <Txt variant="caption" color={colors.textSecondary}>
        {caption}
      </Txt>
    </View>
  );
}

/** Os cinco níveis numa lista simples, com o selo pequeno, o que cada um pede ("A partir de") e "Seu nível" no de agora. */
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
            accessibilityLabel={T.levelRowLabel(l, current)}>
            <LevelBadge level={l} size={24} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt variant="label" style={{ fontFamily: current ? fonts.bold : fonts.regular }}>
                {LEVEL_NAME[l]}
              </Txt>
              <Txt variant="caption" color={colors.textSecondary}>
                {T.levelFrom(l)}
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
 * O aviso de queda (D-111) que ainda não foi dispensado neste aparelho, e o "Agora não", que vale até o próximo marco de tempo (o mesmo no
 * Resumo, em Conta e na tela do nível).
 */
export function useLevelWarning(shown: ShownAccountLevel | null): { warning: LevelWarning | null; dismiss: () => void } {
  const { user, auth } = useSession();
  const d = useLevelWarningDismissed(user?.id, auth.mode !== 'demo');
  const w = shown?.warning ?? null;
  const { dismiss } = d;
  const key = w?.key ?? null;
  const onDismiss = useCallback(() => {
    if (key) dismiss(key);
  }, [dismiss, key]);
  return { warning: w && d.loaded && d.dismissed !== w.key ? w : null, dismiss: onDismiss };
}

/** O aviso dentro de um cartão do nível (Conta e a tela do nível): o texto e "Agora não", separados do resto por uma linha fina. */
export function LevelWarningNote({ warning, onDismiss }: { warning: LevelWarning; onDismiss: () => void }) {
  return (
    <View style={styles.note}>
      <Txt>{T.warning(warning)}</Txt>
      <LinkButton label={T.warningDismiss} onPress={onDismiss} style={{ alignSelf: 'flex-start' }} />
    </View>
  );
}

/**
 * Card "Nível da conta" em Conta (D-095): um cartão como os outros de Conta, com o resumo do nível, o aviso de queda quando há (D-111) e
 * "Ver meu nível". Sem os marcos (carregando ou falha de leitura), nada aparece: o nível nunca é inventado.
 */
export function LevelCard() {
  const query = useAccountLevelState();
  const shown = useShownLevel();
  const { warning, dismiss } = useLevelWarning(shown);
  const { refetch } = query;
  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );
  if (!query.data || !shown) return null;
  return (
    <Card style={{ gap: space[3] }}>
      <Txt variant="title" accessibilityRole="header" aria-level={2}>
        {T.cardTitle}
      </Txt>
      <LevelSummary marks={query.data.marks} shown={shown} />
      {warning ? <LevelWarningNote warning={warning} onDismiss={dismiss} /> : null}
      <LinkButton label={T.open} trailing={ChevronRight} onPress={() => router.push('/conta/nivel')} style={{ alignSelf: 'flex-start' }} />
    </Card>
  );
}

/**
 * No Resumo, dentro da fila de avisos (um aviso temporário por vez):
 * - a comemoração da troca de nível (D-095): um cartão branco, discreto, com o selo do nível novo, o recado e "Ver meu nível" e "Fechar",
 *   que guardam o nível como visto. Aparece quando o nível mostrado é maior que o último que este aparelho já mostrou; na primeira vez no
 *   aparelho, só guarda o nível dos marcos, sem comemorar. A volta depois de uma queda não comemora (o aparelho guarda o maior já visto);
 * - o aviso de queda (D-111), a partir do 45º dia sem anotar: o texto, "Ver meu nível" e "Agora não".
 * Os marcos e o tempo sem anotar são pedidos de novo a cada volta ao Resumo.
 */
export function LevelUpCard() {
  const { user, auth } = useSession();
  const query = useAccountLevelState();
  const shown = useShownLevel();
  const seen = useLevelSeen(user?.id, auth.mode !== 'demo');
  const { refetch } = query;
  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );
  const level = shown?.level ?? null;
  const marksLevel = shown?.marksLevel ?? null;
  const { loaded, level: last, mark } = seen;
  useEffect(() => {
    if (level && marksLevel && loaded && last === null) mark(levelToRemember(null, { level, marksLevel }));
  }, [level, marksLevel, loaded, last, mark]);
  const celebrate = useNotice('nivel', Boolean(level && loaded && shouldCelebrateLevel(last, level)));
  const { warning, dismiss } = useLevelWarning(shown);
  const warn = useNotice('nivel_aviso', Boolean(warning));
  if (celebrate && level && marksLevel) {
    const remember = () => mark(levelToRemember(last, { level, marksLevel }));
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
                remember();
                router.push('/conta/nivel');
              }}
              style={{ flexGrow: 1, maxWidth: '100%' }}
            />
            <LinkButton label={T.celebrateDismiss} onPress={remember} />
          </View>
        </Card>
      </Animated.View>
    );
  }
  if (warn && warning) {
    return (
      <Animated.View entering={FadeInDown.duration(320).reduceMotion(ReduceMotion.System)}>
        <Card style={{ gap: space[3] }}>
          <View style={styles.row}>
            <LevelBadge level={warning.from} size={32} />
            <Txt variant="title" accessibilityRole="header" aria-level={2} style={{ flex: 1 }}>
              {T.warningEyebrow}
            </Txt>
          </View>
          <Txt>{T.warning(warning)}</Txt>
          <View style={styles.actions}>
            <Button label={T.open} tone="soft" onPress={() => router.push('/conta/nivel')} style={{ flexGrow: 1, maxWidth: '100%' }} />
            <LinkButton label={T.warningDismiss} onPress={dismiss} />
          </View>
        </Card>
      </Animated.View>
    );
  }
  return null;
}

const styles = StyleSheet.create({
  track: { height: 6, borderRadius: radius.pill, overflow: 'hidden', backgroundColor: colors.brandTint },
  fill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.brandMark },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  actions: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space[3] },
  levelRow: { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 52, paddingVertical: space[2] },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  note: { gap: space[2], borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space[3] },
  tag: { backgroundColor: colors.brandTint, borderRadius: radius.pill, paddingHorizontal: space[2], paddingVertical: 2 },
});
