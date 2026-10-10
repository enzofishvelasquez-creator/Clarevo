import {
  CARDS_TEXT,
  COMMITMENT_ERROR_TEXT,
  ERROR_TEXT,
  affectedByYear,
  annualYearErrorText,
  formatBRL,
  formatDateBR,
  formatMonthBR,
  formatMonthName,
  annualYearLabelOf,
  groupAnnualLater,
  isRepoError,
  monthOf,
  newOperationKey,
  occurrenceLabel,
  type AnnualGroup,
  type Commitment,
  type FinancialRecord,
  type IsoDate,
  type PaymentInput,
} from '@clarevo/core';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { AlertCircle, Check, ListChecks } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Animated, { FadeOut, LinearTransition, ReduceMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChoiceDialog } from '@/components/choice-dialog';
import { ConfirmDialog } from '@/components/dialog';
import { FlashBanner, useFlash } from '@/components/flash';
import { ContextPill, SubHeader } from '@/components/header';
import { MoneyTxt } from '@/components/money-text';
import { CheckOption, yearA11y, yearA11yLabel } from '@/components/series-parts';
import { EmptyState, ErrorState } from '@/components/states';
import { TopicLink } from '@/components/topic-link';
import { Banner, Button, Card, Chip, Screen, Skeleton, Txt } from '@/components/ui';
import { openCommitment } from '@/lib/cards';
import { totalChange } from '@/lib/highlight';
import { moneyA11y, moneyText, useValuesHidden } from '@/lib/privacy';
import { useCommitments, useDeleteCommitment, usePayCommitment, useSeriesList, useSkipSeriesYear, useSpace, useUpdateRecord } from '@/state/data';
import { useRepo, useSession } from '@/state/session';
import { colors, fonts, motion, space, tabular } from '@/theme/tokens';

// Linhas resolvidas saem devagar (CL-V008), só depois da resposta do servidor.
const rowExit = FadeOut.duration(motion.detail).reduceMotion(ReduceMotion.System);
const rowLayout = LinearTransition.duration(motion.detail).reduceMotion(ReduceMotion.System);

/** "Aluguel de fevereiro"; em outro ano, "Aluguel de fevereiro de 2027". Conta do ano: "IPVA de 2027" ou "IPTU, parcela 3 de 2027". */
function billName(c: Commitment, today: IsoDate): string {
  if (c.series?.kind === 'anual') {
    const k = c.series.partsPerYear ?? 1;
    const label = annualYearLabelOf(c)!;
    return k === 1 ? `${c.description} de ${label}` : `${c.description}, parcela ${((c.series.number - 1) % k) + 1} de ${label}`;
  }
  const year = c.dueOn.slice(0, 4);
  return `${c.description} de ${formatMonthName(monthOf(c.dueOn))}${year === today.slice(0, 4) ? '' : ` de ${year}`}`;
}

/** "fevereiro" ou "fevereiro de 2027"; conta do ano, "2027" ou "parcela 3 de 2027". */
function monthWord(c: Commitment, today: IsoDate): string {
  if (c.series?.kind === 'anual') {
    const k = c.series.partsPerYear ?? 1;
    const label = annualYearLabelOf(c)!;
    return k === 1 ? label : `parcela ${((c.series.number - 1) % k) + 1} de ${label}`;
  }
  const year = c.dueOn.slice(0, 4);
  return `${formatMonthName(monthOf(c.dueOn))}${year === today.slice(0, 4) ? '' : ` de ${year}`}`;
}

const isUncertain = (e: unknown) => !isRepoError(e) || e.code === 'rede' || e.code === 'desconhecido';

