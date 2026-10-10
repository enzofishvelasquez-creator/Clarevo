import {
  ERROR_TEXT,
  PAYABLES_NAV_TEXT,
  REMINDERS_SETTINGS_HREF,
  QUICK_PAY_TEXT,
  RETURN_TEXT,
  formatMonthBR,
  groupAnnualLater,
  isRepoError,
  monthOf,
  newOperationKey,
  payablesStartMonth,
  payablesStep,
  quickPayAction,
  quickPayDraft,
  showsRemindersLink,
  toPayCaption,
  type Commitment,
  type FinancialRecord,
  type GroupedCommitment,
  type IsoMonth,
  type PaymentInput,
} from '@clarevo/core';
import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { AlertCircle, Bell, CalendarClock, Check, ChevronLeft, ChevronRight, Info, ListChecks, Pencil, Plus, Repeat, ShieldCheck } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeOut, LinearTransition, ReduceMotion } from 'react-native-reanimated';

import { ChoiceDialog } from '@/components/choice-dialog';
import { useMoneyMask } from '@/components/committed-parts';
import { AnnualGroupRow, CommitmentRow, type RowAction } from '@/components/commitment-row';
import { FlashBanner, useFlash } from '@/components/flash';
import { ContextPill, SubHeader } from '@/components/header';
import { MoneyTxt } from '@/components/money-text';
import { useReturnBand } from '@/components/retorno-faixa';
import { EmptyState, ErrorState } from '@/components/states';
import { TermHint } from '@/components/term-hint';
import { TopicLink } from '@/components/topic-link';
import { Banner, Button, Card, FitMoney, LinkButton, Screen, Skeleton, Txt } from '@/components/ui';
import { announceOnIOS } from '@/lib/a11y';
import { openCommitment } from '@/lib/cards';
import { DEVICE_FEATURES } from '@/lib/device';
import { loadPrefs, useDevicePrefs } from '@/lib/device-prefs';
import { totalChange } from '@/lib/highlight';
import { explanationHref } from '@/lib/learn';
import { useCommitments, usePayCommitment, usePaymentsForecast, useSeriesList, useSeriesSync, useSpace, useUpdateRecord, useView } from '@/state/data';
import { useRepo, useSession } from '@/state/session';
import { colors, fonts, motion, radius, space, tabular } from '@/theme/tokens';

// Linhas saem e se reacomodam devagar (CL-V008); nada anima antes da resposta do servidor.
const rowExit = FadeOut.duration(motion.detail).reduceMotion(ReduceMotion.System);
const rowLayout = LinearTransition.duration(motion.detail).reduceMotion(ReduceMotion.System);

/** "1 conta de gasto fixo que já venceu" ou "2 contas de gastos fixos que já venceram". */
const createdOverdueText = (n: number) =>
  n === 1
    ? 'O Clarevo criou 1 conta de gasto fixo que já venceu. Confira se você já pagou.'
    : `O Clarevo criou ${n} contas de gastos fixos que já venceram. Confira se você já pagou.`;

const registeredText = (n: number) => (n === 0 ? 'Nenhum cadastrado' : n === 1 ? '1 cadastrado' : `${n} cadastrados`);

/** Espera para o anúncio no iOS: o diálogo de confirmação fecha e o VoiceOver volta à lista antes. */
const QUICK_PAY_ANNOUNCE_DELAY = 500;

const isUncertain = (e: unknown) => !isRepoError(e) || e.code === 'rede' || e.code === 'desconhecido';

/** Motivo curto de uma recusa, depois do nome da conta: "Luz: a conta mudou em outro aparelho." */
function payReason(e: unknown): string {
  if (isRepoError(e, 'versao_desatualizada')) return 'a conta mudou em outro aparelho. Confira e tente de novo.';
  if (isRepoError(e, 'compromisso_quitado')) return 'a conta já foi marcada como paga em outro aparelho.';
  if (isRepoError(e, 'nao_encontrado')) return 'a conta não está mais disponível.';
  if (isRepoError(e, 'sem_permissao')) return 'você não tem permissão para esta ação.';
  if (!isUncertain(e)) return 'não foi possível registrar o pagamento.';
  return 'não foi possível confirmar o pagamento. Tente novamente.';
}

