import {
  CALC_UI_TEXT,
  ERROR_TEXT,
  SUBSCRIPTION_ERROR_TEXT,
  SUBSCRIPTION_TEXT,
  custoPorAnoLink,
  isRepoError,
  lastSubscriptionReview,
  newOperationKey,
  subscriptionCount,
  subscriptionErrorText,
  subscriptionRows,
  subscriptionTotals,
  type CommitmentSeries,
  type IsoDate,
  type SubscriptionRow,
} from '@clarevo/core';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { AlertCircle, Calculator, Check, ClipboardCheck, Info } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { openCalc } from '@/components/calc/open';
import { ContextPill, SubHeader } from '@/components/header';
import { MoneyTxt } from '@/components/money-text';
import { EmptyState, ErrorState } from '@/components/states';
import { Banner, Button, Card, LinkButton, Screen, Skeleton, Txt } from '@/components/ui';
import { moneyA11y, moneyText, useValuesHidden } from '@/lib/privacy';
import { useMarkSubscriptionsReviewed, useSeriesList, useSpace } from '@/state/data';
import { useSession } from '@/state/session';
import { colors, fonts, space, tabular } from '@/theme/tokens';

/** "R$ 39,90 por mês · R$ 478,80 por ano": com valor que muda, o "≈" na tela e "cerca de" no leitor de tela. */
function amounts(row: SubscriptionRow, hidden: boolean): { text: string; a11y: string } {
  const sign = row.estimated ? '≈ ' : '';
  const spoken = row.estimated ? 'cerca de ' : '';
  return {
    text: `${sign}${moneyText(row.monthlyCents, hidden)} por mês · ${sign}${moneyText(row.yearlyCents, hidden)} por ano`,
    a11y: `${spoken}${moneyA11y(row.monthlyCents, hidden)} por mês, ${spoken}${moneyA11y(row.yearlyCents, hidden)} por ano`,
  };
}

/**
 * Uma assinatura da revisão: nome, valores por mês e por ano, "Continua" (só para a pessoa acompanhar a lista; não é guardado) e
 * "Encerrar a partir de…", que abre o fluxo de encerrar do gasto fixo. Nenhuma ação aqui apaga ou muda sozinha.
 */
function ReviewRow({
  row,
  series,
  today,
  kept,
  onKeep,
  last,
}: {
  row: SubscriptionRow;
  series: CommitmentSeries | undefined;
  today: IsoDate;
  kept: boolean;
  onKeep: () => void;
  last: boolean;
}) {
  const hidden = useValuesHidden();
  const line = amounts(row, hidden);
  const calc = series ? custoPorAnoLink(series, today) : null;
  return (
    <View style={[styles.row, !last && styles.divider]}>
      <View style={{ gap: 2 }}>
        <Txt variant="label" style={{ fontFamily: fonts.bold, fontSize: 16 }} accessibilityRole="header" aria-level={3}>
          {row.name}
        </Txt>
        <Txt variant="caption" color={colors.textSecondary} style={tabular} accessibilityLabel={`${row.name}, ${line.a11y}, todo dia ${row.dueDay}`}>
          {`${line.text} · todo dia ${row.dueDay}`}
        </Txt>
      </View>
      <View style={styles.actions}>
        <Button
          label={SUBSCRIPTION_TEXT.keeps}
          icon={kept ? Check : undefined}
          tone={kept ? 'brand' : 'soft'}
          compact
          accessibilityLabel={`${SUBSCRIPTION_TEXT.keeps}: ${row.name}`}
          accessibilityHint={SUBSCRIPTION_TEXT.keepsHint}
          accessibilityState={{ selected: kept }}
          aria-pressed={kept}
          onPress={onKeep}
        />
        <Button
          label={SUBSCRIPTION_TEXT.endFrom}
          tone="ghost"
          compact
          accessibilityLabel={`${SUBSCRIPTION_TEXT.endFrom} ${row.name}`}
          onPress={() => router.push(`/gastos-fixos/${row.id}/encerrar`)}
        />
      </View>
      {calc ? (
        <LinkButton
          label={CALC_UI_TEXT.links.custoAno}
          accessibilityLabel={`${CALC_UI_TEXT.links.custoAno} ${row.name}`}
          icon={Calculator}
          style={styles.calc}
          onPress={() => openCalc('custo-por-ano', calc)}
        />
      ) : null}
    </View>
  );
}

/**
 * Revisar assinaturas (D-046): tela de consulta com as assinaturas ativas, o que custam por mês e por ano e, para cada uma,
 * "Continua" e "Encerrar a partir de…". "Revisei minhas assinaturas" grava só a data de hoje (mark_subscriptions_reviewed): nada
 * é encerrado, apagado nem cobrado, e o aviso de Gastos fixos some. Texto neutro: não julga nenhuma assinatura.
 */
