import { ERROR_TEXT, formatMonthBR, toPayCaption, type Commitment } from '@clarevo/core';
import { router } from 'expo-router';
import { Info, ListChecks, Plus, Repeat, ShieldCheck } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeOut, LinearTransition, ReduceMotion } from 'react-native-reanimated';

import { CommitmentRow } from '@/components/commitment-row';
import { FlashBanner, useFlash } from '@/components/flash';
import { ContextPill, SubHeader } from '@/components/header';
import { EmptyState, ErrorState } from '@/components/states';
import { Banner, Button, Card, FitMoney, LinkButton, Screen, Skeleton, Txt } from '@/components/ui';
import { useCommitments, useSeriesList, useSeriesSync, useSpace, useView } from '@/state/data';
import { useSession } from '@/state/session';
import { colors, fonts, motion, radius, space } from '@/theme/tokens';

// Linhas saem e se reacomodam devagar (CL-V008); nada anima antes da resposta do servidor.
const rowExit = FadeOut.duration(motion.detail).reduceMotion(ReduceMotion.System);
const rowLayout = LinearTransition.duration(motion.detail).reduceMotion(ReduceMotion.System);

/** "1 conta de gasto fixo que já venceu" ou "2 contas de gastos fixos que já venceram". */
const createdOverdueText = (n: number) =>
  n === 1
    ? 'O Clarevo criou 1 conta de gasto fixo que já venceu. Confira se você já pagou.'
    : `O Clarevo criou ${n} contas de gastos fixos que já venceram. Confira se você já pagou.`;

const registeredText = (n: number) => (n === 0 ? 'Nenhum cadastrado' : n === 1 ? '1 cadastrado' : `${n} cadastrados`);

