import {
  RETURN_TEXT,
  batchEligible,
  groupActions,
  lastClosedMonth,
  notHappenedDialog,
  returnErrorText,
  reviewDecision,
  reviewExpectedVersion,
  reviewStepTitle,
  rowPaymentDraft,
  rowShortName,
  type FinancialRecord,
  type IsoMonth,
  type PaymentInput,
  type ReturnReview,
  type ReviewAction,
  type ReviewAnnualGroup,
  type ReviewItem,
  type ReviewRow,
  type ReviewStep,
  type YearPlan,
} from '@clarevo/core';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import { router, useFocusEffect, useLocalSearchParams, useNavigation } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { AlertCircle, ArrowDownLeft, ArrowUpRight, Check, ListChecks } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, findNodeHandle, Platform, StyleSheet, View, type ScrollView } from 'react-native';
import Animated, { FadeInRight, ReduceMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChoiceDialog } from '@/components/choice-dialog';
import { ConfirmDialog } from '@/components/dialog';
import { FlashBanner, useFlash } from '@/components/flash';
import { ContextPill, SubHeader } from '@/components/header';
import {
  PayRowError,
  codeOf,
  findLiveRow,
  isConflict,
  isUncertain,
  openRowFrom,
  returnSession,
  useReturnWriter,
  type RowOutcome,
} from '@/components/retorno-acoes';
import { ReturnRow, rowLayout } from '@/components/retorno-linha';
import { yearA11y, yearA11yLabel } from '@/components/series-parts';
import { EmptyState, ErrorState } from '@/components/states';
import { Banner, Button, Card, Chip, LinkButton, Screen, Skeleton, Txt } from '@/components/ui';
import { announceOnIOS } from '@/lib/a11y';
import { flash } from '@/lib/flash';
import { useReturnReview, useSeriesList, useSpace, type ReturnReviewData } from '@/state/data';
import { useRepo, useSession } from '@/state/session';
import { colors, fonts, motion, space, tabular } from '@/theme/tokens';

/** Espera para o anúncio no iOS: o diálogo de confirmação fecha e o VoiceOver volta à lista antes. */
const ANNOUNCE_DELAY = 500;

/** Troca de passo desliza com motion.context (200 ms), respeitando "reduzir movimento" (CL-V008). */
const stepIn = FadeInRight.duration(motion.context).reduceMotion(ReduceMotion.System);

/** O que o passo mostra: congelado ao começar a sessão, para "Mês 2 de 5" e as linhas resolvidas não mudarem de lugar. */
interface Frozen {
  items: ReviewItem[];
  loose: ReviewRow[];
}

interface Session {
  steps: ReviewStep[];
  frozen: Record<IsoMonth, Frozen>;
}

type Pending =
  | { type: 'pagar'; row: ReviewRow }
  | { type: 'nao_houve'; row: ReviewRow }
  | { type: 'ano'; group: ReviewAnnualGroup; plan: Extract<YearPlan, { ok: true }> }
  | { type: 'lote'; rows: ReviewRow[] }
  | null;

function sessionFrom(review: ReturnReview): Session {
  const frozen: Record<IsoMonth, Frozen> = {};
  for (const step of review.steps) {
    if (step.current) frozen[step.month] = { items: review.current.items, loose: review.current.loose };
    else {
      const m = review.months.find((x) => x.month === step.month);
      frozen[step.month] = { items: m?.items ?? [], loose: m?.loose ?? [] };
    }
  }
  return { steps: review.steps, frozen };
}

/** Linhas do passo, na ordem da tela (grupos de conta do ano com as linhas por baixo). */
const stepRows = (f: Frozen): ReviewRow[] => [...f.items.flatMap((i) => (i.type === 'linha' ? [i.row] : i.group.rows)), ...f.loose];

/**
 * /retomar/atualizar · Atualizar meses (D-030(5)): passos só para os meses com algo a conferir, do mais antigo ao mais
 * recente, e por fim "Este mês". Por conta, "Já paguei", "Não houve" e "Ainda não paguei"; por mês, anotar recebimentos e
 * gastos no modo "Dia"; marcação em lote, no vencimento, só para valor fixo. Nada é preenchido sem confirmação, e uma
 * linha só aparece resolvida depois da resposta do servidor. "Concluir" grava a decisão ('atualizou' se houve ação na
 * sessão, senão 'seguiu'); sair por "Voltar" não grava nada. ?mes=AAAA-MM abre direto num mês.
 */
