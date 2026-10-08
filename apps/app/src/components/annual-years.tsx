import {
  ANNUAL_SERIES_ERROR_TEXT,
  affectedByEditFrom,
  affectedByYear,
  annualYearErrorText,
  annualYearRange,
  annualYearSummary,
  isRepoError,
  mergeOccurrences,
  seriesEnded,
  seriesErrorText,
  suggestedAnnualReference,
  type AnnualYearSummary,
  type Commitment,
  type CommitmentSeries,
  type IsoDate,
  type YearPlan,
} from '@clarevo/core';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Animated, { FadeOut, LinearTransition, ReduceMotion } from 'react-native-reanimated';

import { CommitmentRow } from '@/components/commitment-row';
import { ConfirmDialog } from '@/components/dialog';
import { yearA11y } from '@/components/series-parts';
import { Button, Card, LinkButton, Txt } from '@/components/ui';
import { useSeriesOperationKey, useSkipSeriesYear, useUpdateSeriesFrom } from '@/state/data';
import { colors, fonts, motion, space, tabular } from '@/theme/tokens';

// Linhas que saem ao tirar parcelas e a lista "Ver as 10 parcelas" se reacomodam devagar (CL-V008), só depois da
// resposta do servidor; com "Reduzir movimento", nada anima.
const rowExit = FadeOut.duration(motion.detail).reduceMotion(ReduceMotion.System);
const rowLayout = LinearTransition.duration(motion.detail).reduceMotion(ReduceMotion.System);

type YearPlanOk = Extract<YearPlan, { ok: true }>;

/** Anos mostrados em "Ano a ano": até os 5 mais recentes, do primeiro ano da série ao próximo ainda previsto. */
const MAX_YEARS = 5;

/**
 * Conta do ano no detalhe (D-029): "Ano a ano" com as contas de cada ano, "Informar o valor de 2027", "Tirar as parcelas
 * de 2027 em aberto" (ou "Não houve em 2027") e a sugestão de referência, aplicada só com toque.
 * - occurrences: as 60 mais recentes (abertas e pagas), por número crescente;
 * - open: todas as em aberto (o banco confere o conjunto inteiro ao tirar ou informar).
 * Tirar e aplicar a sugestão guardam a chave entre tentativas e conferem com findSeriesOperation antes de repetir.
 */