/**
 * "Já paguei" na lista: pay_commitment pelo usePayCommitment, com chave própria por conta, guardada entre tentativas
 * (mesmo padrão do PaymentForm e da revisão de vencidas):
 * - recusa do servidor: nada foi gravado; a próxima tentativa usa outra chave;
 * - falha de rede: a tentativa fica guardada e é conferida na hora, uma vez, com findCommitmentOperation; se a conferência
 *   também falhar ou não achar nada, a próxima tentativa confere de novo antes de repetir (com a mesma chave, se o conteúdo
 *   é o mesmo). Se uma tentativa foi gravada e o conteúdo mudou, o gasto gerado é editado; nunca há um segundo pagamento.
 */
function usePayOnce() {
  const repo = useRepo();
  const qc = useQueryClient();
  const pay = usePayCommitment();
  const updateRecord = useUpdateRecord();
  const attempts = useRef(new Map<string, { key: string; pending: { key: string; snapshot: string }[] }>());

  /** Gasto da tentativa gravada (null se ele já não existe) ou undefined se nenhuma tentativa foi gravada. */
  const reconcile = async (
    c: Commitment,
    input: PaymentInput,
    snapshot: string,
    pending: { key: string; snapshot: string }[],
  ): Promise<FinancialRecord | null | undefined> => {
    for (const attempt of [...pending].reverse()) {
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
    return undefined;
  };

  return async (c: Commitment, input: PaymentInput): Promise<FinancialRecord | null> => {
    const snapshot = JSON.stringify([input, c.version]);
    const a = attempts.current.get(c.id) ?? { key: newOperationKey(), pending: [] };
    if (a.pending.length > 0) {
      const found = await reconcile(c, input, snapshot, a.pending);
      if (found !== undefined) return found;
      // Nada foi gravado: repetir com a mesma chave só se o conteúdo é o mesmo da última tentativa.
      if (a.pending[a.pending.length - 1]!.snapshot !== snapshot) a.key = newOperationKey();
    }
    try {
      const w = await pay.mutateAsync({ key: a.key, id: c.id, version: c.version, input });
      attempts.current.delete(c.id);
      return w.record;
    } catch (e) {
      if (!isUncertain(e)) {
        attempts.current.delete(c.id);
        throw e;
      }
      a.pending = [...a.pending, { key: a.key, snapshot }];
      attempts.current.set(c.id, a);
      // Se foi gravado, a lista recarrega e a conta sai de "A vencer".
      qc.invalidateQueries({ queryKey: ['commitments'] });
      qc.invalidateQueries({ queryKey: ['records'] });
      let found: FinancialRecord | null | undefined;
      try {
        found = await reconcile(c, input, snapshot, a.pending);
      } catch {
        found = undefined; // a conferência também falhou: fica para a próxima tentativa
      }
      if (found !== undefined) return found;
      throw e;
    }
  };
}

/**
 * Contas a pagar do contexto Pessoal, com a mesma origem do card do Resumo. O mês é desta tela (seletor local, D-039): as
 * entradas "de agora" (lembrete, atalho do ícone, aviso de vencidas) abrem no mês atual; os cards que mostram um mês levam
 * esse mês no endereço (?mes=AAAA-MM). Trocar de mês aqui não muda o mês do Resumo nem de Movimentos.
 */
export default function ContasAPagarScreen() {
  const { today } = useSession();
  const { currentMonth } = useView();
  const params = useLocalSearchParams<{ mes?: string; abrir?: string }>();
  const [month, setMonth] = useState(() => payablesStartMonth(params.mes, currentMonth));
  // Tela já aberta e nova entrada com mês (aviso de conta a vencer, cards): o mês do endereço manda. `abrir` muda a cada aviso,
  // para o mesmo mês pedido outra vez também trazer a tela de volta ao mês atual.
  const openedWith = useRef(`${params.mes ?? ''}|${params.abrir ?? ''}`);
  useEffect(() => {
    const stamp = `${params.mes ?? ''}|${params.abrir ?? ''}`;
    if (stamp === openedWith.current) return;
    openedWith.current = stamp;
    setMonth(payablesStartMonth(params.mes, currentMonth));
  }, [params.mes, params.abrir, currentMonth]);
  const personal = useSpace().data;
  const ctx = personal?.personalContextId;
  const commitments = useCommitments(ctx, month);
  const seriesList = useSeriesList(ctx);
  const sync = useSeriesSync(ctx);
  const [notice] = useFlash();
  const payOnce = usePayOnce();
  /** Conta do diálogo "Marcar Luz como paga hoje?". */
  const [target, setTarget] = useState<Commitment | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ tone: 'sucesso' | 'erro'; text: string } | null>(null);
  // Mesma conta de saída que o formulário de pagamento abre escolhida; "Mudar valor ou data" permite trocar.
  const account = personal?.accounts[0] ?? null;
  const s = commitments.summary;
  const monthName = formatMonthBR(month);
  const isCurrent = month === currentMonth;
  const caption = s ? toPayCaption(s, today) : null;
  // A sincronização do dia criou contas já vencidas: a faixa fica enquanto alguma conta de gasto fixo continuar vencida.
  const createdOverdue = sync.data?.createdOverdue ?? 0;
  const showCreatedOverdue = isCurrent && createdOverdue > 0 && Boolean(s?.overdue.some((c) => c.series));
  // Com a faixa "Seus últimos meses" ativa no Resumo, o aviso leva ao mesmo resumo (um só pedido, D-030).
  const returnBandOn = useReturnBand(isCurrent ? ctx : undefined).status === 'visivel';

  // Próximos meses: parcelas da mesma conta do ano e do mesmo ano viram um grupo (o toque abre a conta do ano).
  const laterHasAnnual = Boolean(s?.later.some((c) => c.series?.kind === 'anual'));
  const sections: {
    title: string;
    legend?: string;
    list: Commitment[];
    grouped?: GroupedCommitment[];
    review?: boolean;
    quickPay?: boolean;
    /** "Quanto custa pagar depois do vencimento?" no fim da seção (spec3 §3.7). */
    lateCost?: boolean;
  }[] = !s
    ? []
    : isCurrent
      ? [
          // "Revisar vencidas" já com 1 vencida: a revisão trata uma conta só e paga na data do vencimento (D-039).
          { title: 'Vencidas', list: s.overdue, review: s.overdue.length >= 1, lateCost: true },
          { title: `A vencer em ${monthName.toLowerCase()}`, list: s.upcomingInMonth, quickPay: true },
          { title: 'Pagas', legend: 'Já contam em Pago, no mês da data do pagamento.', list: s.paidInMonth },
          {
            title: 'Próximos meses',
            legend: laterHasAnnual
              ? 'Não entram no total deste mês. Contas do ano aparecem aqui dois meses antes de vencer.'
              : 'Não entram no total deste mês.',
            list: s.later,
            grouped: groupAnnualLater(s.later),
          },
        ]
      : [
          { title: 'Em aberto', list: s.items },
          { title: 'Pagas', legend: 'Já contam em Pago, no mês da data do pagamento.', list: s.paidInMonth },
        ];
  const visible = sections.filter((sec) => sec.list.length > 0);

  const openPaymentForm = (c: Commitment) => router.push({ pathname: '/a-pagar/[id]/pagar', params: { id: c.id } });

  /**
   * "Já paguei" (valor fixo, a vencer): diálogo de confirmação; estimada: "Informar valor e pagar", que abre o formulário
   * de pagamento com o valor vazio (o valor pago vem da pessoa, D-024(4)). Paga ou vencida: nada (as vencidas seguem na
   * revisão de vencidas). Só na seção "A vencer" do mês atual.
   */
  const actionFor = (c: Commitment): RowAction | undefined => {
    const kind = quickPayAction(c, today);
    if (kind === 'pagar') {
      return {
        label: QUICK_PAY_TEXT.button,
        accessibilityLabel: QUICK_PAY_TEXT.a11y(c.description, c.dueOn, today),
        disabled: busy || !account,
        onPress: () => {
          setResult(null);
          setTarget(c);
        },
      };
    }
    if (kind === 'informar') {
      return {
        label: QUICK_PAY_TEXT.estimateButton,
        accessibilityLabel: QUICK_PAY_TEXT.estimateA11y(c.description, c.dueOn, today),
        icon: Pencil,
        disabled: busy,
        onPress: () => openPaymentForm(c),
      };
    }
    return undefined;
  };

  /** Confirmar no diálogo: só depois da resposta do servidor a linha sai da lista (com a mesma transição das outras). */
  const confirmPay = async (c: Commitment) => {
    const draft = quickPayDraft(c, today);
    if (!draft || !account || busy) return;
    setBusy(true);
    setResult(null);
    try {
      const record = await payOnce(c, { accountId: account.id, ...draft });
      setTarget(null);
      // Confirmação tátil e efeito em Pago no Resumo só depois da gravação confirmada.
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      if (record) totalChange.set({ total: 'pago', month: monthOf(record.occurredOn), deltaCents: record.amountCents });
      const done = QUICK_PAY_TEXT.done(c.description);
      setResult({ tone: 'sucesso', text: done });
      // No iOS o aviso não tem região viva: é anunciado depois de o diálogo fechar.
      announceOnIOS(done, { delay: QUICK_PAY_ANNOUNCE_DELAY });
    } catch (e) {
      setTarget(null);
      const text = `${c.description}: ${payReason(e)}`;
      setResult({ tone: 'erro', text });
      announceOnIOS(text, { delay: QUICK_PAY_ANNOUNCE_DELAY });
      if (!isUncertain(e)) commitments.refetch();
    } finally {
      setBusy(false);
    }
  };
  const targetDraft = target ? quickPayDraft(target, today) : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SubHeader title="Contas a pagar" right={<ContextPill label="Pessoal" />} />
      <Screen contentStyle={{ padding: space[5], gap: space[4] }}>
        <FlashBanner message={notice} />
        {showCreatedOverdue ? (
          <Banner tone="info" icon={Info}>
            <Txt variant="label">{createdOverdueText(createdOverdue)}</Txt>
            {returnBandOn ? (
              <LinkButton label={RETURN_TEXT.toPayAction} icon={ListChecks} style={styles.inlineLink} onPress={() => router.push('/retomar')} />
            ) : (
              <LinkButton label="Revisar vencidas" icon={ListChecks} style={styles.inlineLink} onPress={() => router.push('/a-pagar/vencidas')} />
            )}
          </Banner>
        ) : null}

        <View style={{ gap: space[1] }}>
          <PayablesMonthPicker month={month} currentMonth={currentMonth} onChange={setMonth} />
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
              {caption?.includes ? <MoneyTxt variant="label">{caption.includes}</MoneyTxt> : null}
              {caption?.estimated ? (
                <>
                  <MoneyTxt variant="label">{caption.estimated}</MoneyTxt>
                  <TermHint term="Valor estimado" slug="estimativa" />
                </>
              ) : null}
            </>
          )}
        </View>

        <Button label="Anotar conta a pagar" icon={Plus} onPress={() => router.push('/a-pagar/nova')} />
        <SeriesLink count={seriesList.data?.length ?? null} />

        {result ? (
          <Banner tone={result.tone} icon={result.tone === 'erro' ? AlertCircle : Check}>
            <Txt variant="label" color={result.tone === 'erro' ? colors.error : colors.successText} style={{ fontFamily: fonts.bold }}>
              {result.text}
            </Txt>
          </Banner>
        ) : null}

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
            <EmptyState
              title={`Nenhuma conta a pagar com vencimento em ${monthName.toLowerCase()}`}
              art="compromissos"
              action={
                isCurrent ? undefined : (
                  <Button label={`Ver ${formatMonthBR(currentMonth).toLowerCase()}`} tone="soft" onPress={() => setMonth(currentMonth)} />
                )
              }
            />
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
                {sec.grouped
                  ? sec.grouped.map((g, i) =>
                      g.type === 'conta' ? (
                        <Animated.View key={g.commitment.id} exiting={rowExit} layout={rowLayout}>
                          <CommitmentRow
                            commitment={g.commitment}
                            today={today}
                            last={i === sec.grouped!.length - 1}
                            onPress={() => openCommitment(g.commitment)}
                          />
                        </Animated.View>
                      ) : (
                        <Animated.View key={`ano-${g.group.seriesId}-${g.group.index}`} exiting={rowExit} layout={rowLayout}>
                          <AnnualGroupRow
                            group={g.group}
                            last={i === sec.grouped!.length - 1}
                            onPress={() => router.push(`/gastos-fixos/${g.group.seriesId}`)}
                          />
                        </Animated.View>
                      ),
                    )
                  : sec.list.map((c, i) => (
                      <Animated.View key={c.id} exiting={rowExit} layout={rowLayout}>
                        <CommitmentRow
                          commitment={c}
                          today={today}
                          last={i === sec.list.length - 1}
                          onPress={() => openCommitment(c)}
                          action={sec.quickPay ? actionFor(c) : undefined}
                        />
                      </Animated.View>
                    ))}
                {sec.lateCost ? (
                  <TopicLink slug="multa-juros-atraso" label="Quanto custa pagar depois do vencimento?" style={styles.inlineLink} />
                ) : null}
              </Card>
            </Animated.View>
          ))
        )}

        {/* Previsão dos pagamentos do mês (docs/08 §5 item 7): só aqui e só no mês de hoje; nunca no Resumo. Depois das listas,
            para o primeiro "Já paguei" ficar acima da barra em 360 × 640 e em 320 px (D-039, A8). */}
        {isCurrent && s ? <PaymentsForecastNote contextId={ctx} month={month} /> : null}
        <RemindersLink />
        {/* O critério do total fica aqui embaixo, para o primeiro "Já paguei" caber na primeira tela (D-039, A8). */}
        <Txt variant="label" color={colors.textSecondary}>
          {isCurrent
            ? 'Contas em aberto com vencimento até o fim do mês, inclusive as vencidas de meses anteriores. Ainda não saíram da conta e não entram em Pago nem na diferença do mês.'
            : `Contas com vencimento em ${monthName.toLowerCase()} que continuam em aberto. Não entram em Pago nem na diferença do mês.`}
        </Txt>
        <Txt variant="label" color={colors.textSecondary}>
          Já anotou o pagamento como gasto? Exclua a conta a pagar para ela não continuar em Ainda a pagar.
        </Txt>
        <LinkButton label="O que é previsto e realizado?" color={colors.textSecondary} onPress={() => router.push(explanationHref('realizado-previsto'))} />
        <Pressable accessibilityRole="button" onPress={() => router.push('/quem-ve')} style={styles.privacy}>
          <ShieldCheck size={18} color={colors.textSecondary} />
          <Txt variant="label" color={colors.textSecondary}>
            Quem vê estes dados?
          </Txt>
        </Pressable>
      </Screen>

      {target && targetDraft && account ? (
        <ChoiceDialog
          visible
          title={QUICK_PAY_TEXT.title(target.description)}
          busy={busy}
          cancelLabel={QUICK_PAY_TEXT.cancel}
          // Durante a gravação, o diálogo não fecha (o resultado ainda não chegou).
          onCancel={() => (busy ? undefined : setTarget(null))}
          choices={[
            { label: QUICK_PAY_TEXT.confirm, tone: 'brand', onPress: () => confirmPay(target) },
            {
              label: QUICK_PAY_TEXT.change,
              onPress: () => {
                setTarget(null);
                openPaymentForm(target);
              },
            },
          ]}>
          <MoneyTxt style={[{ fontFamily: fonts.bold }, tabular]}>{QUICK_PAY_TEXT.line(targetDraft.amountCents, targetDraft.paidOn)}</MoneyTxt>
          <Txt color={colors.textSecondary}>
            Um gasto com esse valor entra em Pago de {formatMonthBR(monthOf(targetDraft.paidOn)).toLowerCase()}
            {personal && personal.accounts.length > 1 ? `, saindo da conta ${account.name}` : ''}, e a conta sai de Ainda a pagar.
          </Txt>
        </ChoiceDialog>
      ) : null}
    </View>
  );
}