/** Motivo curto de uma recusa, depois do nome da conta: "Aluguel de março: a conta mudou em outro aparelho." */
function payReason(e: unknown): string {
  if (isRepoError(e, 'versao_desatualizada')) return 'a conta mudou em outro aparelho.';
  if (isRepoError(e, 'compromisso_quitado')) return 'a conta já foi marcada como paga em outro aparelho.';
  if (isRepoError(e, 'nao_encontrado')) return 'a conta não está mais disponível.';
  if (isRepoError(e, 'sem_permissao')) return 'você não tem permissão para esta ação.';
  if (!isUncertain(e)) return 'não foi possível registrar o pagamento.';
  return 'não foi possível confirmar o pagamento. Tente novamente.';
}

const contas = (n: number) => (n === 1 ? '1 conta' : `${n} contas`);

/**
 * Pagamentos com chave própria por conta, guardada entre tentativas (padrão do PaymentForm):
 * - recusa do servidor: nada foi gravado; a próxima tentativa usa outra chave;
 * - falha de rede: a tentativa fica guardada; antes de repetir, findCommitmentOperation confere se ela foi gravada.
 *   Se foi e o conteúdo mudou (outra conta de saída), o gasto gerado é editado; nunca há um segundo pagamento.
 */
function usePayOnce() {
  const repo = useRepo();
  const qc = useQueryClient();
  const pay = usePayCommitment();
  const updateRecord = useUpdateRecord();
  const attempts = useRef(new Map<string, { key: string; pending: { key: string; snapshot: string }[] }>());

  return async (c: Commitment, input: PaymentInput): Promise<FinancialRecord | null> => {
    const snapshot = JSON.stringify([input, c.version]);
    const a = attempts.current.get(c.id) ?? { key: newOperationKey(), pending: [] };
    if (a.pending.length > 0) {
      for (const attempt of [...a.pending].reverse()) {
        const op = await repo.findCommitmentOperation(attempt.key);
        if (!op || op.action !== 'pagar_compromisso' || !op.recordId) continue;
        qc.invalidateQueries({ queryKey: ['commitments'] });
        qc.invalidateQueries({ queryKey: ['commitment', op.commitmentId] });
        qc.invalidateQueries({ queryKey: ['records'] });
        if (c.series) qc.invalidateQueries({ queryKey: ['series'] });
        const expense = await repo.getRecord(op.recordId);
        if (!expense || attempt.snapshot === snapshot) {
          attempts.current.delete(c.id);
          return expense;
        }
        const saved = await updateRecord.mutateAsync({
          key: newOperationKey(),
          id: expense.id,
          version: expense.version,
          input: { accountId: input.accountId, amountCents: input.amountCents, occurredOn: input.paidOn, description: expense.description, category: input.category },
        });
        attempts.current.delete(c.id);
        return saved;
      }
      // Nada foi gravado: repetir com a mesma chave só se o conteúdo é o mesmo da última tentativa.
      if (a.pending[a.pending.length - 1]!.snapshot !== snapshot) a.key = newOperationKey();
    }
    try {
      const w = await pay.mutateAsync({ key: a.key, id: c.id, version: c.version, input });
      attempts.current.delete(c.id);
      return w.record;
    } catch (e) {
      if (isUncertain(e)) {
        a.pending = [...a.pending, { key: a.key, snapshot }];
        attempts.current.set(c.id, a);
        // Se foi gravado, a lista recarrega e a conta sai das vencidas.
        qc.invalidateQueries({ queryKey: ['commitments'] });
        qc.invalidateQueries({ queryKey: ['records'] });
      } else attempts.current.delete(c.id);
      throw e;
    }
  };
}

type Pending =
  | { type: 'pagar'; commitment: Commitment }
  | { type: 'tirar'; commitment: Commitment }
  | { type: 'tirar-ano'; group: AnnualGroup }
  | { type: 'lote' }
  | null;

/**
 * Revisar contas vencidas (D-024): "Já paguei" e "Não houve" por linha e o pagamento em lote, no vencimento, das contas
 * de valor fixo selecionadas. O lote paga uma a uma, cada uma com a sua chave, e para na primeira falha; o que já foi
 * pago continua pago (nada é desfeito em silêncio). Conta estimada abre o formulário de pagamento com o valor vazio.
 */