export default function AtualizarMeses() {
  const { mes } = useLocalSearchParams<{ mes?: string }>();
  const { today } = useSession();
  const repo = useRepo();
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const personal = useSpace().data;
  const ctx = personal?.personalContextId;
  const query = useReturnReview(ctx);
  const seriesList = useSeriesList(ctx);
  const writer = useReturnWriter();
  const [notice, setNotice] = useFlash();
  const review = query.data?.review ?? null;

  const [session, setSession] = useState<Session | null>(null);
  const [index, setIndex] = useState(0);
  /** Dados atuais de uma linha (versão nova, conta criada, desfeita); chave da linha congelada. */
  const [rowData, setRowData] = useState<Record<string, ReviewRow>>({});
  const [outcomes, setOutcomes] = useState<Record<string, RowOutcome>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [closedRows, setClosedRows] = useState<Record<string, true>>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [actedIn, setActedIn] = useState<Record<IsoMonth, true>>({});
  const [acted, setActed] = useState(false);
  const [skipped, setSkipped] = useState(false);
  const [pending, setPending] = useState<Pending>(null);
  const [result, setResult] = useState<{ tone: 'sucesso' | 'erro'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [accountChoice, setAccountChoice] = useState<string | null>(null);
  /** Conta em aberto paga no formulário de pagamento ("Mudar valor ou data" ou valor estimado): conferida na volta. */
  const checkOnReturn = useRef<{ rowKey: string; commitmentId: string } | null>(null);
  const scroll = useRef<ScrollView>(null);
  const titleRef = useRef<View>(null);

  // A sessão começa com a revisão carregada; o canal com as outras telas começa vazio.
  useEffect(() => {
    returnSession.start();
  }, []);
  if (!session && review && !review.isEmpty) {
    const s = sessionFrom(review);
    setSession(s);
    const start = s.steps.findIndex((st) => st.month === mes);
    if (start > 0) setIndex(start);
  }

  const steps = session?.steps ?? [];
  const step = steps[index] ?? null;
  const frozen = step && session ? session.frozen[step.month] : null;
  // Registros de cada mês das linhas do passo (o grupo de conta do ano traz linhas de meses seguintes), para o aviso de gasto solto.
  const rowMonths = frozen ? [...new Set(stepRows(frozen).map((r) => r.month))] : [];
  const monthQueries = useQueries({
    queries: rowMonths.map((m) => ({ queryKey: ['records', ctx, m], queryFn: () => repo.listRecords(ctx!, m), enabled: Boolean(ctx) })),
  });
  const recordsOf = (month: IsoMonth): readonly FinancialRecord[] | undefined => monthQueries[rowMonths.indexOf(month)]?.data;
  const account = personal?.accounts.find((a) => a.id === accountChoice) ?? personal?.accounts[0] ?? null;
  const view = (r: ReviewRow) => rowData[r.key] ?? r;
  const last = index === steps.length - 1;

  const markActed = (month: IsoMonth) => {
    setActed(true);
    setActedIn((cur) => ({ ...cur, [month]: true }));
  };
  const resolve = (row: ReviewRow, outcome: RowOutcome, announce: string) => {
    setOutcomes((cur) => ({ ...cur, [row.key]: outcome }));
    setNotes(({ [row.key]: _gone, ...rest }) => rest);
    setSelected((cur) => cur.filter((k) => k !== row.key));
    setResult({ tone: 'sucesso', text: announce });
    markActed(step?.month ?? row.month);
  };
  const note = (row: ReviewRow, text: string) => setNotes((cur) => ({ ...cur, [row.key]: text }));
  /** Falha de uma linha: aparece abaixo dela e, no iOS (sem região viva), é anunciada. */
  const warn = (row: ReviewRow, text: string) => {
    note(row, text);
    announceOnIOS(text, { delay: ANNOUNCE_DELAY });
  };
  // Resultado do rodapé (conta paga, não houve, lote, falhas): no iOS o texto que aparece sozinho é anunciado uma vez.
  useEffect(() => {
    if (result) announceOnIOS(result.text, { delay: ANNOUNCE_DELAY });
  }, [result]);

  /** Revisão recarregada do servidor (para "a lista foi atualizada"); null se não houver mais revisão ativa. */
  const freshReview = async (): Promise<ReturnReview | null> => {
    const key = ['returnReview', ctx, today];
    await qc.refetchQueries({ queryKey: key });
    return qc.getQueryData<ReturnReviewData>(key)?.review ?? null;
  };

  /**
   * Recusa porque algo mudou em outro aparelho: recarrega a linha e mostra o texto do código. Conta já paga em outro
   * aparelho aparece como paga; linha que saiu da revisão fica sem ações.
   */
  const reloadRow = async (row: ReviewRow, e: unknown, speak = true) => {
    const text = returnErrorText(codeOf(e));
    const say = speak ? warn : note;
    try {
      const current = view(row);
      if (current.commitment && (isRepoCode(e, 'compromisso_quitado') || isRepoCode(e, 'versao_desatualizada'))) {
        const c = await repo.getCommitment(current.commitment.id);
        if (c?.status === 'quitado') {
          resolve(row, { type: 'paga', commitment: c }, RETURN_TEXT.announcePaid(rowShortName(row)));
          return;
        }
      }
      const live = findLiveRow(await freshReview(), current);
      if (live) setRowData((cur) => ({ ...cur, [row.key]: live }));
      else setClosedRows((cur) => ({ ...cur, [row.key]: true }));
      say(row, text);
    } catch {
      say(row, text);
    }
  };

  /** Falha de uma ação de linha: rede (repetir é seguro), conflito (recarrega) ou recusa (texto do código). */
  const failed = async (row: ReviewRow, e: unknown) => {
    if (isUncertain(e)) {
      warn(row, RETURN_TEXT.saveFailed);
      return;
    }
    if (isConflict(e)) {
      await reloadRow(row, e);
      return;
    }
    warn(row, returnErrorText(codeOf(e)));
  };

  const inputFor = (row: ReviewRow): PaymentInput => {
    const draft = rowPaymentDraft(row);
    return { accountId: account!.id, amountCents: row.amountCents, paidOn: draft.paidOn, category: draft.category };
  };

  /** "Já paguei" com valor fixo, no vencimento: em aberto, paga; sem conta registrada, registra e paga. */
  const payOne = async (row: ReviewRow): Promise<boolean> => {
    const current = view(row);
    try {
      const paid = await writer.payRow(current, inputFor(current));
      resolve(row, { type: 'paga', commitment: paid }, RETURN_TEXT.announcePaid(rowShortName(row)));
      return true;
    } catch (e) {
      const err = e instanceof PayRowError ? e : new PayRowError(e, null);
      if (err.created) {
        // A conta foi registrada e o pagamento não: ela fica em aberto (estado verdadeiro); "Já paguei" de novo só paga.
        setRowData((cur) => ({ ...cur, [row.key]: openRowFrom(current, err.created!) }));
        markActed(step?.month ?? row.month);
        if (!isUncertain(err.cause) && isConflict(err.cause)) await reloadRow(row, err.cause);
        else warn(row, RETURN_TEXT.partialFailure(row.month));
        return false;
      }
      await failed(row, err.cause);
      return false;
    }
  };

  const run = async (fn: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    setResult(null);
    try {
      await fn();
    } finally {
      setBusy(false);
      setPending(null);
    }
  };

  const onAction = (row: ReviewRow, action: ReviewAction) => {
    const current = view(row);
    if (action === 'ja_paguei') {
      if (!current.amountIsEstimate) {
        setPending({ type: 'pagar', row });
        return;
      }
      openPaymentForm(row);
      return;
    }
    if (action === 'nao_houve') {
      setPending({ type: 'nao_houve', row });
      return;
    }
    // "Ainda não paguei": sem diálogo; a linha passa a "Registrada em aberto".
    run(async () => {
      try {
        const c = await writer.stillOpen(current);
        resolve(row, { type: 'registrada', commitment: c }, RETURN_TEXT.announceStillOpen(rowShortName(row)));
      } catch (e) {
        await failed(row, e);
      }
    });
  };

  /** Valor que muda (abre vazio) ou "Mudar valor ou data": formulário de pagamento, com a data no vencimento. */
  const openPaymentForm = (row: ReviewRow) => {
    const current = view(row);
    const created = current.commitment ?? writer.createdFor(row.key);
    if (created) {
      checkOnReturn.current = { rowKey: row.key, commitmentId: created.id };
      router.push({ pathname: '/a-pagar/[id]/pagar', params: { id: created.id, data: 'vencimento' } });
      return;
    }
    if (!current.series) return;
    router.push({ pathname: '/retomar/pagar', params: { serie: current.series.id, numero: String(current.series.number) } });
  };

  /**
   * Na volta de outra tela (pagamento, modo "Dia"), as linhas do passo sem resultado são conferidas na revisão
   * recarregada: uma conta registrada ou paga em outro aparelho, ou pela tela de pagamento, deixa de ser "sem conta
   * registrada" aqui, em vez de repetir uma ação que o servidor já recusou.
   */
  const refreshRows = async (resolvedNow: ReadonlySet<string>) => {
    if (!frozen) return;
    const stale = stepRows(frozen).filter((r) => !outcomes[r.key] && !closedRows[r.key] && !resolvedNow.has(r.key));
    if (stale.length === 0) return;
    try {
      const fresh = await freshReview();
      if (!fresh) return;
      const changes: Record<string, ReviewRow> = {};
      for (const r of stale) {
        const cur = view(r);
        const live = findLiveRow(fresh, cur);
        if (!live) continue;
        const same =
          live.key === cur.key &&
          live.state === cur.state &&
          live.commitment?.id === cur.commitment?.id &&
          live.commitment?.version === cur.commitment?.version;
        if (!same) changes[r.key] = live;
      }
      if (Object.keys(changes).length > 0) setRowData((cur) => ({ ...cur, ...changes }));
    } catch {
      // Sem a revisão nova, as linhas ficam como estão: uma ação recusada recarrega a linha do mesmo jeito.
    }
  };
  const latestRefresh = useRef(refreshRows);
  useEffect(() => {
    latestRefresh.current = refreshRows;
  });
  const leftScreen = useRef(false);
  useEffect(
    () =>
      navigation.addListener('blur', () => {
        leftScreen.current = true;
      }),
    [navigation],
  );

  // Na volta das telas de pagamento e do modo "Dia": aplica o que foi confirmado lá (é uma ação do passo atual).
  const stepMonth = step?.month ?? null;
  useFocusEffect(
    useCallback(() => {
      const taken = returnSession.take();
      const actedHere = () => {
        setActed(true);
        if (stepMonth) setActedIn((cur) => ({ ...cur, [stepMonth]: true }));
      };
      if (leftScreen.current) {
        leftScreen.current = false;
        latestRefresh.current(new Set(taken.outcomes.map(([rowKey]) => rowKey)));
      }
      if (taken.acted || taken.outcomes.length > 0) actedHere();
      for (const [rowKey, outcome] of taken.outcomes) {
        setOutcomes((cur) => ({ ...cur, [rowKey]: outcome }));
        setNotes(({ [rowKey]: _gone, ...rest }) => rest);
        setSelected((cur) => cur.filter((k) => k !== rowKey));
      }
      const check = checkOnReturn.current;
      checkOnReturn.current = null;
      if (check) {
        repo
          .getCommitment(check.commitmentId)
          .then((c) => {
            if (c?.status !== 'quitado') return;
            setOutcomes((cur) => ({ ...cur, [check.rowKey]: { type: 'paga', commitment: c } }));
            setNotes(({ [check.rowKey]: _gone, ...rest }) => rest);
            setSelected((cur) => cur.filter((k) => k !== check.rowKey));
            actedHere();
          })
          .catch(() => {});
      }
    }, [repo, stepMonth]),
  );

  // Ao trocar de passo: rolagem no topo e foco no título do mês.
  useEffect(() => {
    scroll.current?.scrollTo({ y: 0, animated: false });
    const node = titleRef.current;
    if (!node) return;
    if (Platform.OS === 'web') {
      // Na web, o passo que entra com FadeInRight fica invisível até a animação começar, e um elemento invisível não
      // recebe foco: tenta a cada quadro, por pouco tempo, até o título estar com o foco.
      const el = node as unknown as HTMLElement;
      let tries = 0;
      let frame = 0;
      const tryFocus = () => {
        el.focus?.();
        if (document.activeElement !== el && tries++ < 30) frame = requestAnimationFrame(tryFocus);
      };
      tryFocus();
      return () => cancelAnimationFrame(frame);
    } else {
      const handle = findNodeHandle(node);
      if (handle) AccessibilityInfo.setAccessibilityFocus(handle);
    }
  }, [index]);

  const goTo = (i: number) => {
    setSelected([]);
    setResult(null);
    // O aviso da tela anterior ("Anotado: ...") é do passo que ficou para trás.
    setNotice(null);
    setIndex(i);
  };

  /** skipNow: o passo atual termina sem nenhuma ação ("Concluir" no último passo sem ação, ou "Concluir agora"). */
  const conclude = async (skipNow: boolean) => {
    const state = query.data?.state;
    if (busy || !ctx) return;
    if (!state) {
      setResult({ tone: 'erro', text: RETURN_TEXT.decideFailed });
      return;
    }
    setBusy(true);
    setResult(null);
    // "O que você pulou": mês pulado, passos não vistos ou algo que continua sem registro na revisão recarregada.
    const skippedSomething = skipped || skipNow || Boolean(review && !review.isEmpty);
    try {
      await writer.decide({
        contextId: ctx,
        expectedVersion: reviewExpectedVersion(state),
        reviewedThrough: lastClosedMonth(today),
        decision: reviewDecision(acted),
      });
      // Um único retorno tátil, ao concluir.
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      flash.set(RETURN_TEXT.finished(skippedSomething));
      router.dismissTo('/');
    } catch (e) {
      setResult({ tone: 'erro', text: !isUncertain(e) && isConflict(e) ? returnErrorText(codeOf(e)) : RETURN_TEXT.decideFailed });
      if (!isUncertain(e)) query.refetch();
    } finally {
      setBusy(false);
    }
  };

  const next = () => {
    if (!step) return;
    const skippedHere = !actedIn[step.month];
    if (last) {
      conclude(skippedHere);
      return;
    }
    if (skippedHere) setSkipped(true);
    goTo(index + 1);
  };

  const askYear = async (group: ReviewAnnualGroup) => {
    const series = seriesList.data?.find((s) => s.id === group.seriesId);
    if (!series || busy) return;
    setBusy(true);
    setResult(null);
    try {
      const plan = await writer.yearPlan(group, series);
      if (plan.ok) setPending({ type: 'ano', group, plan });
      else setResult({ tone: 'erro', text: 'text' in plan ? plan.text : RETURN_TEXT.saveFailed });
    } catch {
      setResult({ tone: 'erro', text: RETURN_TEXT.loadFailed });
    } finally {
      setBusy(false);
    }
  };

  // Lote: linhas de valor fixo do passo, a conferir e selecionadas.
  const eligible = frozen ? stepRows(frozen).filter((r) => !outcomes[r.key] && !closedRows[r.key] && batchEligible(view(r))) : [];
  const chosen = eligible.filter((r) => selected.includes(r.key));

  const payBatch = (rows: ReviewRow[]) =>
    run(async () => {
      let done = 0;
      for (const row of rows) {
        const current = view(row);
        try {
          const paid = await writer.payRow(current, inputFor(current));
          setOutcomes((cur) => ({ ...cur, [row.key]: { type: 'paga', commitment: paid } }));
          setNotes(({ [row.key]: _gone, ...rest }) => rest);
          setSelected((cur) => cur.filter((k) => k !== row.key));
          markActed(step?.month ?? row.month);
          done += 1;
        } catch (e) {
          // Para na primeira falha; as anteriores continuam pagas (nada é desfeito em silêncio).
          const err = e instanceof PayRowError ? e : new PayRowError(e, null);
          if (err.created) {
            setRowData((cur) => ({ ...cur, [row.key]: openRowFrom(current, err.created!) }));
            markActed(step?.month ?? row.month);
            note(row, RETURN_TEXT.partialFailure(row.month));
          } else if (!isUncertain(err.cause) && isConflict(err.cause)) await reloadRow(row, err.cause, false);
          const conflict = isRepoCode(err.cause, 'versao_desatualizada') || isRepoCode(err.cause, 'ocorrencia_existente');
          setResult({ tone: 'erro', text: RETURN_TEXT.batchPartial(done, rows.length, rowShortName(row), conflict) });
          return;
        }
      }
      setResult({ tone: 'sucesso', text: RETURN_TEXT.batchDone(done) });
    });

  const overview = step && !step.current ? (review?.months.find((m) => m.month === step.month)?.overview ?? null) : null;

  const renderRow = (row: ReviewRow, isLast: boolean, inGroup = false) => (
    <ReturnRow
      key={row.key}
      row={view(row)}
      outcome={outcomes[row.key] ?? null}
      note={notes[row.key] ?? null}
      closed={Boolean(closedRows[row.key])}
      monthRecords={recordsOf(row.month)}
      selectable
      selected={selected.includes(row.key)}
      onToggle={() => setSelected((cur) => (cur.includes(row.key) ? cur.filter((k) => k !== row.key) : [...cur, row.key]))}
      onAction={(a) => onAction(row, a)}
      onUndo={(o) =>
        run(async () => {
          try {
            const reopened = await writer.undoPaid(o.commitment);
            setOutcomes(({ [row.key]: _gone, ...rest }) => rest);
            setRowData((cur) => ({ ...cur, [row.key]: openRowFrom(view(row), reopened) }));
            setResult({ tone: 'sucesso', text: 'Pagamento desfeito' });
          } catch (e) {
            warn(row, isUncertain(e) ? RETURN_TEXT.saveFailed : returnErrorText(codeOf(e)));
          }
        })
      }
      busy={busy}
      inGroup={inGroup}
      last={isLast}
    />
  );

  const renderGroup = (group: ReviewAnnualGroup, isLast: boolean) => {
    const open = group.rows.filter((r) => !outcomes[r.key] && !closedRows[r.key]);
    return (
      <Animated.View key={group.key} layout={rowLayout} style={[styles.group, !isLast && styles.divider]}>
        <View style={{ gap: space[2] }}>
          <Txt variant="label" style={{ fontFamily: fonts.bold, fontSize: 15 }} accessibilityRole="header" aria-level={3} accessibilityLabel={yearA11y(group.a11yLabel)}>
            {group.text}
          </Txt>
          {groupActions(group).includes('nao_houve_ano') && open.length > 0 ? (
            <Button
              label={RETURN_TEXT.notHappenedYear(group.label)}
              accessibilityLabel={`${RETURN_TEXT.notHappenedButton}: ${group.description} em ${yearA11y(group.label)}`}
              tone="ghost"
              disabled={busy || !seriesList.data}
              style={styles.groupAction}
              onPress={() => askYear(group)}
            />
          ) : null}
        </View>
        {group.rows.map((r, j) => renderRow(r, j === group.rows.length - 1, true))}
      </Animated.View>
    );
  };

  const target = pending && (pending.type === 'pagar' || pending.type === 'nao_houve') ? view(pending.row) : null;
  const dialog = target && pending?.type === 'nao_houve' ? notHappenedDialog(target) : null;
  const resultBanner = result ? (
    <Banner tone={result.tone} icon={result.tone === 'erro' ? AlertCircle : Check}>
      <Txt variant="label" color={result.tone === 'erro' ? colors.error : colors.successText} style={{ fontFamily: fonts.bold }} accessibilityLabel={yearA11yLabel(result.text)}>
        {result.text}
      </Txt>
    </Banner>
  ) : null;
  const accountChips =
    personal && personal.accounts.length > 1 ? (
      <View style={{ gap: space[2] }} accessibilityRole="radiogroup" accessibilityLabel={RETURN_TEXT.batchAccountLabel}>
        <Txt variant="label" style={{ fontFamily: fonts.bold }}>
          {RETURN_TEXT.batchAccountLabel}
        </Txt>
        <View style={styles.chips}>
          {personal.accounts.map((a) => (
            <Chip key={a.id} label={a.name} selected={account?.id === a.id} onPress={() => setAccountChoice(a.id)} />
          ))}
        </View>
      </View>
    ) : null;

  const back = () => (router.canGoBack() ? router.back() : router.replace('/retomar'));

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SubHeader title={RETURN_TEXT.title} onBack={back} right={<ContextPill label="Pessoal" />} />
      <Screen scrollRef={scroll} contentStyle={styles.body}>
        <FlashBanner message={notice} />
        {!session && query.isPending ? (
          <View style={{ gap: space[3] }} accessibilityRole="progressbar" accessibilityLabel="Carregando os meses">
            <Skeleton width="60%" height={26} />
            <Skeleton width="100%" height={140} />
          </View>
        ) : !session && (query.isError || !query.data) ? (
          <ErrorState message={RETURN_TEXT.loadFailed} onRetry={() => query.refetch()} />
        ) : !session || !step || !frozen ? (
          <Card>
            <EmptyState
              title={RETURN_TEXT.emptyTitle}
              art="compromissos"
              action={<Button label={RETURN_TEXT.backToSummary} tone="soft" onPress={() => router.dismissTo('/')} />}>
              {RETURN_TEXT.emptyBody}
            </EmptyState>
          </Card>
        ) : (
          <Animated.View key={step.month} entering={stepIn} style={{ gap: space[4] }}>
            {/* Um só elemento com o mês e o passo: recebe o foco ao trocar de passo. */}
            <View
              ref={titleRef}
              tabIndex={-1}
              accessible
              accessibilityRole="header"
              aria-level={2}
              accessibilityLabel={`${reviewStepTitle(step)}, ${RETURN_TEXT.stepCounter(index + 1, steps.length)}`}
              style={{ gap: 2 }}>
              <Txt variant="title" style={{ fontSize: 22, lineHeight: 30 }}>
                {reviewStepTitle(step)}
              </Txt>
              <Txt variant="label" color={colors.textSecondary}>
                {RETURN_TEXT.stepCounter(index + 1, steps.length)}
              </Txt>
            </View>

            {frozen.items.length > 0 ? (
              <Card>
                <Txt variant="title" accessibilityRole="header" aria-level={3}>
                  {RETURN_TEXT.sectionSeries}
                </Txt>
                {frozen.items.map((item, i) =>
                  item.type === 'linha' ? renderRow(item.row, i === frozen.items.length - 1) : renderGroup(item.group, i === frozen.items.length - 1),
                )}
              </Card>
            ) : null}

            {frozen.loose.length > 0 ? (
              <Card>
                <Txt variant="title" accessibilityRole="header" aria-level={3}>
                  {RETURN_TEXT.sectionLoose}
                </Txt>
                {frozen.loose.map((r, i) => renderRow(r, i === frozen.loose.length - 1))}
              </Card>
            ) : null}

            {!step.current ? (
              <Card style={{ gap: space[2] }}>
                <Txt variant="title" accessibilityRole="header" aria-level={3}>
                  {RETURN_TEXT.sectionRecords}
                </Txt>
                {overview ? (
                  <>
                    <Txt variant="label" style={tabular}>
                      {RETURN_TEXT.receiptsLine(overview)}
                    </Txt>
                    <Txt variant="label" style={tabular}>
                      {RETURN_TEXT.expensesLine(overview)}
                    </Txt>
                  </>
                ) : null}
                <View style={styles.actions}>
                  <Button
                    label={RETURN_TEXT.addReceipts}
                    icon={ArrowDownLeft}
                    tone="soft"
                    disabled={busy}
                    style={styles.action}
                    onPress={() => router.push({ pathname: '/registro/novo', params: { tipo: 'receita', mes: step.month, origem: 'retomar' } })}
                  />
                  <Button
                    label={RETURN_TEXT.addExpenses}
                    icon={ArrowUpRight}
                    tone="soft"
                    disabled={busy}
                    style={styles.action}
                    onPress={() => router.push({ pathname: '/registro/novo', params: { tipo: 'despesa', mes: step.month, origem: 'retomar' } })}
                  />
                </View>
                <Txt variant="caption" color={colors.textSecondary}>
                  {RETURN_TEXT.recordsHint(step.month)}
                </Txt>
              </Card>
            ) : null}
          </Animated.View>
        )}
      </Screen>

      {session && step ? (
        // Rodapé fixo: o lote e o próximo passo ficam sempre visíveis, com o resultado logo acima (anunciado uma vez).
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, space[3]) }]}>
          <View style={styles.footerInner}>
            {resultBanner}
            {chosen.length > 0 ? (
              <Button
                label={RETURN_TEXT.batchButton(chosen.length)}
                icon={ListChecks}
                tone="soft"
                disabled={busy || !account}
                onPress={() => setPending({ type: 'lote', rows: chosen })}
              />
            ) : null}
            <Button
              label={last ? RETURN_TEXT.finish : actedIn[step.month] ? RETURN_TEXT.nextMonth : RETURN_TEXT.skipMonth}
              busy={busy && !pending}
              busyLabel="Salvando…"
              disabled={busy}
              onPress={next}
            />
            {!last ? <LinkButton label={RETURN_TEXT.finishNow} disabled={busy} onPress={() => conclude(!actedIn[step.month] || index < steps.length - 1)} /> : null}
          </View>
        </View>
      ) : null}

      {target && pending?.type === 'pagar' && account ? (
        <ChoiceDialog
          visible
          title={RETURN_TEXT.payTitle}
          cancelLabel={RETURN_TEXT.back}
          busy={busy}
          onCancel={() => setPending(null)}
          choices={[
            { label: RETURN_TEXT.confirm, tone: 'brand', onPress: () => run(() => payOne(pending.row)) },
            {
              label: RETURN_TEXT.payChange,
              onPress: () => {
                setPending(null);
                openPaymentForm(pending.row);
              },
            },
          ]}>
          <Txt style={[{ fontFamily: fonts.bold }, tabular]} accessibilityLabel={yearA11yLabel(RETURN_TEXT.payBody(rowShortName(target), target.amountCents, target.dueOn, account.name))}>
            {RETURN_TEXT.payBody(rowShortName(target), target.amountCents, target.dueOn, account.name)}
          </Txt>
          {accountChips}
        </ChoiceDialog>
      ) : null}

      {target && dialog && pending?.type === 'nao_houve' ? (
        <ConfirmDialog
          visible
          title={dialog.title}
          cancelLabel={RETURN_TEXT.back}
          confirmLabel={dialog.confirm}
          busy={busy}
          onCancel={() => setPending(null)}
          onConfirm={() =>
            run(async () => {
              try {
                await writer.notHappened(target);
                resolve(pending.row, { type: 'nao_houve' }, RETURN_TEXT.announceNotHappened(rowShortName(target)));
              } catch (e) {
                await failed(pending.row, e);
              }
            })
          }>
          <Txt style={[{ fontFamily: fonts.bold }, tabular]}>{dialog.line}</Txt>
          <Txt color={colors.textSecondary}>{dialog.body}</Txt>
        </ConfirmDialog>
      ) : null}

      {pending?.type === 'ano' ? (
        <ConfirmDialog
          visible
          title={pending.plan.title}
          cancelLabel={RETURN_TEXT.back}
          confirmLabel="Tirar parcelas"
          busy={busy}
          onCancel={() => setPending(null)}
          onConfirm={() =>
            run(async () => {
              const { group, plan } = pending;
              try {
                await writer.skipYear(group, plan);
                const changing = new Set(plan.changing.map((c) => c.id));
                setOutcomes((cur) => {
                  const nextOutcomes = { ...cur };
                  for (const r of group.rows) if (!cur[r.key] && view(r).commitment && changing.has(view(r).commitment!.id)) nextOutcomes[r.key] = { type: 'nao_houve' };
                  return nextOutcomes;
                });
                setSelected((cur) => cur.filter((k) => !group.rows.some((r) => r.key === k)));
                setResult({ tone: 'sucesso', text: plan.doneText });
                markActed(step?.month ?? group.rows[0]!.month);
              } catch (e) {
                setResult({ tone: 'erro', text: isUncertain(e) ? RETURN_TEXT.saveFailed : returnErrorText(codeOf(e)) });
                if (!isUncertain(e)) await freshReview().catch(() => null);
              }
            })
          }>
          <Txt color={colors.textSecondary} accessibilityLabel={yearA11yLabel(pending.plan.text)}>
            {pending.plan.text}
          </Txt>
        </ConfirmDialog>
      ) : null}

      {pending?.type === 'lote' && account ? (
        <ConfirmDialog
          visible
          title={RETURN_TEXT.batchTitle(pending.rows.length)}
          cancelLabel={RETURN_TEXT.back}
          confirmLabel={RETURN_TEXT.batchConfirm(pending.rows.length)}
          confirmTone="brand"
          busy={busy}
          onCancel={() => setPending(null)}
          onConfirm={() => payBatch(pending.rows)}>
          <Txt style={tabular} accessibilityLabel={yearA11yLabel(RETURN_TEXT.batchBody(pending.rows.map(view), accountChips ? null : account.name))}>
            {RETURN_TEXT.batchBody(pending.rows.map(view), accountChips ? null : account.name)}
          </Txt>
          {accountChips}
        </ConfirmDialog>
      ) : null}
    </View>
  );
}

/** isRepoError por código, sem importar a classe aqui. */
function isRepoCode(e: unknown, code: string): boolean {
  return codeOf(e) === code;
}

const styles = StyleSheet.create({
  body: { padding: space[5], gap: space[4], paddingBottom: space[6] },
  group: { paddingTop: space[3] },
  groupAction: { alignSelf: 'flex-start' },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  action: { alignSelf: 'auto', flexGrow: 1, flexBasis: 160 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  footer: { backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space[3], paddingHorizontal: space[5] },
  footerInner: { width: '100%', maxWidth: 560, alignSelf: 'center', gap: space[2] },
});
