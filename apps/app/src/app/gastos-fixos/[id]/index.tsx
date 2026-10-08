import {
  DEBT_NATURES,
  ERROR_TEXT,
  NO_CATEGORY_LABEL,
  SERIES_ERROR_TEXT,
  SERIES_NATURE_LABEL,
  addMonths,
  affectedByDelete,
  currentTerm,
  formatBRL,
  formatDateBR,
  formatMonthBR,
  installmentProgress,
  isRepoError,
  missingMonths,
  monthOf,
  projectSeries,
  seriesCaption,
  seriesEnded,
  suggestedReference,
  termHistory,
  type Commitment,
  type CommitmentSeries,
  type IsoDate,
  type PlannedOccurrence,
} from '@clarevo/core';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { AlertCircle, CalendarX, Info, Pencil, Repeat, ShieldCheck, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { CommitmentRow } from '@/components/commitment-row';
import { ConfirmDialog } from '@/components/dialog';
import { FlashBanner, useFlash } from '@/components/flash';
import { ContextPill, SubHeader } from '@/components/header';
import { estimateText, InstallmentBar, occurrenceMonthLabel } from '@/components/series-parts';
import { ErrorState } from '@/components/states';
import { Banner, Button, Card, LinkButton, Screen, Skeleton, Txt } from '@/components/ui';
import { flash } from '@/lib/flash';
import { useDeleteSeries, useSeries, useSeriesOccurrences, useSeriesOperationKey, useSpace } from '@/state/data';
import { useSession } from '@/state/session';
import { colors, fonts, radius, space, tabular } from '@/theme/tokens';

const parcelas = (n: number) => (n === 1 ? '1 parcela' : `${n} parcelas`);

/** Detalhe do gasto fixo ou parcelamento: valores, contas criadas e previstas, pagas, meses sem conta e ações (4.3). */
export default function DetalheGastoFixo() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { today } = useSession();
  const personal = useSpace().data;
  const ctx = personal?.personalContextId;
  const series = useSeries(id, ctx);
  const occ = useSeriesOccurrences(id, ctx);
  const remove = useDeleteSeries();
  const keys = useSeriesOperationKey();
  const [notice] = useFlash();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const s = series.data;
  const noun = s?.kind === 'parcelada' ? 'parcelamento' : 'gasto fixo';
  const occurrences = occ.data ? [...occ.data].reverse() : null; // número crescente
  const deletePlan = s && occurrences ? affectedByDelete(occurrences, s) : null;

  const doDelete = async () => {
    if (!s || !deletePlan) return;
    setActionError(null);
    if (!deletePlan.ok) {
      setConfirmDelete(false);
      setActionError(SERIES_ERROR_TEXT.serie_tem_pagamentos);
      return;
    }
    const snapshot = JSON.stringify([s.id, s.version, deletePlan.affected]);
    const done = () => {
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setConfirmDelete(false);
      flash.set(s.kind === 'parcelada' ? 'Parcelamento excluído.' : 'Gasto fixo excluído.');
      router.dismissTo('/gastos-fixos');
    };
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
          setActionError(e.code in SERIES_ERROR_TEXT ? SERIES_ERROR_TEXT[e.code as keyof typeof SERIES_ERROR_TEXT] : SERIES_ERROR_TEXT.salvar_falhou);
          series.refetch();
          occ.refetch();
          return;
        }
        keys.uncertain(key, snapshot);
        setActionError(`Não foi possível excluir o ${noun}. Tente novamente.`);
      }
    } catch {
      setConfirmDelete(false);
      setActionError(`Não foi possível excluir o ${noun}. Tente novamente.`);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SubHeader
        title={s?.kind === 'parcelada' ? 'Parcelamento' : 'Gasto fixo'}
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
              <Txt>{SERIES_ERROR_TEXT.nao_encontrado}</Txt>
              <Button label="Ir para Gastos fixos" onPress={() => router.replace('/gastos-fixos')} />
            </Card>
          ) : (
            <>
              <FlashBanner message={notice} />
              {actionError ? (
                <Banner tone="erro" icon={AlertCircle}>
                  <Txt variant="label" color={colors.error}>
                    {actionError}
                  </Txt>
                </Banner>
              ) : null}

              <Overview series={s} today={today} />

              {occ.isPending ? (
                <Card style={{ gap: space[3] }}>
                  <Skeleton width="50%" height={22} />
                  <Skeleton width="100%" height={56} />
                </Card>
              ) : occ.isError || !occurrences ? (
                <ErrorState message={ERROR_TEXT.carregar_falhou} onRetry={() => occ.refetch()} />
              ) : (
                <Occurrences series={s} occurrences={occurrences} today={today} />
              )}

              <Txt variant="label" color={colors.textSecondary}>
                Contas pagas nunca mudam. Contas que você alterou só no mês delas também não mudam quando você altera o gasto fixo a partir de
                outro mês.
              </Txt>

              <Actions series={s} today={today} canDelete={s.paidCount === 0 && Boolean(deletePlan)} onDelete={() => setConfirmDelete(true)} />

              <Pressable accessibilityRole="button" onPress={() => router.push('/quem-ve')} style={styles.privacy}>
                <ShieldCheck size={18} color={colors.textSecondary} />
                <Txt variant="label" color={colors.textSecondary}>
                  Quem vê estes dados?
                </Txt>
              </Pressable>

              <ConfirmDialog
                visible={confirmDelete}
                title={`Excluir o ${noun} ${currentTerm(s, today).description}?`}
                cancelLabel="Cancelar"
                confirmLabel={`Excluir ${noun}`}
                busy={remove.isPending}
                onCancel={() => setConfirmDelete(false)}
                onConfirm={doDelete}>
                {deletePlan?.ok && deletePlan.text ? <Txt style={{ fontFamily: fonts.bold }}>{deletePlan.text}</Txt> : null}
                <Txt color={colors.textSecondary}>Prefere só parar de repetir? Use Encerrar.</Txt>
              </ConfirmDialog>
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
  const value = variable
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
        <Txt variant="title" style={tabular}>
          {value}
        </Txt>
        <View>
          <Row label="Contexto" value="Pessoal" />
          {s.kind === 'parcelada' ? <Row label="Tipo" value={SERIES_NATURE_LABEL[s.nature]} /> : null}
          <Row label="Categoria" value={term.category ?? NO_CATEGORY_LABEL} last />
        </View>
        {!s.generating ? (
          <Banner tone="info" icon={Info}>
            <Txt variant="label">Este gasto fixo parou de criar contas porque quem o criou não pode mais anotar neste espaço.</Txt>
          </Banner>
        ) : null}
      </Card>

      {history.length > 0 ? (
        <Card style={{ gap: space[2] }}>
          <Txt variant="title" accessibilityRole="header" aria-level={2}>
            Histórico de valores
          </Txt>
          {history.map((h) => (
            <Txt key={`${h.term.fromNumber}`} variant="label" style={tabular}>
              {h.text}
            </Txt>
          ))}
        </Card>
      ) : null}
    </>
  );
}

