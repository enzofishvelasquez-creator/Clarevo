import {
  ANNUAL_HELP_TEXT,
  ANNUAL_SERIES_ERROR_TEXT,
  CALC_UI_TEXT,
  DEBT_NATURES,
  ERROR_TEXT,
  NO_CATEGORY_LABEL,
  RETURN_TEXT,
  SERIES_ERROR_TEXT,
  SERIES_NATURE_LABEL,
  SUBSCRIPTION_TEXT,
  addMonths,
  affectedByDelete,
  cotaUnicaLink,
  currentTerm,
  custoPorAnoLink,
  formatBRL,
  formatDateBR,
  installmentProgress,
  isActiveSubscription,
  isRepoError,
  isReviewableMonth,
  mergeOccurrences,
  missingMonths,
  monthOf,
  projectSeries,
  quitarAntesLink,
  rowShortName,
  seriesCaption,
  seriesEnded,
  seriesGapsInRange,
  subscriptionYearlyCents,
  suggestedReference,
  termHistory,
  type Commitment,
  type CommitmentSeries,
  type IsoDate,
  type PlannedOccurrence,
  type ReviewRow,
} from '@clarevo/core';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { AlertCircle, CalendarSync, CalendarX, Calculator, Info, Pencil, Repeat, ShieldCheck, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { AnnualYears } from '@/components/annual-years';
import { openCalc } from '@/components/calc/open';
import { ChoiceDialog } from '@/components/choice-dialog';
import { CommitmentRow } from '@/components/commitment-row';
import { ConfirmDialog } from '@/components/dialog';
import { FlashBanner, useFlash } from '@/components/flash';
import { RegisterMonthSheet } from '@/components/retorno-folha';
import { ContextPill, SubHeader } from '@/components/header';
import { MoneyTxt } from '@/components/money-text';
import { estimateText, InstallmentBar, occurrenceMonthLabel, yearA11yLabel } from '@/components/series-parts';
import { ErrorState } from '@/components/states';
import { TopicLink } from '@/components/topic-link';
import { Banner, Button, Card, LinkButton, Screen, Skeleton, Txt } from '@/components/ui';
import { flash } from '@/lib/flash';
import { explanationHref } from '@/lib/learn';
import { moneyA11y, moneyText, useValuesHidden } from '@/lib/privacy';
import { useDeleteSeries, useSeries, useSeriesOccurrences, useSeriesOpenOccurrences, useSeriesOperationKey, useSpace } from '@/state/data';
import { useSession } from '@/state/session';
import { colors, fonts, space, tabular } from '@/theme/tokens';

const parcelas = (n: number) => (n === 1 ? '1 parcela' : `${n} parcelas`);

/** Detalhe do gasto fixo ou parcelamento: valores, contas criadas e previstas, pagas, meses sem conta e ações (4.3). */
export default function DetalheGastoFixo() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { today } = useSession();
  const personal = useSpace().data;
  const ctx = personal?.personalContextId;
  const series = useSeries(id, ctx);
  const occ = useSeriesOccurrences(id, ctx);
  const openOcc = useSeriesOpenOccurrences(id, ctx);
  const remove = useDeleteSeries();
  const keys = useSeriesOperationKey();
  const [notice, setNotice] = useFlash();
  const [confirmDelete, setConfirmDelete] = useState(false);
  /** Conta do ano: diálogo "Mudar a forma de pagamento?". */
  const [changeForm, setChangeForm] = useState(false);
  /** Exclusão em andamento, inclusive a conferência de uma tentativa anterior: Cancelar e Excluir ficam bloqueados. */
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const s = series.data;
  const annual = s?.kind === 'anual';
  const noun = s?.kind === 'parcelada' ? 'parcelamento' : annual ? 'conta do ano' : 'gasto fixo';
  /** Com artigo: "o gasto fixo", "o parcelamento", "a conta do ano". */
  const theNoun = `${annual ? 'a' : 'o'} ${noun}`;
  const texts: Record<keyof typeof SERIES_ERROR_TEXT, string> = annual ? ANNUAL_SERIES_ERROR_TEXT : SERIES_ERROR_TEXT;
  const occurrences = occ.data ? [...occ.data].reverse() : null; // número crescente, as 60 mais recentes
  // Todas as em aberto (o banco confere o conjunto inteiro), não só as que cabem na lista de 60.
  const allOccurrences = occ.data && openOcc.data ? mergeOccurrences(occ.data, openOcc.data).reverse() : null;
  const deletePlan = s && allOccurrences ? affectedByDelete(allOccurrences, s) : null;

  const doDelete = async () => {
    if (!s || !deletePlan || deleting) return;
    setActionError(null);
    if (!deletePlan.ok) {
      setConfirmDelete(false);
      setActionError(texts.serie_tem_pagamentos);
      return;
    }
    const snapshot = JSON.stringify([s.id, s.version, deletePlan.affected]);
    const done = () => {
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setConfirmDelete(false);
      flash.set(s.kind === 'parcelada' ? 'Parcelamento excluído.' : s.kind === 'anual' ? 'Conta do ano excluída.' : 'Gasto fixo excluído.');
      router.dismissTo('/gastos-fixos');
    };
    setDeleting(true);
    try {
      // Resultado incerto antes: a exclusão pode já ter acontecido.
      if (keys.hasPending()) {
        const saved = await keys.findSaved();
        if (saved?.action === 'excluir_serie') {
          keys.settled();
          done();
          return;
        }
      }
      const key = keys.keyFor(snapshot);
      try {
        await remove.mutateAsync({ key, id: s.id, version: s.version, affected: deletePlan.affected });
        keys.settled();
        done();
      } catch (e) {
        setConfirmDelete(false);
        if (isRepoError(e) && e.code !== 'rede' && e.code !== 'desconhecido') {
          keys.refused();
          setActionError(e.code in texts ? texts[e.code as keyof typeof SERIES_ERROR_TEXT] : texts.salvar_falhou);
          series.refetch();
          occ.refetch();
          openOcc.refetch();
          return;
        }
        keys.uncertain(key, snapshot);
        setActionError(`Não foi possível excluir ${theNoun}. Tente novamente.`);
      }
    } catch {
      setConfirmDelete(false);
      setActionError(`Não foi possível excluir ${theNoun}. Tente novamente.`);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SubHeader
        title={s?.kind === 'parcelada' ? 'Parcelamento' : s?.kind === 'anual' ? 'Conta do ano' : 'Gasto fixo'}
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/gastos-fixos'))}
        right={<ContextPill label="Pessoal" />}
      />
      <Screen>
        <View style={styles.body}>
          {series.isPending ? (
            <Card style={{ gap: space[3] }}>
              <Skeleton width="60%" height={28} />
              <Skeleton width="80%" height={20} />
              <Skeleton width="100%" height={120} />
            </Card>
          ) : series.isError ? (
            <ErrorState message={ERROR_TEXT.carregar_falhou} onRetry={() => series.refetch()} />
          ) : !s ? (
            <Card style={{ gap: space[3] }}>
              <Txt>{texts.nao_encontrado}</Txt>
              <Button label="Ir para Gastos fixos" onPress={() => router.replace('/gastos-fixos')} />
            </Card>
          ) : (
            <>
              <FlashBanner message={notice} />
              {actionError ? (
                <Banner tone="erro" icon={AlertCircle}>
                  <Txt variant="label" color={colors.error} accessibilityLabel={yearA11yLabel(actionError)}>
                    {actionError}
                  </Txt>
                </Banner>
              ) : null}

              <Overview series={s} today={today} />

              {occ.isPending || openOcc.isPending ? (
                <Card style={{ gap: space[3] }}>
                  <Skeleton width="50%" height={22} />
                  <Skeleton width="100%" height={56} />
                </Card>
              ) : occ.isError || openOcc.isError || !occurrences || !openOcc.data ? (
                <ErrorState
                  message={ERROR_TEXT.carregar_falhou}
                  onRetry={() => {
                    occ.refetch();
                    openOcc.refetch();
                  }}
                />
              ) : annual ? (
                <AnnualYears
                  series={s}
                  occurrences={occurrences}
                  open={openOcc.data}
                  today={today}
                  onNotice={(text) => {
                    setActionError(null);
                    setNotice(text);
                  }}
                  onError={(text) => {
                    setNotice(null);
                    setActionError(text);
                  }}
                  onRefused={() => {
                    series.refetch();
                    occ.refetch();
                    openOcc.refetch();
                  }}
                />
              ) : (
                <Occurrences
                  series={s}
                  occurrences={occurrences}
                  open={openOcc.data}
                  today={today}
                  onNotice={(text) => {
                    setActionError(null);
                    setNotice(text);
                  }}
                />
              )}

              <Txt variant="label" color={colors.textSecondary}>
                {annual
                  ? 'Contas pagas nunca mudam. Contas que você alterou, ou cujo valor informou só naquele ano, também não mudam quando você altera a conta do ano a partir de outro ano.'
                  : 'Contas pagas nunca mudam. Contas que você alterou só no mês delas também não mudam quando você altera o gasto fixo a partir de outro mês.'}
              </Txt>

              <Actions
                series={s}
                today={today}
                canDelete={s.paidCount === 0 && Boolean(deletePlan)}
                onDelete={() => setConfirmDelete(true)}
                onChangeForm={() => setChangeForm(true)}
              />

              <Pressable accessibilityRole="button" onPress={() => router.push('/quem-ve')} style={styles.privacy}>
                <ShieldCheck size={18} color={colors.textSecondary} />
                <Txt variant="label" color={colors.textSecondary}>
                  Quem vê estes dados?
                </Txt>
              </Pressable>

              <ConfirmDialog
                visible={confirmDelete}
                title={`Excluir ${theNoun} ${currentTerm(s, today).description}?`}
                cancelLabel="Cancelar"
                confirmLabel={`Excluir ${noun}`}
                busy={deleting || remove.isPending}
                onCancel={() => setConfirmDelete(false)}
                onConfirm={doDelete}>
                {deletePlan?.ok && deletePlan.text ? <MoneyTxt style={{ fontFamily: fonts.bold }}>{deletePlan.text}</MoneyTxt> : null}
                <Txt color={colors.textSecondary}>Prefere só parar de repetir? Use Encerrar.</Txt>
              </ConfirmDialog>

              {annual ? (
                <ChoiceDialog
                  visible={changeForm}
                  title="Mudar a forma de pagamento?"
                  cancelLabel="Voltar"
                  onCancel={() => setChangeForm(false)}
                  choices={[
                    {
                      label: 'Encerrar e cadastrar nova',
                      tone: 'brand',
                      onPress: () => {
                        setChangeForm(false);
                        router.push({ pathname: '/gastos-fixos/[id]/encerrar', params: { id: s.id, depois: 'nova' } });
                      },
                    },
                  ]}>
                  <Txt color={colors.textSecondary}>
                    Para passar de cota única para parcelas, mudar o número de parcelas ou o mês, encerre esta conta do ano no último ano com a
                    forma atual e cadastre uma nova. O histórico continua aqui.
                  </Txt>
                </ChoiceDialog>
              ) : null}
            </>
          )}
        </View>
      </Screen>
    </View>
  );
}

/** Cabeçalho do gasto fixo: período, valor atual, histórico de valores e, no parcelamento, o progresso. */
function Overview({ series: s, today }: { series: CommitmentSeries; today: IsoDate }) {
  const term = currentTerm(s, today);
  const variable = term.amountMode === 'variavel';
  const history = termHistory(s);
  const annual = s.kind === 'anual';
  const k = s.partsPerYear ?? 1;
  // Conta do ano: "Valor muda: referência de R$ 180,00 por parcela (estimado) · cerca de R$ 1.800,00 por ano".
  const perYear = annual && k > 1 ? ` · ${variable ? 'cerca de ' : ''}${formatBRL(k * term.amountCents)} por ano` : '';
  const value = annual
    ? variable
      ? `Valor muda: referência de ${formatBRL(term.amountCents)}${k > 1 ? ' por parcela' : ''} (estimado)${perYear}`
      : `${formatBRL(term.amountCents)} ${k > 1 ? 'por parcela' : 'por ano'}${perYear}`
    : variable
      ? `Valor muda: referência de ${formatBRL(term.amountCents)} (estimado)`
      : `${formatBRL(term.amountCents)} ${s.kind === 'parcelada' ? 'por parcela' : 'por mês'}`;
  return (
    <>
      <Card style={{ gap: space[3] }}>
        <Txt variant="title" style={{ fontSize: 24, lineHeight: 32 }} accessibilityRole="header" aria-level={2}>
          {term.description}
        </Txt>
        <Txt variant="label" color={colors.textSecondary}>
          {seriesCaption(s, today)}
        </Txt>
        <MoneyTxt variant="title" style={tabular}>
          {value}
        </MoneyTxt>
        {/* Assinatura (D-046): quanto custa por ano e a data da última revisão. Só informa, e só enquanto está ativa (não encerrada). */}
        {isActiveSubscription(s, today) ? (
          <View style={{ gap: 2 }}>
            <MoneyTxt variant="label" style={[tabular, { fontFamily: fonts.bold }]}>
              {SUBSCRIPTION_TEXT.detailYear(subscriptionYearlyCents(term.amountCents), variable)}
            </MoneyTxt>
            <Txt variant="caption" color={colors.textSecondary}>
              {SUBSCRIPTION_TEXT.lastReview(s.subscriptionReviewedOn)}
            </Txt>
          </View>
        ) : null}
        <CalcLink series={s} today={today} />
        {annual ? (
          <>
            <Txt variant="label" color={colors.textSecondary}>
              Cada ano entra em Contas a pagar dois meses antes do primeiro vencimento e só entra em Ainda a pagar no mês em que vence.
            </Txt>
            <Txt variant="label" color={colors.textSecondary}>
              {ANNUAL_HELP_TEXT.detailHowItWorks}
            </Txt>
            <TopicLink slug="contas-do-ano" label={ANNUAL_HELP_TEXT.whatIsThis} style={styles.inlineLink} />
          </>
        ) : null}
        <View>
          <Row label="Contexto" value="Pessoal" />
          {s.kind === 'parcelada' ? <Row label="Tipo" value={SERIES_NATURE_LABEL[s.nature]} /> : null}
          <Row label="Categoria" value={term.category ?? NO_CATEGORY_LABEL} last />
        </View>
        {!s.generating ? (
          <Banner tone="info" icon={Info}>
            <Txt variant="label">
              {annual
                ? 'Esta conta do ano parou de criar contas porque quem a criou não pode mais anotar neste espaço.'
                : 'Este gasto fixo parou de criar contas porque quem o criou não pode mais anotar neste espaço.'}
            </Txt>
          </Banner>
        ) : null}
      </Card>

      {history.length > 0 ? (
        <Card style={{ gap: space[2] }}>
          <Txt variant="title" accessibilityRole="header" aria-level={2}>
            Histórico de valores
          </Txt>
          {history.map((h) => (
            <MoneyTxt key={`${h.term.fromNumber}`} variant="label" style={tabular}>
              {h.text}
            </MoneyTxt>
          ))}
        </Card>
      ) : null}
    </>
  );
}

/**
 * Calculadora na hora da decisão (D-034): conta do ano, "Cota única ou parcelado? Fazer a conta" (parcelas e valor de
 * referência, ou o valor da cota única); gasto fixo mensal, "Quanto custa por ano?" (valor por mês). Nada é gravado.
 */
function CalcLink({ series: s, today }: { series: CommitmentSeries; today: IsoDate }) {
  if (seriesEnded(s, today)) return null;
  const annual = cotaUnicaLink(s, today);
  if (annual) {
    return (
      <LinkButton label={CALC_UI_TEXT.links.cotaUnica} icon={Calculator} style={styles.inlineLink} onPress={() => openCalc('parcelado-ou-a-vista', annual)} />
    );
  }
  const monthly = custoPorAnoLink(s, today);
  if (monthly) {
    return <LinkButton label={CALC_UI_TEXT.links.custoAno} icon={Calculator} style={styles.inlineLink} onPress={() => openCalc('custo-por-ano', monthly)} />;
  }
  return null;
}

/** Progresso, próximas contas (criadas e previstas), pagas, meses sem conta e sugestão de referência. */
function Occurrences({
  series: s,
  occurrences,
  open: allOpen,
  today,
  onNotice,
}: {
  series: CommitmentSeries;
  /** As 60 mais recentes (abertas e pagas), por número crescente. */
  occurrences: Commitment[];
  /** Todas as em aberto, sem limite (useSeriesOpenOccurrences). */
  open: readonly Commitment[];
  today: IsoDate;
  /** Resultado confirmado de "Registrar este mês". */
  onNotice: (text: string) => void;
}) {
  /** Linha da revisão aberta na folha "Registrar este mês" (D-030). */
  const [sheet, setSheet] = useState<ReviewRow | null>(null);
  const currentMonth = monthOf(today);
  const ended = seriesEnded(s, today);
  const open = occurrences.filter((c) => c.status === 'aberto');
  const paid = occurrences.filter((c) => c.status === 'quitado').reverse().slice(0, 12);
  const projected = ended ? [] : projectSeries(s, occurrences, currentMonth, addMonths(currentMonth, 24)).slice(0, 6);
  const missing = missingMonths(s, occurrences, today);
  const variable = currentTerm(s, today).amountMode === 'variavel';
  const suggestion = variable ? suggestedReference(occurrences) : null;
  // "Usar como novo valor de referência" = esta e as próximas a partir da primeira conta em aberto (ou da próxima prevista).
  const applyFrom = open[0]?.series?.number ?? projected[0]?.number ?? null;
  const progress = s.kind === 'parcelada' ? installmentProgress(s, occurrences, allOpen, today) : null;
  // "Quanto economizo se quitar antes?": financiamento ou compra parcelada com parcelas em aberto, com os prazos de cada
  // vencimento que falta (mesmas listas do progresso). Nunca para imposto, taxa ou outro parcelamento.
  const payoff = s.kind === 'parcelada' ? quitarAntesLink(s, occurrences, allOpen, today) : null;

  return (
    <>
      {progress && progress.total !== null ? (
        <Card style={{ gap: space[3] }}>
          <Txt variant="title" accessibilityRole="header" aria-level={2}>
            Parcelas
          </Txt>
          <Txt variant="label" style={tabular}>
            Pagas antes do Clarevo: {progress.paidBefore} (informado por você) · Pagas no Clarevo: {progress.paidInApp}
            {missing.length > 0 ? ` · ${RETURN_TEXT.progressGaps(missing.length)}` : ''}
            {progress.remaining !== null ? ` · ${progress.remaining === 1 ? 'Falta 1' : `Faltam ${progress.remaining}`}` : ''}
          </Txt>
          <InstallmentBar paid={progress.paidBefore + progress.paidInApp} total={progress.total} />
          {progress.lastDueOn ? <Txt variant="label">Última parcela em {formatDateBR(progress.lastDueOn)}</Txt> : null}
          {progress.remainingCents !== null && progress.remaining ? (
            <MoneyTxt variant="label" style={tabular}>
              {`Soma das ${parcelas(progress.remaining)} que faltam: ${progress.approximate ? 'cerca de ' : ''}${formatBRL(progress.remainingCents)}. Não é o valor para quitar.`}
            </MoneyTxt>
          ) : null}
          {DEBT_NATURES.includes(s.nature) ? (
            <View style={{ gap: space[1] }}>
              <Txt variant="label" color={colors.textSecondary}>
                Quitar antes do prazo dá direito a desconto proporcional dos juros.
              </Txt>
              {payoff ? (
                <LinkButton
                  label={CALC_UI_TEXT.links.quitar}
                  icon={Calculator}
                  style={styles.inlineLink}
                  onPress={() => openCalc('quitar-antes', payoff)}
                />
              ) : null}
              <LinkButton label="Quitar antes do prazo" style={styles.inlineLink} onPress={() => router.push(explanationHref('quitar-antes'))} />
              <TopicLink slug="amortizacao-price-sac" label="Quanto das parcelas é juros?" style={styles.inlineLink} />
            </View>
          ) : null}
        </Card>
      ) : null}

      <Card>
        <Txt variant="title" accessibilityRole="header" aria-level={2}>
          Próximas contas
        </Txt>
        {open.length === 0 && projected.length === 0 ? (
          <Txt variant="label" color={colors.textSecondary} style={{ paddingVertical: space[2] }}>
            Nenhuma conta em aberto.
          </Txt>
        ) : null}
        {open.map((c, i) => (
          <CommitmentRow
            key={c.id}
            commitment={c}
            today={today}
            last={i === open.length - 1 && projected.length === 0}
            onPress={() => router.push(`/a-pagar/${c.id}`)}
          />
        ))}
        {projected.length > 0 ? (
          <Txt variant="caption" color={colors.textSecondary} style={{ paddingTop: space[2] }}>
            As previstas ainda não são contas a pagar: aparecem em Contas a pagar um mês antes de vencer e não entram em nenhum total.
          </Txt>
        ) : null}
        {projected.map((p, i) => (
          <ProjectedRow key={p.number} planned={p} last={i === projected.length - 1} />
        ))}
      </Card>

      {paid.length > 0 ? (
        <Card>
          <Txt variant="title" accessibilityRole="header" aria-level={2}>
            Pagas
          </Txt>
          {paid.map((c, i) => (
            <PaidRow key={c.id} commitment={c} today={today} last={i === paid.length - 1} />
          ))}
          <LinkButton label="Ver em Movimentações" style={styles.inlineLink} onPress={() => router.navigate('/movimentacoes')} />
        </Card>
      ) : null}

      {missing.length > 0 ? (
        <Card style={{ gap: space[2] }}>
          <Txt variant="title" accessibilityRole="header" aria-level={2}>
            Meses sem conta registrada
          </Txt>
          {/*
            Nos 11 meses fechados anteriores ao atual, "Registrar este mês" (ou "esta parcela") abre a linha da revisão dos
            últimos meses numa folha (D-030); meses mais antigos só podem ser anotados como gasto.
          */}
          {missing.map((m) => {
            const row = isReviewableMonth(m.month, today) ? gapRowOf(s, occurrences, m) : null;
            if (row) {
              const label = s.kind === 'parcelada' ? RETURN_TEXT.registerInstallment : RETURN_TEXT.registerMonth;
              return (
                <View key={m.number} style={styles.gapRow}>
                  <Txt variant="label">{RETURN_TEXT.seriesGap(m.month)}</Txt>
                  <LinkButton label={label} accessibilityLabel={`${label}: ${rowShortName(row)}`} style={styles.inlineLink} onPress={() => setSheet(row)} />
                </View>
              );
            }
            return (
              <Txt key={m.number} variant="label">
                {m.month < monthOf(today) ? RETURN_TEXT.seriesGapOld(m.month) : RETURN_TEXT.seriesGap(m.month)}
              </Txt>
            );
          })}
          {missing.some((m) => m.month < monthOf(today) && !isReviewableMonth(m.month, today)) ? (
            <LinkButton label="Anotar gasto" style={styles.inlineLink} onPress={() => router.push('/registro/novo')} />
          ) : null}
          <TopicLink slug="sem-registro" label={RETURN_TEXT.whyNoBill} style={styles.inlineLink} />
        </Card>
      ) : null}

      {sheet ? (
        <RegisterMonthSheet
          rows={[sheet]}
          onClose={() => setSheet(null)}
          onDone={(text) => {
            setSheet(null);
            onNotice(text);
          }}
        />
      ) : null}

      {suggestion && !ended ? (
        <Card style={{ gap: space[2] }}>
          <MoneyTxt variant="label" style={tabular}>
            {suggestion.count === 1
              ? `Valor da última conta paga: ${formatBRL(suggestion.amountCents)}.`
              : `Média das últimas ${suggestion.count} contas pagas: ${formatBRL(suggestion.amountCents)}.`}
          </MoneyTxt>
          {applyFrom !== null ? (
            <Button
              label="Usar como novo valor de referência"
              tone="soft"
              onPress={() => router.push(`/gastos-fixos/${s.id}/editar?a-partir=${applyFrom}&valor=${suggestion.amountCents}`)}
            />
          ) : null}
          <LinkButton label="Contas que mudam de valor" style={styles.inlineLink} onPress={() => router.push(explanationHref('estimativa'))} />
        </Card>
      ) : null}
    </>
  );
}

/** Linha "sem conta registrada" do número, com a vigência dele (seriesGapsInRange no mês do número). */
function gapRowOf(s: CommitmentSeries, occurrences: readonly Commitment[], m: { number: number; month: string }): ReviewRow | null {
  return seriesGapsInRange(s, occurrences, m.month, m.month).find((r) => r.series?.number === m.number) ?? null;
}

function Actions({
  series: s,
  today,
  canDelete,
  onDelete,
  onChangeForm,
}: {
  series: CommitmentSeries;
  today: IsoDate;
  canDelete: boolean;
  onDelete: () => void;
  /** Conta do ano: "Mudar a forma de pagamento". */
  onChangeForm: () => void;
}) {
  const parcelada = s.kind === 'parcelada';
  const ended = seriesEnded(s, today);
  if (s.kind === 'anual') {
    return (
      <View style={{ gap: space[3] }}>
        {!ended ? (
          <>
            <View style={{ gap: space[1] }}>
              <Button
                label="Mudar valor ou dia a partir de uma conta"
                icon={Pencil}
                tone="soft"
                accessibilityHint="O mês do vencimento não muda aqui."
                onPress={() => router.push(`/gastos-fixos/${s.id}/editar`)}
              />
              <Txt variant="caption" color={colors.textSecondary}>
                O mês do vencimento não muda aqui.
              </Txt>
            </View>
            <Button label="Mudar a forma de pagamento" icon={CalendarSync} tone="soft" onPress={onChangeForm} />
            <Button label="Encerrar conta do ano" icon={CalendarX} tone="soft" onPress={() => router.push(`/gastos-fixos/${s.id}/encerrar`)} />
          </>
        ) : (
          <Button label="Voltar a repetir" icon={Repeat} tone="soft" onPress={() => router.push(`/gastos-fixos/${s.id}/encerrar`)} />
        )}
        {canDelete ? <Button label="Excluir conta do ano" icon={Trash2} tone="danger" onPress={onDelete} /> : null}
      </View>
    );
  }
  // Parcelamento encerrado só retoma se ainda houver parcelas até o total.
  const canResume = ended && (!parcelada || (s.lastNumber ?? 0) < (s.installmentTotal ?? 0));
  return (
    <View style={{ gap: space[3] }}>
      {!ended ? (
        <>
          <Button label="Mudar valor ou dia a partir de uma conta" icon={Pencil} tone="soft" onPress={() => router.push(`/gastos-fixos/${s.id}/editar`)} />
          <Button
            label={parcelada ? 'Encerrar parcelamento' : 'Encerrar gasto fixo'}
            icon={CalendarX}
            tone="soft"
            onPress={() => router.push(`/gastos-fixos/${s.id}/encerrar`)}
          />
        </>
      ) : canResume ? (
        <Button
          label={parcelada ? 'Retomar parcelas' : 'Voltar a repetir'}
          icon={Repeat}
          tone="soft"
          onPress={() => router.push(`/gastos-fixos/${s.id}/encerrar`)}
        />
      ) : null}
      {canDelete ? <Button label={parcelada ? 'Excluir parcelamento' : 'Excluir gasto fixo'} icon={Trash2} tone="danger" onPress={onDelete} /> : null}
    </View>
  );
}

/** Conta prevista: ainda não existe, não é tocável e não entra em total. */
function ProjectedRow({ planned: p, last }: { planned: PlannedOccurrence; last: boolean }) {
  const hidden = useValuesHidden();
  const amount = estimateText(p.amountCents, p.amountIsEstimate, hidden);
  const label = `${p.description}, prevista, vence em ${formatDateBR(p.dueOn)}, ${amount.a11y}${p.amountIsEstimate ? ', valor estimado' : ''}`;
  return (
    <View style={[styles.row, !last && styles.divider]} accessible accessibilityLabel={label}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant="label" style={{ fontFamily: fonts.bold, fontSize: 15 }}>
          {p.description}
        </Txt>
        <Txt variant="caption" color={colors.textSecondary}>
          Prevista · vence em {formatDateBR(p.dueOn)}
          {p.amountIsEstimate ? ' · estimado' : ''}
        </Txt>
      </View>
      <Txt variant="label" style={[styles.amount, tabular]}>
        {amount.text}
      </Txt>
    </View>
  );
}

/** "Outubro · paga em 05/10/2026 · R$ 2.500,00" (parcelamento: com o número da parcela). Abre a conta. */
function PaidRow({ commitment: c, today, last }: { commitment: Commitment; today: IsoDate; last: boolean }) {
  const month = occurrenceMonthLabel(c.dueOn, today);
  const hidden = useValuesHidden();
  const number = c.series?.kind === 'parcelada' ? `Parcela ${c.series.number} · ` : '';
  const cents = c.payment?.amountCents ?? c.amountCents;
  const amount = moneyText(cents, hidden);
  const paidOn = c.payment ? formatDateBR(c.payment.paidOn) : '';
  return (
    <Pressable
      onPress={() => router.push(`/a-pagar/${c.id}`)}
      accessibilityRole="button"
      accessibilityLabel={`${number}${month}, paga em ${paidOn}, ${moneyA11y(cents, hidden)}`}
      accessibilityHint="Abre a conta a pagar"
      style={(st) => [
        styles.row,
        !last && styles.divider,
        st.pressed && { opacity: 0.7 },
        (st as { focused?: boolean }).focused && { outlineWidth: 3, outlineColor: colors.brand, outlineStyle: 'solid' },
      ]}>
      <Txt variant="label" style={[{ flex: 1 }, tabular]}>
        {number}
        {month} · paga em {paidOn} · {amount}
      </Txt>
    </Pressable>
  );
}

function Row({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.infoRow, !last && { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
      <Txt variant="label" color={colors.textSecondary}>
        {label}
      </Txt>
      <Txt variant="label" style={{ fontFamily: fonts.bold, flexShrink: 1, textAlign: 'right' }}>
        {value}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: space[5], gap: space[3] },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: space[3], minHeight: 56 },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  amount: { fontFamily: fonts.bold, fontSize: 15, flexShrink: 0 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', gap: space[4], paddingVertical: space[3], minHeight: 44, alignItems: 'center' },
  inlineLink: { alignSelf: 'flex-start', paddingHorizontal: 0 },
  gapRow: { gap: 2 },
  privacy: { flexDirection: 'row', alignSelf: 'center', alignItems: 'center', gap: space[2], minHeight: 44 },
});