export default function RevisarAssinaturas() {
  const { today } = useSession();
  const personal = useSpace().data;
  const list = useSeriesList(personal?.personalContextId);
  const mark = useMarkSubscriptionsReviewed();
  const [kept, setKept] = useState<ReadonlySet<string>>(new Set());
  /** Dia gravado por "Revisei minhas assinaturas" nesta visita (null: ainda não revisou aqui). */
  const [doneOn, setDoneOn] = useState<IsoDate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const key = useRef(newOperationKey());

  const all = list.data ?? [];
  const rows = subscriptionRows(all, today);
  const totals = subscriptionTotals(all, today);
  const byId = new Map(all.map((s) => [s.id, s]));
  const lastReview = lastSubscriptionReview(all, today);
  const keptNow = rows.filter((r) => kept.has(r.id)).length;

  const toggle = (id: string) =>
    setKept((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const review = async () => {
    if (busy || !personal) return;
    setBusy(true);
    setError(null);
    try {
      const result = await mark.mutateAsync({ key: key.current, contextId: personal.personalContextId });
      key.current = newOperationKey();
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setDoneOn(result.reviewedOn ?? today);
    } catch (e) {
      // Falha de rede: a gravação pode ter acontecido; repetir com a mesma chave é seguro (o banco reconhece a repetição).
      if (isRepoError(e) && e.code !== 'rede' && e.code !== 'desconhecido') {
        key.current = newOperationKey();
        setError(subscriptionErrorText(e.code));
      } else {
        setError(SUBSCRIPTION_ERROR_TEXT.review_failed);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SubHeader title={SUBSCRIPTION_TEXT.reviewTitle} right={<ContextPill label="Pessoal" />} />
      <Screen contentStyle={{ padding: space[5], gap: space[4] }}>
        {list.isPending || !personal ? (
          <View style={{ gap: space[3] }}>
            <Skeleton width="80%" height={20} />
            <Skeleton width="100%" height={96} />
            <Skeleton width="100%" height={96} />
          </View>
        ) : list.isError ? (
          <ErrorState message={ERROR_TEXT.carregar_falhou} onRetry={() => list.refetch()} />
        ) : rows.length === 0 ? (
          <Card>
            <EmptyState title="Nenhuma assinatura" art="compromissos" action={<Button label={SUBSCRIPTION_TEXT.emptyAction} tone="soft" onPress={() => router.replace('/gastos-fixos')} />}>
              {SUBSCRIPTION_TEXT.empty}
            </EmptyState>
          </Card>
        ) : (
          <>
            <View style={{ gap: space[2] }}>
              <Txt>{SUBSCRIPTION_TEXT.reviewIntro}</Txt>
              <MoneyTxt variant="label" style={[tabular, { fontFamily: fonts.bold }]}>
                {`${subscriptionCount(totals.count)}: ${SUBSCRIPTION_TEXT.totals(totals.monthlyCents, totals.yearlyCents)}`}
              </MoneyTxt>
              {totals.estimatedMonthlyCents > 0 ? (
                <MoneyTxt variant="caption" color={colors.textSecondary} style={tabular}>
                  {SUBSCRIPTION_TEXT.groupEstimated(totals.estimatedMonthlyCents)}
                </MoneyTxt>
              ) : null}
              <Txt variant="caption" color={colors.textSecondary}>
                {SUBSCRIPTION_TEXT.lastReview(lastReview)}
              </Txt>
            </View>

            <Card>
              {rows.map((row, i) => (
                <ReviewRow
                  key={row.id}
                  row={row}
                  series={byId.get(row.id)}
                  today={today}
                  kept={kept.has(row.id)}
                  onKeep={() => toggle(row.id)}
                  last={i === rows.length - 1}
                />
              ))}
            </Card>

            <Banner tone="info" icon={Info} live={false}>
              <Txt variant="label">{SUBSCRIPTION_TEXT.reviewNote}</Txt>
            </Banner>

            <Txt variant="caption" color={colors.textSecondary} accessibilityLiveRegion="polite">
              {SUBSCRIPTION_TEXT.keepsCount(keptNow, rows.length)}
            </Txt>

            {doneOn ? (
              <Banner tone="sucesso" icon={Check}>
                <Txt variant="label" color={colors.successText} style={{ fontFamily: fonts.bold }}>
                  {SUBSCRIPTION_TEXT.reviewedDone}
                </Txt>
                <Txt variant="caption" color={colors.successText}>
                  {SUBSCRIPTION_TEXT.lastReview(doneOn)}
                </Txt>
              </Banner>
            ) : null}
            {error ? (
              <Banner tone="erro" icon={AlertCircle}>
                <Txt variant="label" color={colors.error}>
                  {error}
                </Txt>
              </Banner>
            ) : null}

            <Button label={SUBSCRIPTION_TEXT.reviewedButton} icon={ClipboardCheck} busy={busy} busyLabel="Registrando…" onPress={review} />
            <Txt variant="caption" color={colors.textSecondary}>
              {SUBSCRIPTION_TEXT.reviewFooter}
            </Txt>
          </>
        )}
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: space[2], paddingVertical: space[3] },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  calc: { alignSelf: 'flex-start', paddingHorizontal: 0, minHeight: 44 },
});
