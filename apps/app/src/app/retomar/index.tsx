import {
  RETURN_TEXT,
  RETURN_TOPIC_SLUG,
  lastClosedMonth,
  returnErrorText,
  returnOpeningText,
  reviewCurrentText,
  reviewExpectedVersion,
  reviewMonthCard,
  type ReviewMonth,
} from '@clarevo/core';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { AlertCircle, CalendarRange, ListChecks } from 'lucide-react-native';
import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, ReduceMotion } from 'react-native-reanimated';

import { ContextPill, SubHeader } from '@/components/header';
import { codeOf, isConflict, isUncertain, useReturnWriter } from '@/components/retorno-acoes';
import { EmptyState, ErrorState } from '@/components/states';
import { Banner, Button, Card, LinkButton, Screen, Skeleton, Txt } from '@/components/ui';
import { flash } from '@/lib/flash';
import { useReturnReview, useSpace } from '@/state/data';
import { useSession } from '@/state/session';
import { colors, fonts, motion, space, tabular } from '@/theme/tokens';

/** Abrir o resumo com motion.detail (280 ms), respeitando "reduzir movimento" (CL-V008). */
const openIn = FadeIn.duration(motion.detail).reduceMotion(ReduceMotion.System);

/**
 * /retomar · Seus últimos meses (D-030): o que está registrado mês a mês desde a última anotação, as contas em aberto e
 * os meses de gastos fixos, parcelamentos e contas do ano sem conta registrada; depois, "Atualizar agora" ou "Seguir
 * adiante". Só o que está no Clarevo: mês sem anotação não é mês sem gastos. Falha de carga nunca vira lista parcial.
 */
export default function SeusUltimosMeses() {
  const { today } = useSession();
  const personal = useSpace().data;
  const ctx = personal?.personalContextId;
  const query = useReturnReview(ctx);
  const writer = useReturnWriter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const review = query.data?.review ?? null;
  const state = query.data?.state ?? null;
  const toSummary = () => router.dismissTo('/');

  const moveOn = async () => {
    if (busy || !ctx || !state) return;
    setBusy(true);
    setError(null);
    try {
      await writer.decide({ contextId: ctx, expectedVersion: reviewExpectedVersion(state), reviewedThrough: lastClosedMonth(today), decision: 'seguiu' });
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      flash.set(RETURN_TEXT.movedOn);
      toSummary();
    } catch (e) {
      setError(!isUncertain(e) && isConflict(e) ? returnErrorText(codeOf(e)) : RETURN_TEXT.decideFailed);
      if (!isUncertain(e)) query.refetch();
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SubHeader title={RETURN_TEXT.title} onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))} right={<ContextPill label="Pessoal" />} />
      <Screen contentStyle={styles.body}>
        {query.isPending ? (
          <View style={{ gap: space[3] }} accessibilityRole="progressbar" accessibilityLabel="Carregando o resumo dos últimos meses">
            <Skeleton width="90%" height={20} />
            <Skeleton width="100%" height={110} />
            <Skeleton width="100%" height={110} />
          </View>
        ) : query.isError || !query.data ? (
          <ErrorState message={RETURN_TEXT.loadFailed} onRetry={() => query.refetch()} />
        ) : !review || review.isEmpty ? (
          <Card>
            <EmptyState
              title={RETURN_TEXT.emptyTitle}
              art="compromissos"
              action={<Button label={RETURN_TEXT.backToSummary} tone="soft" onPress={toSummary} />}>
              {RETURN_TEXT.emptyBody}
            </EmptyState>
          </Card>
        ) : (
          <Animated.View entering={openIn} style={{ gap: space[4] }}>
            <Txt>{returnOpeningText(review)}</Txt>
            <Banner tone="info" icon={CalendarRange} live={false}>
              <Txt variant="label">{RETURN_TEXT.note}</Txt>
              <LinkButton
                label={RETURN_TEXT.learnMore}
                accessibilityLabel={RETURN_TEXT.learnMoreA11y}
                style={styles.inlineLink}
                onPress={() => router.push(`/explicacao/${RETURN_TOPIC_SLUG}`)}
              />
            </Banner>

            {review.months.map((m) => (
              <MonthCard key={m.month} month={m} />
            ))}

            {reviewCurrentText(review.current) ? (
              <Card style={{ gap: space[1] }}>
                <Txt variant="label" style={tabular}>
                  {reviewCurrentText(review.current)}
                </Txt>
              </Card>
            ) : null}

            {review.window.cutBefore ? (
              <Txt variant="caption" color={colors.textSecondary}>
                {RETURN_TEXT.cut(review.window.cutBefore)}
              </Txt>
            ) : null}

            {error ? (
              <Banner tone="erro" icon={AlertCircle}>
                <Txt variant="label" color={colors.error}>
                  {error}
                </Txt>
              </Banner>
            ) : null}

            <View style={{ gap: space[3] }}>
              <Button label={RETURN_TEXT.updateNow} icon={ListChecks} disabled={busy} onPress={() => router.push('/retomar/atualizar')} />
              <Button label={RETURN_TEXT.moveOn} tone="soft" busy={busy} busyLabel="Salvando…" onPress={moveOn} />
              <Txt variant="caption" color={colors.textSecondary}>
                {RETURN_TEXT.moveOnHint}
              </Txt>
            </View>
          </Animated.View>
        )}
      </Screen>
    </View>
  );
}

/** Cartão do mês fechado. Compacto quando não há nada a conferir (recebimentos e gastos anotados e nenhuma conta). */
function MonthCard({ month }: { month: ReviewMonth }) {
  const card = reviewMonthCard(month);
  if (card.compact) {
    return (
      <Card style={styles.compact}>
        <Txt variant="label" style={{ fontFamily: fonts.bold }} accessibilityRole="header" aria-level={2}>
          {card.title}
        </Txt>
        <Txt variant="caption" color={colors.textSecondary} style={tabular}>
          {card.received} · {card.paid}
        </Txt>
      </Card>
    );
  }
  return (
    <Card style={{ gap: space[2] }}>
      <Txt variant="title" accessibilityRole="header" aria-level={2}>
        {card.title}
      </Txt>
      <Txt variant="label" style={tabular}>
        {card.received}
      </Txt>
      <Txt variant="label" style={tabular}>
        {card.paid}
      </Txt>
      <View style={styles.lines}>
        {card.lines.map((line) => (
          <Txt key={line} variant="label" color={colors.textSecondary} style={tabular}>
            {line}
          </Txt>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  body: { padding: space[5], gap: space[4] },
  inlineLink: { alignSelf: 'flex-start', paddingHorizontal: 0 },
  compact: { gap: space[1], paddingVertical: space[3] },
  lines: { gap: space[1], borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space[2] },
});
