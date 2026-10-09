import {
  ANNUAL_SERIES_ERROR_TEXT,
  RETURN_TEXT,
  affectedByEditFrom,
  affectedByYear,
  annualGapRows,
  annualGapSplit,
  annualYearErrorText,
  annualYearRange,
  annualYearSummary,
  isRepoError,
  mergeOccurrences,
  rowShortName,
  seriesEnded,
  seriesErrorText,
  seriesMonthOf,
  suggestedAnnualReference,
  type AnnualReferenceSuggestion,
  type AnnualYearSummary,
  type Commitment,
  type CommitmentSeries,
  type EditFromPlan,
  type IsoDate,
  type ReviewRow,
  type YearPlan,
} from '@clarevo/core';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Animated, { FadeOut, LinearTransition, ReduceMotion } from 'react-native-reanimated';

import { CommitmentRow } from '@/components/commitment-row';
import { ConfirmDialog } from '@/components/dialog';
import { MoneyTxt } from '@/components/money-text';
import { RegisterMonthSheet } from '@/components/retorno-folha';
import { yearA11y, yearA11yLabel } from '@/components/series-parts';
import { TopicLink } from '@/components/topic-link';
import { Button, Card, LinkButton, Txt } from '@/components/ui';
import { maskMoneyText, spokenText, useValuesHidden } from '@/lib/privacy';
import { useSeriesOperationKey, useSkipSeriesYear, useUpdateSeriesFrom } from '@/state/data';
import { colors, fonts, motion, space, tabular } from '@/theme/tokens';

// Linhas que saem ao tirar parcelas e a lista "Ver as 10 parcelas" se reacomodam devagar (CL-V008), só depois da
// resposta do servidor; com "Reduzir movimento", nada anima.
const rowExit = FadeOut.duration(motion.detail).reduceMotion(ReduceMotion.System);
const rowLayout = LinearTransition.duration(motion.detail).reduceMotion(ReduceMotion.System);