export default function ContasVencidas() {
  const { today } = useSession();
  const insets = useSafeAreaInsets();
  const personal = useSpace().data;
  const ctx = personal?.personalContextId;
  const commitments = useCommitments(ctx, monthOf(today));
  const remove = useDeleteCommitment();
  const skipYear = useSkipSeriesYear();
  const seriesList = useSeriesList(ctx);
  const payOnce = usePayOnce();
  // "Pagamento registrado" ao voltar do formulário de pagamento ("Mudar valor ou data" e contas estimadas).
  const [notice] = useFlash();
  const s = commitments.summary;
  const overdue = s?.overdue ?? [];

  const [accountChoice, setAccountChoice] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, setPending] = useState<Pending>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ tone: 'sucesso' | 'erro'; text: string } | null>(null);
  /** Chave da exclusão por conta: a mesma depois de uma falha de rede, outra depois de uma recusa. */
  const deleteKeys = useRef(new Map<string, string>());
  /**
   * "Não houve em 2027": chave por grupo (série e ano) e o conteúdo enviado. Depois de uma falha de rede, o mesmo conteúdo
   * vai com a mesma chave e o banco reconhece a repetição; outro conteúdo usa outra chave.
   */
  const skipKeys = useRef(new Map<string, { key: string; snapshot: string }>());

  const account = personal?.accounts.find((a) => a.id === accountChoice) ?? personal?.accounts[0] ?? null;
  // Fatura de cartão (D-037) não entra no pagamento em lote: ela se paga na própria fatura.
  const fixed = overdue.filter((c) => !c.amountIsEstimate && !c.invoice);
  // Seleções de contas que já saíram da lista (pagas ou tiradas) deixam de contar.
  const chosen = fixed.filter((c) => selected.includes(c.id));
  const toList = () => (router.canGoBack() ? router.back() : router.replace('/a-pagar'));

  const inputFor = (c: Commitment): PaymentInput => ({ accountId: account!.id, amountCents: c.amountCents, paidOn: c.dueOn, category: c.category });

  const success = (text: string) => {
    // Confirmação tátil só depois da gravação confirmada.
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setResult({ tone: 'sucesso', text });
  };

  /** Efeito em Pago no Resumo, quando todos os pagamentos caem no mesmo mês. */
  const showEffect = (paid: { amountCents: number; occurredOn: string }[]) => {
    const months = new Set(paid.map((r) => monthOf(r.occurredOn)));
    if (months.size !== 1) return;
    totalChange.set({ total: 'pago', month: [...months][0]!, deltaCents: paid.reduce((acc, r) => acc + r.amountCents, 0) });
  };

  const toggle = (id: string) => setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const payOne = async (c: Commitment) => {
    if (!account || busy) return;
    setBusy(true);
    setResult(null);
    try {
      const record = await payOnce(c, inputFor(c));
      setPending(null);
      setSelected((cur) => cur.filter((x) => x !== c.id));
      if (record) showEffect([record]);
      success(`${billName(c, today)} marcada como paga.`);
    } catch (e) {
      setPending(null);
      setResult({ tone: 'erro', text: `${billName(c, today)}: ${payReason(e)}` });
      if (!isUncertain(e)) commitments.refetch();
    } finally {
      setBusy(false);
    }
  };

  const payBatch = async () => {
    if (!account || busy) return;
    const batch = chosen;
    setBusy(true);
    setResult(null);
    const paid: FinancialRecord[] = [];
    let done = 0;
    try {
      for (const c of batch) {
        try {
          const record = await payOnce(c, inputFor(c));
          if (record) paid.push(record);
          done += 1;
          setSelected((cur) => cur.filter((x) => x !== c.id));
        } catch (e) {
          // Para na primeira falha; as anteriores continuam pagas.
          setResult({ tone: 'erro', text: `${done} de ${batch.length} marcadas como pagas. ${billName(c, today)}: ${payReason(e)}` });
          if (!isUncertain(e)) commitments.refetch();
          return;
        }
      }
      showEffect(paid);
      success(batch.length === 1 ? '1 conta marcada como paga.' : `${batch.length} contas marcadas como pagas.`);
    } finally {
      setPending(null);
      setBusy(false);
    }
  };

  const doRemove = async (c: Commitment) => {
    if (busy) return;
    setBusy(true);
    setResult(null);
    const key = deleteKeys.current.get(c.id) ?? newOperationKey();
    deleteKeys.current.set(c.id, key);
    try {
      await remove.mutateAsync({ key, id: c.id, version: c.version });
      deleteKeys.current.delete(c.id);
      setPending(null);
      setSelected((cur) => cur.filter((x) => x !== c.id));
      success(`${billName(c, today)} saiu de Contas a pagar.`);
    } catch (e) {
      setPending(null);
      if (isUncertain(e)) {
        // Rede: repetir com a mesma chave é seguro.
        setResult({ tone: 'erro', text: COMMITMENT_ERROR_TEXT.excluir_falhou });
        return;
      }
      deleteKeys.current.delete(c.id);
      const reason = isRepoError(e, 'versao_desatualizada')
        ? 'a conta mudou em outro aparelho. Nada foi alterado.'
        : isRepoError(e, 'compromisso_quitado')
          ? 'a conta já foi marcada como paga.'
          : isRepoError(e, 'nao_encontrado')
            ? 'a conta não está mais disponível.'
            : COMMITMENT_ERROR_TEXT.excluir_falhou;
      setResult({ tone: 'erro', text: `${billName(c, today)}: ${reason}` });
      commitments.refetch();
    } finally {
      setBusy(false);
    }
  };

  /** Plano de "Não houve em 2027" com todas as contas em aberto do contexto (a lista de Contas a pagar traz todas). */
  const yearPlanFor = (g: AnnualGroup) => {
    const series = seriesList.data?.find((x) => x.id === g.seriesId);
    if (!series || !commitments.data) return null;
    const plan = affectedByYear(commitments.data, series, g.commitments[0]!.series!.number, 'tirar');
    return plan.ok ? plan : null;
  };

  const doSkipYear = async (g: AnnualGroup) => {
    const plan = yearPlanFor(g);
    if (busy || !plan) return;
    setBusy(true);
    setResult(null);
    const groupKey = `${g.seriesId}|${g.index}`;
    const snapshot = JSON.stringify([g.seriesId, plan.affected]);
    const prev = skipKeys.current.get(groupKey);
    const key = prev && prev.snapshot === snapshot ? prev.key : newOperationKey();
    skipKeys.current.set(groupKey, { key, snapshot });
    try {
      await skipYear.mutateAsync({ key, seriesId: g.seriesId, number: g.commitments[0]!.series!.number, affected: plan.affected });
      skipKeys.current.delete(groupKey);
      setPending(null);
      setSelected((cur) => cur.filter((x) => !plan.changing.some((c) => c.id === x)));
      success(plan.doneText);
    } catch (e) {
      setPending(null);
      if (isUncertain(e)) {
        // Rede: repetir com a mesma chave é seguro.
        setResult({ tone: 'erro', text: `Não foi possível tirar as parcelas de ${g.label}. Tente novamente.` });
        return;
      }
      skipKeys.current.delete(groupKey);
      setResult({ tone: 'erro', text: annualYearErrorText(isRepoError(e) ? e.code : 'desconhecido', g.label) });
      commitments.refetch();
    } finally {
      setBusy(false);
    }
  };

  const target = pending && (pending.type === 'pagar' || pending.type === 'tirar') ? pending.commitment : null;
  const yearTarget = pending?.type === 'tirar-ano' ? pending.group : null;
  const yearTargetPlan = yearTarget ? yearPlanFor(yearTarget) : null;
  // O que sai de fato: todas as parcelas do ano em aberto, também as que ainda não venceram (o grupo mostra só as vencidas).
  const yearTargetSummary =
    yearTarget && yearTargetPlan
      ? (() => {
          const n = yearTargetPlan.changing.length;
          const total = yearTargetPlan.changing.reduce((acc, c) => acc + c.amountCents, 0);
          const approximate = yearTargetPlan.changing.some((c) => c.amountIsEstimate);
          const notDue = n - yearTargetPlan.changing.filter((c) => c.dueOn < today).length;
          return {
            line: `${yearTarget.title} · ${n === 1 ? '1 parcela' : `${n} parcelas`} · ${approximate ? 'cerca de ' : ''}${formatBRL(total)}`,
            notDue:
              notDue === 0 ? null : notDue === 1 ? 'Inclui 1 parcela que ainda não venceu.' : `Inclui ${notDue} parcelas que ainda não venceram.`,
          };
        })()
      : null;
  const batchTotal = chosen.reduce((acc, c) => acc + c.amountCents, 0);
  const batchLabel =
    chosen.length === 0
      ? 'Marcar as selecionadas como pagas no vencimento'
      : chosen.length === 1
        ? 'Marcar a 1 selecionada como paga no vencimento'
        : `Marcar as ${chosen.length} selecionadas como pagas no vencimento`;
  const resultBanner = result ? (
    <Banner tone={result.tone} icon={result.tone === 'erro' ? AlertCircle : Check}>
      <MoneyTxt variant="label" color={result.tone === 'erro' ? colors.error : colors.successText} style={{ fontFamily: fonts.bold }}>
        {result.text}
      </MoneyTxt>
    </Banner>
  ) : null;
  const hasFooter = commitments.isSuccess && fixed.length > 0;
  // Parcelas da mesma conta do ano e do mesmo ano ficam juntas, sob um cabeçalho com "Não houve em 2027".
  const grouped = groupAnnualLater(overdue);

  /** Linha de conta vencida: caixa (valor fixo) ou valor estimado, "Já paguei" e "Não houve". */
  const renderRow = (c: Commitment, last: boolean, inGroup = false) => (
    <Animated.View key={c.id} exiting={rowExit} layout={rowLayout} style={[styles.row, inGroup && styles.inGroup, !last && styles.divider]}>
      <OverdueInfo commitment={c} checked={selected.includes(c.id)} onToggle={() => toggle(c.id)} />
      {c.invoice ? (
        <View style={styles.actions}>
          <Button
            label={CARDS_TEXT.openInvoice}
            accessibilityLabel={`${CARDS_TEXT.openInvoice}: ${yearA11y(billName(c, today))}`}
            tone="soft"
            style={styles.action}
            onPress={() => openCommitment(c)}
          />
        </View>
      ) : (
      <View style={styles.actions}>
        <Button
          label="Já paguei"
          accessibilityLabel={`Já paguei ${yearA11y(billName(c, today))}`}
          tone="soft"
          disabled={busy || !account}
          style={styles.action}
          onPress={() =>
            c.amountIsEstimate
              ? router.push({ pathname: '/a-pagar/[id]/pagar', params: { id: c.id, data: 'vencimento' } })
              : setPending({ type: 'pagar', commitment: c })
          }
        />
        <Button
          label="Não houve"
          accessibilityLabel={`Não houve ${yearA11y(billName(c, today))}`}
          tone="ghost"
          disabled={busy}
          style={styles.action}
          onPress={() => setPending({ type: 'tirar', commitment: c })}
        />
      </View>
      )}
    </Animated.View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SubHeader title="Contas vencidas" onBack={toList} right={<ContextPill label="Pessoal" />} />
      <Screen contentStyle={{ padding: space[5], gap: space[4] }}>
        <View style={{ gap: space[1] }}>
          <Txt color={colors.textSecondary}>Marque o que você já pagou e tire o que não houve.</Txt>
          <TopicLink slug="voltei-depois" label="Por que só aparecem meses recentes?" style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }} />
        </View>
        <FlashBanner message={notice} />
        {hasFooter ? null : resultBanner}

        {commitments.isPending ? (
          <View style={{ gap: space[3] }}>
            <Skeleton width="100%" height={96} />
            <Skeleton width="100%" height={96} />
          </View>
        ) : commitments.isError || !s ? (
          <ErrorState message={ERROR_TEXT.carregar_falhou} onRetry={() => commitments.refetch()} />
        ) : overdue.length === 0 ? (
          <Card>
            <EmptyState
              title="Nenhuma conta vencida"
              art="compromissos"
              action={<Button label="Ir para Contas a pagar" tone="soft" onPress={toList} />}>
              Contas em aberto com vencimento antes de hoje aparecem aqui.
            </EmptyState>
          </Card>
        ) : (
          <>
            {personal && personal.accounts.length > 1 ? (
              <View style={{ gap: space[2] }} accessibilityRole="radiogroup" accessibilityLabel="Conta de saída dos pagamentos">
                <Txt variant="label" style={{ fontFamily: fonts.bold }}>
                  Conta de saída dos pagamentos
                </Txt>
                <View style={styles.chips}>
                  {personal.accounts.map((a) => (
                    <Chip key={a.id} label={a.name} selected={account?.id === a.id} onPress={() => setAccountChoice(a.id)} />
                  ))}
                </View>
              </View>
            ) : null}

            <Card>
              {grouped.map((g, i) => {
                const last = i === grouped.length - 1;
                if (g.type === 'conta') return renderRow(g.commitment, last);
                const group = g.group;
                const ids = group.commitments.map((c) => c.id);
                const allSelected = ids.every((id) => selected.includes(id));
                return (
                  <Animated.View key={`ano-${group.seriesId}-${group.index}`} exiting={rowExit} layout={rowLayout} style={!last && styles.divider}>
                    <View style={styles.groupHead}>
                      <Txt
                        variant="label"
                        style={{ fontFamily: fonts.bold, fontSize: 15 }}
                        accessibilityRole="header"
                        aria-level={3}
                        accessibilityLabel={yearA11yLabel(`${group.title} · ${group.count} parcelas vencidas`)}>
                        {group.title} · {group.count} parcelas vencidas
                      </Txt>
                      <View style={styles.actions}>
                        {group.allFixed ? (
                          <Button
                            label={allSelected ? 'Selecionadas' : `Selecionar as ${group.count}`}
                            // O nome falado começa pelo texto visível ("Selecionadas" depois de selecionar todas).
                            accessibilityLabel={
                              allSelected
                                ? `Selecionadas: as ${group.count} parcelas de ${group.description} de ${yearA11y(group.label)}`
                                : `Selecionar as ${group.count} parcelas de ${group.description} de ${yearA11y(group.label)}`
                            }
                            icon={allSelected ? Check : ListChecks}
                            tone="soft"
                            disabled={busy || allSelected}
                            style={styles.action}
                            onPress={() => setSelected((cur) => [...cur, ...ids.filter((id) => !cur.includes(id))])}
                          />
                        ) : null}
                        <Button
                          label={`Não houve em ${group.label}`}
                          accessibilityLabel={`Não houve ${group.description} em ${yearA11y(group.label)}`}
                          tone="ghost"
                          disabled={busy || !yearPlanFor(group)}
                          style={styles.action}
                          onPress={() => setPending({ type: 'tirar-ano', group })}
                        />
                      </View>
                    </View>
                    {group.commitments.map((c, j) => renderRow(c, j === group.commitments.length - 1, true))}
                  </Animated.View>
                );
              })}
            </Card>

            {fixed.length > 0 ? (
              <Txt variant="caption" color={colors.textSecondary}>
                Só contas de valor fixo podem ser marcadas juntas: cada uma vira um gasto com o valor previsto, na data do vencimento
                {account ? `, da conta ${account.name}` : ''}. Contas estimadas pedem o valor da conta.
              </Txt>
            ) : null}
          </>
        )}
      </Screen>

      {hasFooter ? (
        // Rodapé fixo: o lote fica sempre visível, com o resultado logo acima.
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, space[3]) }]}>
          <View style={styles.footerInner}>
            {resultBanner}
            <Button
              label={batchLabel}
              icon={ListChecks}
              busy={busy && pending?.type === 'lote'}
              busyLabel="Marcando…"
              disabled={chosen.length === 0 || busy || !account}
              onPress={() => setPending({ type: 'lote' })}
            />
          </View>
        </View>
      ) : null}

      {target && pending?.type === 'pagar' && account ? (
        <ChoiceDialog
          visible
          title={`Marcar ${billName(target, today)} como paga?`}
          busy={busy}
          onCancel={() => setPending(null)}
          choices={[
            { label: 'Confirmar', tone: 'brand', onPress: () => payOne(target) },
            {
              label: 'Mudar valor ou data',
              onPress: () => {
                setPending(null);
                router.push({ pathname: '/a-pagar/[id]/pagar', params: { id: target.id, data: 'vencimento' } });
              },
            },
          ]}>
          <MoneyTxt style={[{ fontFamily: fonts.bold }, tabular]}>
            {`${formatBRL(target.amountCents)} em ${formatDateBR(target.dueOn)}, da conta ${account.name}.`}
          </MoneyTxt>
          <Txt color={colors.textSecondary}>
            Um gasto com esse valor entra em Pago de {formatMonthBR(monthOf(target.dueOn)).toLowerCase()}, e a conta sai de Ainda a pagar.
          </Txt>
        </ChoiceDialog>
      ) : null}

      {yearTarget && yearTargetPlan && yearTargetSummary ? (
        <ConfirmDialog
          visible
          title={
            yearTargetPlan.changing.length === yearTarget.count
              ? `Tirar as ${yearTarget.count} parcelas de ${yearTarget.label}?`
              : yearTargetPlan.title
          }
          cancelLabel="Cancelar"
          confirmLabel="Tirar parcelas"
          busy={busy}
          onCancel={() => setPending(null)}
          onConfirm={() => doSkipYear(yearTarget)}>
          <MoneyTxt style={[{ fontFamily: fonts.bold }, tabular]} accessibilityLabel={yearA11yLabel(yearTargetSummary.line)}>
            {yearTargetSummary.line}
          </MoneyTxt>
          {yearTargetSummary.notDue ? <Txt color={colors.textSecondary}>{yearTargetSummary.notDue}</Txt> : null}
          <MoneyTxt color={colors.textSecondary} accessibilityLabel={yearA11yLabel(yearTargetPlan.text)}>
            {yearTargetPlan.text}
          </MoneyTxt>
        </ConfirmDialog>
      ) : null}

      {target && pending?.type === 'tirar' ? (
        <ConfirmDialog
          visible
          title={
            target.series?.kind === 'anual' && (target.series.partsPerYear ?? 1) > 1
              ? `Tirar a ${monthWord(target, today)}?`
              : `Tirar a conta de ${monthWord(target, today)}?`
          }
          cancelLabel="Cancelar"
          confirmLabel="Tirar conta"
          busy={busy}
          onCancel={() => setPending(null)}
          onConfirm={() => doRemove(target)}>
          <MoneyTxt style={{ fontFamily: fonts.bold }}>
            {`${target.description} · ${formatBRL(target.amountCents)} · venceu em ${formatDateBR(target.dueOn)}`}
          </MoneyTxt>
          <Txt color={colors.textSecondary}>
            {target.series ? 'Ela sai de Contas a pagar e não volta a ser criada.' : 'Ela sai de Contas a pagar.'}
          </Txt>
        </ConfirmDialog>
      ) : null}

      {pending?.type === 'lote' && account ? (
        <ConfirmDialog
          visible
          title={`Marcar ${contas(chosen.length)} como ${chosen.length === 1 ? 'paga' : 'pagas'}?`}
          cancelLabel="Cancelar"
          confirmLabel="Marcar como pagas"
          confirmTone="brand"
          busy={busy}
          onCancel={() => setPending(null)}
          onConfirm={payBatch}>
          <MoneyTxt style={[{ fontFamily: fonts.bold }, tabular]}>{`Total: ${formatBRL(batchTotal)}, da conta ${account.name}.`}</MoneyTxt>
          <Txt color={colors.textSecondary}>
            Cada conta vira um gasto com o valor previsto, na data do vencimento, e entra em Pago do mês dessa data. Se uma falhar, as
            seguintes não são marcadas e as anteriores continuam pagas.
          </Txt>
        </ConfirmDialog>
      ) : null}
    </View>
  );
}