/**
 * Seletor de mês local, na mesma linha de "Pessoal · outubro de 2026" (poupa altura: o primeiro "Já paguei" continua à
 * vista). Fora do mês atual, "Voltar para outubro de 2026". Volta sem limite e avança até 12 meses à frente (core: payablesStep).
 */
function PayablesMonthPicker({ month, currentMonth, onChange }: { month: IsoMonth; currentMonth: IsoMonth; onChange: (m: IsoMonth) => void }) {
  const prev = payablesStep(month, currentMonth, -1);
  const next = payablesStep(month, currentMonth, 1);
  return (
    <View style={{ gap: space[1] }}>
      <View style={styles.monthRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={prev ? PAYABLES_NAV_TEXT.previous(prev) : 'Mês anterior'}
          accessibilityState={{ disabled: !prev }}
          disabled={!prev}
          hitSlop={4}
          onPress={() => prev && onChange(prev)}
          style={(st) => [styles.monthBtn, !prev && { opacity: 0.35 }, prev && (st as { focused?: boolean }).focused && styles.focusRing]}>
          <ChevronLeft size={22} color={colors.brand} />
        </Pressable>
        <Txt variant="caption" color={colors.textSecondary} style={{ flex: 1, textAlign: 'center' }} accessibilityLiveRegion="polite">
          Pessoal · {formatMonthBR(month)}
        </Txt>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={next ? PAYABLES_NAV_TEXT.next(next) : 'Próximo mês'}
          accessibilityState={{ disabled: !next }}
          disabled={!next}
          hitSlop={4}
          onPress={() => next && onChange(next)}
          style={(st) => [styles.monthBtn, !next && { opacity: 0.35 }, next && (st as { focused?: boolean }).focused && styles.focusRing]}>
          <ChevronRight size={22} color={colors.brand} />
        </Pressable>
      </View>
      {month !== currentMonth ? (
        <LinkButton label={PAYABLES_NAV_TEXT.backToCurrent(currentMonth)} style={styles.inlineLink} onPress={() => onChange(currentMonth)} />
      ) : null}
    </View>
  );
}

/**
 * Lembretes onde a pessoa pensa em vencimento (D-025, D-039): leva ao card de lembretes de Conta, onde ficam o interruptor e o
 * horário. Só aparece onde ajuda (`showsRemindersLink`): no app de celular, fora da demonstração, com os lembretes desligados e
 * antes de a oferta depois do primeiro gasto fixo ser respondida. Depois da lista, para não empurrar o primeiro "Já paguei".
 */
function RemindersLink() {
  const { user, auth } = useSession();
  const prefs = useDevicePrefs(user?.id);
  const visible = showsRemindersLink({
    deviceFeatures: DEVICE_FEATURES,
    demo: auth.mode === 'demo',
    prefsLoaded: prefs !== undefined,
    remindersOn: prefs?.reminders ?? false,
    offerShown: prefs?.reminderOffered ?? false,
  });
  useEffect(() => {
    if (user?.id && DEVICE_FEATURES) loadPrefs(user.id, auth.mode !== 'demo');
  }, [user?.id, auth.mode]);
  if (!visible) return null;
  const t = PAYABLES_NAV_TEXT.reminders;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${t.title}. ${t.caption}`}
      onPress={() => router.push(REMINDERS_SETTINGS_HREF as Href)}
      style={(st) => [styles.remindersLink, st.pressed && { opacity: 0.7 }, (st as { focused?: boolean }).focused && styles.focusRing]}>
      <Bell size={20} color={colors.brand} strokeWidth={2.25} aria-hidden />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant="label" color={colors.brand} style={{ fontFamily: fonts.bold, fontSize: 16 }}>
          {t.title}
        </Txt>
        <Txt variant="caption" color={colors.textSecondary}>
          {t.caption}
        </Txt>
      </View>
      <ChevronRight size={20} color={colors.textSecondary} aria-hidden />
    </Pressable>
  );
}

/**
 * "Se pagar tudo o que está em aberto, os pagamentos de outubro chegam a R$ X" (Pago do mês mais Ainda a pagar) e, se
 * houver, "Inclui R$ Y estimados". Informativo: sem "disponível", "sobra" nem "Diferença". Sem nada em aberto, nada aparece;
 * falha de carga mostra o erro, nunca um valor.
 */
function PaymentsForecastNote({ contextId, month }: { contextId: string | undefined; month: IsoMonth }) {
  const forecast = usePaymentsForecast(contextId, month);
  const mask = useMoneyMask();
  if (forecast.isPending) return null;
  if (forecast.isError) return <ErrorState message={ERROR_TEXT.carregar_falhou} onRetry={() => forecast.refetch()} />;
  const f = forecast.data;
  if (!f) return null;
  return (
    <Banner tone="info" icon={CalendarClock} live={false}>
      <Txt variant="label" style={tabular} accessibilityLabel={mask.label(f.text)}>
        {mask.text(f.text)}
      </Txt>
      {f.estimatedText ? (
        <Txt variant="caption" color={colors.textSecondary} accessibilityLabel={mask.label(f.estimatedText)}>
          {mask.text(f.estimatedText)}
        </Txt>
      ) : null}
    </Banner>
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
  monthRow: { flexDirection: 'row', alignItems: 'center', gap: space[1], marginHorizontal: -space[2] },
  monthBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  remindersLink: { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 56, paddingHorizontal: space[4], paddingVertical: space[2], borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  seriesLink: { flexDirection: 'row', alignItems: 'center', alignSelf: 'center', gap: space[2], minHeight: 44, paddingHorizontal: space[2], borderRadius: radius.sm },
  focusRing: { outlineWidth: 3, outlineColor: colors.brand, outlineStyle: 'solid', outlineOffset: 2 } as object,
});