/** Contas a pagar do contexto Pessoal no mês em exibição, com a mesma origem do card do Resumo. */
export default function ContasAPagarScreen() {
  const { today } = useSession();
  const { month, currentMonth } = useView();
  const personal = useSpace().data;
  const ctx = personal?.personalContextId;
  const commitments = useCommitments(ctx, month);
  const seriesList = useSeriesList(ctx);
  const sync = useSeriesSync(ctx);
  const [notice] = useFlash();
  const s = commitments.summary;
  const monthName = formatMonthBR(month);
  const isCurrent = month === currentMonth;
  const caption = s ? toPayCaption(s, today) : null;
  // A sincronização do dia criou contas já vencidas: a faixa fica enquanto alguma conta de gasto fixo continuar vencida.
  const createdOverdue = sync.data?.createdOverdue ?? 0;
  const showCreatedOverdue = isCurrent && createdOverdue > 0 && Boolean(s?.overdue.some((c) => c.series));

  const sections: { title: string; legend?: string; list: Commitment[]; review?: boolean }[] = !s
    ? []
    : isCurrent
      ? [
          { title: 'Vencidas', list: s.overdue, review: s.overdue.length >= 2 },
          { title: `A vencer em ${monthName.toLowerCase()}`, list: s.upcomingInMonth },
          { title: 'Pagas', legend: 'Já contam em Pago, no mês da data do pagamento.', list: s.paidInMonth },
          { title: 'Próximos meses', legend: 'Não entram no total deste mês.', list: s.later },
        ]
      : [
          { title: 'Em aberto', list: s.items },
          { title: 'Pagas', legend: 'Já contam em Pago, no mês da data do pagamento.', list: s.paidInMonth },
        ];
  const visible = sections.filter((sec) => sec.list.length > 0);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SubHeader title="Contas a pagar" right={<ContextPill label="Pessoal" />} />
      <Screen contentStyle={{ padding: space[5], gap: space[4] }}>
        <FlashBanner message={notice} />
        {showCreatedOverdue ? (
          <Banner tone="info" icon={Info}>
            <Txt variant="label">{createdOverdueText(createdOverdue)}</Txt>
            <LinkButton label="Revisar vencidas" icon={ListChecks} style={styles.inlineLink} onPress={() => router.push('/a-pagar/vencidas')} />
          </Banner>
        ) : null}

        <View style={{ gap: space[1] }}>
          <Txt variant="caption" color={colors.textSecondary}>
            Pessoal · {monthName}
          </Txt>
          <Txt variant="label" color={colors.textSecondary}>
            {isCurrent ? 'Ainda a pagar neste mês' : `Previsto para ${monthName.toLowerCase()}`}
          </Txt>
          {commitments.isPending ? (
            <Skeleton width={180} height={40} />
          ) : commitments.isError || !s ? (
            <ErrorState message={ERROR_TEXT.carregar_falhou} onRetry={() => commitments.refetch()} />
          ) : (
            <>
              <FitMoney cents={s.toPayCents} />
              {caption?.includes ? <Txt variant="label">{caption.includes}</Txt> : null}
              {caption?.estimated ? <Txt variant="label">{caption.estimated}</Txt> : null}
            </>
          )}
          <Txt color={colors.textSecondary}>
            {isCurrent
              ? 'Contas em aberto com vencimento até o fim do mês, inclusive as vencidas de meses anteriores. Ainda não saíram da conta e não entram em Pago nem na diferença do mês.'
              : `Contas com vencimento em ${monthName.toLowerCase()} que continuam em aberto. Não entram em Pago nem na diferença do mês.`}
          </Txt>
        </View>

        <Button label="Anotar conta a pagar" icon={Plus} onPress={() => router.push('/a-pagar/nova')} />
        <SeriesLink count={seriesList.data?.length ?? null} />

        {commitments.isPending ? (
          <View style={{ gap: space[3] }}>
            <Skeleton width="100%" height={56} />
            <Skeleton width="100%" height={56} />
          </View>
        ) : !s ? null : !s.hasAny ? (
          <Card>
            <EmptyState title="Nenhuma conta a pagar em aberto" art="compromissos">
              Anote contas que ainda vão vencer, como internet ou condomínio. Elas ficam separadas do que já foi pago até você marcar como
              paga.
            </EmptyState>
          </Card>
        ) : visible.length === 0 ? (
          // Mês passado só com contas em aberto de outros meses: nada vence neste mês.
          <Card>
            <EmptyState title={`Nenhuma conta a pagar com vencimento em ${monthName.toLowerCase()}`} art="compromissos" />
          </Card>
        ) : (
          visible.map((sec) => (
            <Animated.View key={sec.title} layout={rowLayout}>
              <Card>
                <Txt variant="title" accessibilityRole="header" aria-level={2}>
                  {sec.title}
                </Txt>
                {sec.legend ? (
                  <Txt variant="caption" color={colors.textSecondary}>
                    {sec.legend}
                  </Txt>
                ) : null}
                {sec.review ? (
                  <LinkButton label="Revisar vencidas" icon={ListChecks} style={styles.inlineLink} onPress={() => router.push('/a-pagar/vencidas')} />
                ) : null}
                {sec.list.map((c, i) => (
                  <Animated.View key={c.id} exiting={rowExit} layout={rowLayout}>
                    <CommitmentRow commitment={c} today={today} last={i === sec.list.length - 1} onPress={() => router.push(`/a-pagar/${c.id}`)} />
                  </Animated.View>
                ))}
              </Card>
            </Animated.View>
          ))
        )}

        <Txt variant="label" color={colors.textSecondary}>
          Já anotou o pagamento como gasto? Exclua a conta a pagar para ela não continuar em Ainda a pagar.
        </Txt>
        <LinkButton label="O que é previsto e realizado?" color={colors.textSecondary} onPress={() => router.push('/explicacao/realizado-previsto')} />
        <Pressable accessibilityRole="button" onPress={() => router.push('/quem-ve')} style={styles.privacy}>
          <ShieldCheck size={18} color={colors.textSecondary} />
          <Txt variant="label" color={colors.textSecondary}>
            Quem vê estes dados?
          </Txt>
        </Pressable>
      </Screen>
    </View>
  );
}

/**
 * "Gastos fixos e parcelamentos" com a legenda "{n} cadastrados", num único alvo tocável.
 * A legenda só aparece com a lista carregada (nunca um "0" de uma falha).
 */
function SeriesLink({ count }: { count: number | null }) {
  const legend = count === null ? null : registeredText(count);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={legend ? `Gastos fixos e parcelamentos, ${legend}` : 'Gastos fixos e parcelamentos'}
      onPress={() => router.push('/gastos-fixos')}
      style={(st) => [styles.seriesLink, st.pressed && { opacity: 0.7 }, (st as { focused?: boolean }).focused && styles.focusRing]}>
      <Repeat size={20} color={colors.brand} strokeWidth={2.25} />
      <View style={{ flexShrink: 1 }}>
        <Txt variant="label" color={colors.brand} style={{ fontFamily: fonts.bold, fontSize: 16 }}>
          Gastos fixos e parcelamentos
        </Txt>
        {legend ? (
          <Txt variant="caption" color={colors.textSecondary}>
            {legend}
          </Txt>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  privacy: { flexDirection: 'row', alignSelf: 'center', alignItems: 'center', gap: space[2], minHeight: 44 },
  inlineLink: { alignSelf: 'flex-start', paddingHorizontal: 0 },
  seriesLink: { flexDirection: 'row', alignItems: 'center', alignSelf: 'center', gap: space[2], minHeight: 44, paddingHorizontal: space[2], borderRadius: radius.sm },
  focusRing: { outlineWidth: 3, outlineColor: colors.brand, outlineStyle: 'solid', outlineOffset: 2 } as object,
});