/** Descrição, "Venceu em 12/02/2027" e o valor. Valor fixo: caixa de seleção para o lote; estimado: "≈ R$ 180,00 · estimado". */
function OverdueInfo({ commitment: c, checked, onToggle }: { commitment: Commitment; checked: boolean; onToggle: () => void }) {
  const hidden = useValuesHidden();
  // Conta do ano: a parcela e o ano junto do vencimento ("Venceu em 10/02/2027 · Parcela 1 de 10 de 2027").
  const yearPart = c.series?.kind === 'anual' ? ` · ${occurrenceLabel(c)}` : '';
  const due = `Venceu em ${formatDateBR(c.dueOn)}${yearPart}`;
  // Fatura de cartão (D-037): sem caixa de seleção; o pagamento é na própria fatura.
  if (c.invoice) {
    return (
      <View style={styles.estimate} accessible accessibilityLabel={`${c.description}, ${due.toLowerCase()}, ${moneyA11y(c.amountCents, hidden)}`}>
        <Txt variant="label" style={{ fontFamily: fonts.bold }}>
          {c.description}
        </Txt>
        <Txt variant="caption" color={colors.textSecondary} style={tabular}>
          {due} · {moneyText(c.amountCents, hidden)}
        </Txt>
      </View>
    );
  }
  if (!c.amountIsEstimate) {
    return <CheckOption label={c.description} hint={`${due} · ${formatBRL(c.amountCents)}`} checked={checked} onPress={onToggle} />;
  }
  return (
    <View
      style={styles.estimate}
      accessible
      accessibilityLabel={`${c.description}, ${due.toLowerCase().replace(/ · /g, ', ').replace(/(\d{4})\/(\d{4})/, '$1 a $2')}, cerca de ${moneyA11y(c.amountCents, hidden)}, valor estimado`}>
      <Txt variant="label" style={{ fontFamily: fonts.bold }}>
        {c.description}
      </Txt>
      <Txt variant="caption" color={colors.textSecondary} style={tabular}>
        {due} · ≈ {moneyText(c.amountCents, hidden)} · estimado
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  row: { gap: space[2], paddingVertical: space[3] },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  // Alinhada ao texto das linhas com caixa de seleção (caixa de 24 px + espaço).
  estimate: { gap: 2, paddingVertical: space[2], paddingLeft: 24 + space[3] },
  action: { alignSelf: 'auto', flexGrow: 1, flexBasis: 140 },
  groupHead: { gap: space[2], paddingTop: space[3] },
  // Linhas de um grupo: recuo à esquerda, ligadas ao cabeçalho do ano.
  inGroup: { paddingLeft: space[3], borderLeftWidth: 3, borderLeftColor: colors.brandTint },
  footer: { backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space[3], paddingHorizontal: space[5] },
  footerInner: { width: '100%', maxWidth: 560, alignSelf: 'center', gap: space[3] },
});