type YearPlanOk = Extract<YearPlan, { ok: true }>;
type EditFromPlanOk = Extract<EditFromPlan, { ok: true }>;

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
  const hidden = useValuesHidden();
  const k = s.partsPerYear ?? 1;
  const ended = seriesEnded(s, today);
  const list = mergeOccurrences(occurrences, open);
  const range = annualYearRange(s, today);
  const years: AnnualYearSummary[] = [];
  for (let a = Math.max(range.from, range.to - (MAX_YEARS - 1)); a <= range.to; a++) years.push(annualYearSummary(s, occurrences, open, a, today));
  // Com a lista completa: a sugestão some quando o ano seguinte já tem valor informado (seriesOverride).
  const suggestion = ended ? null : suggestedAnnualReference(s, list, today);

  const skip = useSkipSeriesYear();
  const update = useUpdateSeriesFrom();
  const skipKeys = useSeriesOperationKey();
  const refKeys = useSeriesOperationKey();
  const [expanded, setExpanded] = useState<number[]>([]);
  const [confirm, setConfirm] = useState<{ plan: YearPlanOk; number: number } | null>(null);
  /**
   * "Usar R$ X a partir de 2028": o que muda e o que não muda, confirmado antes de gravar. A sugestão, o plano e a versão
   * ficam congelados até a resposta (as listas podem recarregar com o diálogo aberto).
   */
  const [refConfirm, setRefConfirm] = useState<{ plan: EditFromPlanOk; suggestion: AnnualReferenceSuggestion; version: number } | null>(null);
  const [busy, setBusy] = useState(false);
  /** "Registrar este mês" e "Registrar parcelas": as linhas sem conta registrada de um ano, numa folha (D-030). */
  const [sheet, setSheet] = useState<{ rows: ReviewRow[]; title: string } | null>(null);

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

  /**
   * "Usar R$ 2.512,30 a partir de 2028", passo 1: o conjunto que o banco vai conferir e o texto do que muda (as contas em
   * aberto do ano seguinte e as próximas) e do que não muda, para a pessoa confirmar.
   */
  const askSuggestion = () => {
    if (!suggestion || busy) return;
    const plan = affectedByEditFrom(list, s, suggestion.fromNumber);
    if (!plan.ok) {
      onError(ANNUAL_SERIES_ERROR_TEXT.inicio_em_conta_paga);
      return;
    }
    setRefConfirm({ plan, suggestion, version: s.version });
  };

  /** Passo 2, confirmado: "esta e as próximas" a partir do 1º número do ano seguinte (pode ainda não existir). */
  const applySuggestion = async () => {
    if (!refConfirm || busy) return;
    const { plan, suggestion: chosen, version } = refConfirm;
    const snapshot = JSON.stringify([s.id, version, chosen.fromNumber, chosen.edit, plan.affected]);
    const doneText = `Referência atualizada: ${chosen.action.replace(/^Usar /, '')}.`;
    setBusy(true);
    try {
      if (refKeys.hasPending()) {
        const saved = await refKeys.findSaved();
        if (saved?.action === 'alterar_serie') {
          refKeys.settled();
          setRefConfirm(null);
          success(doneText);
          return;
        }
      }
      const key = refKeys.keyFor(snapshot);
      try {
        await update.mutateAsync({ key, id: s.id, version, fromNumber: chosen.fromNumber, affected: plan.affected, input: chosen.edit });
        refKeys.settled();
        setRefConfirm(null);
        success(doneText);
      } catch (e) {
        setRefConfirm(null);
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
      setRefConfirm(null);
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
          // Partes sem conta registrada: as dos 11 meses fechados podem ser registradas aqui (como na revisão dos últimos
          // meses); as mais antigas só como gasto em Anotar gasto.
          const { reviewable, old } = annualGapSplit(s, y, today);
          const gapRows = annualGapRows(s, list, y, today);
          const registerLabel = k === 1 ? RETURN_TEXT.registerMonth : RETURN_TEXT.registerParts;
          const gapTitle = gapRows[0] ? `${gapRows[0].description} de ${label}` : label;
          const gapText = k === 1 && gapRows[0] ? RETURN_TEXT.seriesGap(gapRows[0].month) : RETURN_TEXT.annualGap(label, reviewable);
          // O ano inteiro fora dos 11 meses: sem linha para registrar, só o texto com "Anotar gasto".
          const oldText =
            k === 1 && y.missingParts[0] !== undefined
              ? RETURN_TEXT.seriesGapOld(seriesMonthOf(s, y.year.firstNumber + y.missingParts[0] - 1))
              : RETURN_TEXT.annualGapOld(label, y.missingParts);
          return (
            <Animated.View key={y.year.index} layout={rowLayout} style={[styles.year, i < years.length - 1 && styles.divider]}>
              <MoneyTxt
                variant="label"
                style={[{ fontFamily: fonts.bold, fontSize: 15 }, tabular]}
                accessibilityLabel={yearA11y(y.texts.line).replace(/ · /g, ', ')}>
                {y.texts.line}
              </MoneyTxt>
              {y.texts.paidBefore ? (
                <MoneyTxt variant="caption" color={colors.textSecondary} accessibilityLabel={yearA11yLabel(y.texts.paidBefore)}>
                  {y.texts.paidBefore}
                </MoneyTxt>
              ) : null}
              {y.texts.missing && gapRows.length > 0 ? (
                <View style={{ gap: space[1] }}>
                  <Txt variant="label" accessibilityLabel={yearA11yLabel(gapText)}>
                    {gapText}
                  </Txt>
                  <LinkButton
                    label={registerLabel}
                    accessibilityLabel={k === 1 ? `${registerLabel}: ${rowShortName(gapRows[0]!)}` : RETURN_TEXT.registerPartsA11y(yearA11y(label))}
                    style={styles.inlineLink}
                    onPress={() => setSheet({ rows: gapRows, title: gapTitle })}
                  />
                  {old.length > 0 ? (
                    <>
                      <Txt variant="label" accessibilityLabel={yearA11yLabel(RETURN_TEXT.annualGapOld(label, old))}>
                        {RETURN_TEXT.annualGapOld(label, old)}
                      </Txt>
                      <LinkButton label="Anotar gasto" style={styles.inlineLink} onPress={() => router.push('/registro/novo')} />
                    </>
                  ) : null}
                  <TopicLink slug="sem-registro" label={RETURN_TEXT.whyNoBill} style={styles.inlineLink} />
                </View>
              ) : y.texts.missing ? (
                // Todas as partes fora dos 11 meses fechados: o mesmo texto do caso misto (seriesGapOld ou annualGapOld),
                // com "Anotar gasto" e o tema "Por que este mês não tem conta?".
                <View style={{ gap: space[1] }}>
                  <Txt variant="label" accessibilityLabel={yearA11yLabel(oldText)}>
                    {oldText}
                  </Txt>
                  <LinkButton label="Anotar gasto" style={styles.inlineLink} onPress={() => router.push('/registro/novo')} />
                  <TopicLink slug="sem-registro" label={RETURN_TEXT.whyNoBill} style={styles.inlineLink} />
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
                      accessibilityLabel={`Informar o valor de ${yearA11y(label)}`}
                      tone="soft"
                      style={styles.action}
                      onPress={() => router.push({ pathname: '/gastos-fixos/[id]/informar', params: { id: s.id, numero: String(n) } })}
                    />
                  ) : null}
                  {remove?.ok ? (
                    <Button
                      label={k > 1 ? `Tirar as parcelas de ${label} em aberto` : `Não houve em ${label}`}
                      accessibilityLabel={k > 1 ? `Tirar as parcelas de ${yearA11y(label)} em aberto` : `Não houve em ${yearA11y(label)}`}
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
          <MoneyTxt variant="label" style={tabular} accessibilityLabel={yearA11yLabel(suggestion.text)}>
            {suggestion.text}
          </MoneyTxt>
          <Button
            label={maskMoneyText(suggestion.action, hidden)}
            accessibilityLabel={spokenText(suggestion.action, hidden)}
            tone="soft"
            busy={busy && refConfirm !== null}
            busyLabel="Salvando…"
            disabled={busy}
            onPress={askSuggestion}
          />
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
          <MoneyTxt color={colors.textSecondary} accessibilityLabel={yearA11yLabel(confirm.plan.text)}>
            {confirm.plan.text}
          </MoneyTxt>
          <Txt color={colors.textSecondary}>
            {k > 1 ? 'Os valores deixam' : 'O valor deixa'} de contar em Ainda a pagar. Recebido, Pago e a diferença do mês não mudam.
          </Txt>
        </ConfirmDialog>
      ) : null}

      {sheet ? (
        <RegisterMonthSheet
          rows={sheet.rows}
          title={sheet.title}
          onClose={() => setSheet(null)}
          onDone={(text) => {
            setSheet(null);
            onNotice(text);
          }}
        />
      ) : null}

      {refConfirm ? (
        <ConfirmDialog
          visible
          title={`${refConfirm.suggestion.action}?`}
          cancelLabel="Voltar"
          confirmLabel="Usar como referência"
          confirmTone="brand"
          busy={busy}
          onCancel={() => setRefConfirm(null)}
          onConfirm={applySuggestion}>
          <MoneyTxt accessibilityLabel={yearA11yLabel(refConfirm.plan.text)}>{refConfirm.plan.text}</MoneyTxt>
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