export function AnnualYears({
  series: s,
  occurrences,
  open,
  today,
  onNotice,
  onError,
  onRefused,
}: {
  series: CommitmentSeries;
  occurrences: readonly Commitment[];
  open: readonly Commitment[];
  today: IsoDate;
  /** Faixa de sucesso (anunciada) depois de gravar. */
  onNotice: (text: string) => void;
  onError: (text: string) => void;
  /** Recusa do servidor: recarregar a série e as contas. */
  onRefused: () => void;
}) {
  const k = s.partsPerYear ?? 1;
  const ended = seriesEnded(s, today);
  const list = mergeOccurrences(occurrences, open);
  const range = annualYearRange(s, today);
  const years: AnnualYearSummary[] = [];
  for (let a = Math.max(range.from, range.to - (MAX_YEARS - 1)); a <= range.to; a++) years.push(annualYearSummary(s, occurrences, open, a, today));
  const suggestion = ended ? null : suggestedAnnualReference(s, occurrences);

  const skip = useSkipSeriesYear();
  const update = useUpdateSeriesFrom();
  const skipKeys = useSeriesOperationKey();
  const refKeys = useSeriesOperationKey();
  const [expanded, setExpanded] = useState<number[]>([]);
  const [confirm, setConfirm] = useState<{ plan: YearPlanOk; number: number } | null>(null);
  const [busy, setBusy] = useState(false);

  const success = (text: string) => {
    // Confirmação tátil só depois da gravação confirmada.
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    onNotice(text);
  };

  /** "Tirar as parcelas de 2027 em aberto" ou "Não houve em 2027": skip_series_year com o conjunto confirmado. */
  const doSkip = async () => {
    if (!confirm || busy) return;
    const { plan, number } = confirm;
    const snapshot = JSON.stringify([s.id, number, plan.affected]);
    const failed = `Não foi possível tirar ${k === 1 ? 'a conta' : 'as parcelas'} de ${plan.year.label}. Tente novamente.`;
    setBusy(true);
    try {
      if (skipKeys.hasPending()) {
        const saved = await skipKeys.findSaved();
        if (saved?.action === 'tirar_ano') {
          skipKeys.settled();
          setConfirm(null);
          success(plan.doneText);
          return;
        }
      }
      const key = skipKeys.keyFor(snapshot);
      try {
        await skip.mutateAsync({ key, seriesId: s.id, number, affected: plan.affected });
        skipKeys.settled();
        setConfirm(null);
        success(plan.doneText);
      } catch (e) {
        setConfirm(null);
        if (isRepoError(e) && e.code !== 'rede' && e.code !== 'desconhecido') {
          skipKeys.refused();
          onError(annualYearErrorText(e.code, plan.year.label));
          onRefused();
          return;
        }
        skipKeys.uncertain(key, snapshot);
        onError(failed);
      }
    } catch {
      setConfirm(null);
      onError(failed);
    } finally {
      setBusy(false);
    }
  };

  /** "Usar R$ 2.512,30 a partir de 2028": "esta e as próximas" a partir do 1º número do ano seguinte (pode ainda não existir). */
  const applySuggestion = async () => {
    if (!suggestion || busy) return;
    const plan = affectedByEditFrom(list, s, suggestion.fromNumber);
    if (!plan.ok) {
      onError(ANNUAL_SERIES_ERROR_TEXT.inicio_em_conta_paga);
      return;
    }
    const snapshot = JSON.stringify([s.id, s.version, suggestion.fromNumber, suggestion.edit, plan.affected]);
    const doneText = `Referência atualizada: ${suggestion.action.replace(/^Usar /, '')}.`;
    setBusy(true);
    try {
      if (refKeys.hasPending()) {
        const saved = await refKeys.findSaved();
        if (saved?.action === 'alterar_serie') {
          refKeys.settled();
          success(doneText);
          return;
        }
      }
      const key = refKeys.keyFor(snapshot);
      try {
        await update.mutateAsync({ key, id: s.id, version: s.version, fromNumber: suggestion.fromNumber, affected: plan.affected, input: suggestion.edit });
        refKeys.settled();
        success(doneText);
      } catch (e) {
        if (isRepoError(e) && e.code !== 'rede' && e.code !== 'desconhecido') {
          refKeys.refused();
          onError(seriesErrorText(e.code, today, 'anual'));
          onRefused();
          return;
        }
        refKeys.uncertain(key, snapshot);
        onError(ANNUAL_SERIES_ERROR_TEXT.salvar_falhou);
      }
    } catch {
      onError(ANNUAL_SERIES_ERROR_TEXT.salvar_falhou);
    } finally {
      setBusy(false);
    }
  };

  const toggle = (index: number) => setExpanded((cur) => (cur.includes(index) ? cur.filter((x) => x !== index) : [...cur, index]));

  return (
    <>
      <Card style={{ gap: space[2] }}>
        <Txt variant="title" accessibilityRole="header" aria-level={2}>
          Ano a ano
        </Txt>
        {years.length === 0 ? (
          <Txt variant="label" color={colors.textSecondary}>
            Esta conta do ano foi encerrada antes da primeira conta.
          </Txt>
        ) : null}
        {years.map((y, i) => {
          // Número de uma parcela do ano dentro da série (o banco recusa número antes do primeiro).
          const n = Math.max(s.firstNumber, y.year.firstNumber);
          const inYear = list
            .filter((c) => c.series!.number >= y.year.firstNumber && c.series!.number <= y.year.lastNumber)
            .sort((a, b) => a.series!.number - b.series!.number);
          const inform = y.planned ? null : affectedByYear(list, s, n, 'informar');
          const remove = y.planned ? null : affectedByYear(list, s, n, 'tirar');
          const isOpen = expanded.includes(y.year.index);
          const label = y.year.label;
          return (
            <Animated.View key={y.year.index} layout={rowLayout} style={[styles.year, i < years.length - 1 && styles.divider]}>
              <Txt
                variant="label"
                style={[{ fontFamily: fonts.bold, fontSize: 15 }, tabular]}
                accessibilityLabel={yearA11y(y.texts.line).replace(/ · /g, ', ')}>
                {y.texts.line}
              </Txt>
              {y.texts.paidBefore ? (
                <Txt variant="caption" color={colors.textSecondary}>
                  {y.texts.paidBefore}
                </Txt>
              ) : null}
              {y.texts.missing ? (
                <View style={{ gap: space[1] }}>
                  <Txt variant="label">{y.texts.missing}</Txt>
                  <LinkButton label="Anotar gasto" style={styles.inlineLink} onPress={() => router.push('/registro/novo')} />
                </View>
              ) : null}

              {k === 1 ? (
                inYear.map((c) => (
                  <Animated.View key={c.id} exiting={rowExit} layout={rowLayout}>
                    <CommitmentRow commitment={c} today={today} last onPress={() => router.push(`/a-pagar/${c.id}`)} />
                  </Animated.View>
                ))
              ) : inYear.length > 0 ? (
                <View>
                  <LinkButton
                    label={isOpen ? 'Esconder as parcelas' : inYear.length === 1 ? 'Ver a parcela' : `Ver as ${inYear.length} parcelas`}
                    accessibilityState={{ expanded: isOpen }}
                    // Na web, o estado só chega ao leitor de tela pelo atributo aria (como aria-checked nos chips).
                    aria-expanded={isOpen}
                    style={styles.inlineLink}
                    onPress={() => toggle(y.year.index)}
                  />
                  {isOpen
                    ? inYear.map((c, j) => (
                        <Animated.View key={c.id} exiting={rowExit} layout={rowLayout}>
                          <CommitmentRow commitment={c} today={today} last={j === inYear.length - 1} onPress={() => router.push(`/a-pagar/${c.id}`)} />
                        </Animated.View>
                      ))
                    : null}
                </View>
              ) : null}

              {inform?.ok || remove?.ok ? (
                <View style={styles.actions}>
                  {inform?.ok ? (
                    <Button
                      label={`Informar o valor de ${label}`}
                      tone="soft"
                      style={styles.action}
                      onPress={() => router.push({ pathname: '/gastos-fixos/[id]/informar', params: { id: s.id, numero: String(n) } })}
                    />
                  ) : null}
                  {remove?.ok ? (
                    <Button
                      label={k > 1 ? `Tirar as parcelas de ${label} em aberto` : `Não houve em ${label}`}
                      tone="ghost"
                      style={styles.action}
                      disabled={busy}
                      onPress={() => setConfirm({ plan: remove, number: n })}
                    />
                  ) : null}
                </View>
              ) : null}
            </Animated.View>
          );
        })}
      </Card>

      {suggestion ? (
        <Card style={{ gap: space[2] }}>
          <Txt variant="label" style={tabular}>
            {suggestion.text}
          </Txt>
          <Button label={suggestion.action} tone="soft" busy={busy} busyLabel="Salvando…" onPress={applySuggestion} />
        </Card>
      ) : null}

      {confirm ? (
        <ConfirmDialog
          visible
          title={confirm.plan.title}
          cancelLabel="Cancelar"
          confirmLabel={k > 1 ? 'Tirar parcelas' : 'Tirar conta'}
          busy={busy}
          onCancel={() => setConfirm(null)}
          onConfirm={doSkip}>
          <Txt color={colors.textSecondary}>{confirm.plan.text}</Txt>
          <Txt color={colors.textSecondary}>
            {k > 1 ? 'Os valores deixam' : 'O valor deixa'} de contar em Ainda a pagar. Recebido, Pago e a diferença do mês não mudam.
          </Txt>
        </ConfirmDialog>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  year: { gap: space[2], paddingVertical: space[3] },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  inlineLink: { alignSelf: 'flex-start', paddingHorizontal: 0 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  action: { alignSelf: 'auto', flexGrow: 1, flexBasis: 200 },
});