/** Progresso, próximas contas (criadas e previstas), pagas, meses sem conta e sugestão de referência. */
function Occurrences({ series: s, occurrences, today }: { series: CommitmentSeries; occurrences: Commitment[]; today: IsoDate }) {
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
  const progress = s.kind === 'parcelada' ? installmentProgress(s, occurrences, today) : null;

  return (
    <>
      {progress && progress.total !== null ? (
        <Card style={{ gap: space[3] }}>
          <Txt variant="title" accessibilityRole="header" aria-level={2}>
            Parcelas
          </Txt>
          <Txt variant="label" style={tabular}>
            Pagas antes do Clarevo: {progress.paidBefore} (informado por você) · Pagas no Clarevo: {progress.paidInApp}
            {progress.remaining !== null ? ` · ${progress.remaining === 1 ? 'Falta 1' : `Faltam ${progress.remaining}`}` : ''}
          </Txt>
          <InstallmentBar paid={progress.paidBefore + progress.paidInApp} total={progress.total} />
          {progress.lastDueOn ? <Txt variant="label">Última parcela em {formatDateBR(progress.lastDueOn)}</Txt> : null}
          {progress.remainingCents !== null && progress.remaining ? (
            <Txt variant="label" style={tabular}>
              Soma das {parcelas(progress.remaining)} que faltam: {progress.approximate ? 'cerca de ' : ''}
              {formatBRL(progress.remainingCents)}. Não é o valor para quitar.
            </Txt>
          ) : null}
          {DEBT_NATURES.includes(s.nature) ? (
            <View style={{ gap: space[1] }}>
              <Txt variant="label" color={colors.textSecondary}>
                Quitar antes do prazo dá direito a desconto proporcional dos juros.
              </Txt>
              <LinkButton label="Quitar antes do prazo" style={styles.inlineLink} onPress={() => router.push('/explicacao/quitar-antes')} />
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
          {missing.map((m) => (
            <Txt key={m.number} variant="label">
              {formatMonthBR(m.month)}: sem conta registrada.
            </Txt>
          ))}
          <Txt variant="label" color={colors.textSecondary}>
            Se você pagou, anote o gasto em Anotar gasto.
          </Txt>
          <LinkButton label="Anotar gasto" style={styles.inlineLink} onPress={() => router.push('/registro/novo')} />
        </Card>
      ) : null}

      {suggestion && !ended ? (
        <Card style={{ gap: space[2] }}>
          <Txt variant="label" style={tabular}>
            {suggestion.count === 1
              ? `Valor da última conta paga: ${formatBRL(suggestion.amountCents)}.`
              : `Média das últimas ${suggestion.count} contas pagas: ${formatBRL(suggestion.amountCents)}.`}
          </Txt>
          {applyFrom !== null ? (
            <Button
              label="Usar como novo valor de referência"
              tone="soft"
              onPress={() => router.push(`/gastos-fixos/${s.id}/editar?a-partir=${applyFrom}&valor=${suggestion.amountCents}`)}
            />
          ) : null}
          <LinkButton label="Contas que mudam de valor" style={styles.inlineLink} onPress={() => router.push('/explicacao/estimativa')} />
        </Card>
      ) : null}
    </>
  );
}

function Actions({ series: s, today, canDelete, onDelete }: { series: CommitmentSeries; today: IsoDate; canDelete: boolean; onDelete: () => void }) {
  const parcelada = s.kind === 'parcelada';
  const ended = seriesEnded(s, today);
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
  const amount = estimateText(p.amountCents, p.amountIsEstimate);
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
  const number = c.series?.kind === 'parcelada' ? `Parcela ${c.series.number} · ` : '';
  const amount = formatBRL(c.payment?.amountCents ?? c.amountCents);
  const paidOn = c.payment ? formatDateBR(c.payment.paidOn) : '';
  return (
    <Pressable
      onPress={() => router.push(`/a-pagar/${c.id}`)}
      accessibilityRole="button"
      accessibilityLabel={`${number}${month}, paga em ${paidOn}, ${amount}`}
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
  privacy: { flexDirection: 'row', alignSelf: 'center', alignItems: 'center', gap: space[2], minHeight: 44 },
  badge: { borderRadius: radius.sm },
});
