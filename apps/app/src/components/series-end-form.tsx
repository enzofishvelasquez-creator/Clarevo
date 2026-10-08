import {
  ERROR_TEXT,
  PAYMENT_ERROR_TEXT,
  PAYMENT_FIELD_ORDER,
  SERIES_ERROR_TEXT,
  MAX_RECORD_CENTS,
  addDays,
  addMonths,
  affectedByEnd,
  centsToInput,
  currentTerm,
  fieldForErrorCode,
  formatBRL,
  formatDateBR,
  formatMonthName,
  formatMonthYearBR,
  isRepoError,
  maskDateBR,
  maskMonthBR,
  mergeOccurrences,
  monthOf,
  newOperationKey,
  numberOfMonth,
  occurrencesToMaterialize,
  parseBRL,
  parseDateBR,
  parseMonthBR,
  seriesCaption,
  seriesDueOn,
  seriesEnded,
  seriesErrorText,
  seriesMonthOf,
  validatePaymentDraft,
  type Commitment,
  type CommitmentSeries,
  type FieldErrors,
  type PaymentDraft,
  type PaymentInput,
  type PersonalSpace,
  type SeriesWrite,
} from '@clarevo/core';
import { useQueryClient } from '@tanstack/react-query';
import { router, useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import * as Haptics from 'expo-haptics';
import { AlertCircle, Check, Info } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, View, type TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ConfirmDialog } from '@/components/dialog';
import { ContextPill, SubHeader } from '@/components/header';
import { CheckOption, ChoiceGroup, joinList, monthChipLabel, seriesStyles as styles } from '@/components/series-parts';
import { Banner, Button, Card, Chip, Screen, TextField, Txt } from '@/components/ui';
import { flash } from '@/lib/flash';
import { totalChange } from '@/lib/highlight';
import {
  useEndSeries,
  usePayCommitment,
  useSeries,
  useSeriesOccurrences,
  useSeriesOpenOccurrences,
  useSeriesOperationKey,
  useUpdateRecord,
} from '@/state/data';
import { useRepo, useSession } from '@/state/session';
import { colors, fonts, space } from '@/theme/tokens';

/** Última conta: um número da série, "sem data para terminar", "Outro mês" (MM/AAAA) ou nada escolhido ainda. */
type EndChoice = number | 'sem' | 'outro' | null;

const PAYOFF_FAILED_END = 'Pagamento registrado. Não foi possível encerrar agora. Tente de novo.';

/** "Quitei o restante" numa parcela que a lista atual mostra como paga, sem pagamento novo registrado agora. */
const alreadyPaidText = (n: number) => `A parcela ${n} já está paga, e nenhum pagamento novo foi registrado. Confira e toque em Encerrar de novo.`;

/** Pagamento incerto gravado: em qual parcela, e se é outra que não a escolhida agora. */
type PaySaved = { number: number; moved: boolean } | null;

const paymentText = (code: string) =>
  code in PAYMENT_ERROR_TEXT ? PAYMENT_ERROR_TEXT[code as keyof typeof PAYMENT_ERROR_TEXT] : PAYMENT_ERROR_TEXT.pagar_falhou;

/**
 * Encerrar, retomar ou "Quitei o restante nesta parcela" (D-024, regra 6). Encerrar define a última conta e tira as
 * em aberto depois dela (recusado se houver conta paga depois); retomar recria, dentro da janela, as removidas.
 * "Quitei o restante" faz pay_commitment com o valor informado e só então end_series com esta parcela como a última.
 */
export function SeriesEndForm({ series: opened, space: personal }: { series: CommitmentSeries; space: PersonalSpace }) {
  const { today } = useSession();
  const repo = useRepo();
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const end = useEndSeries();
  const pay = usePayCommitment();
  const updateRecord = useUpdateRecord();
  const keys = useSeriesOperationKey();
  const contextId = personal.personalContextId;
  const live = useSeries(opened.id, contextId);
  const occ = useSeriesOccurrences(opened.id, contextId);
  const openOcc = useSeriesOpenOccurrences(opened.id, contextId);
  const s = live.data ?? opened;
  const occurrences = occ.data ? [...occ.data].reverse() : []; // número crescente, as 60 mais recentes (chips)
  // Conjunto afetado e parcela a quitar: todas as em aberto, também as que não cabem na lista de 60.
  const allOccurrences = mergeOccurrences(occ.data ?? [], openOcc.data ?? []).reverse();
  /** As duas listas carregadas; depois de uma falha ao recarregar, o efeito e a parcela a quitar não são conhecidos. */
  const listsReady = occ.isSuccess && openOcc.isSuccess;
  const parcelada = s.kind === 'parcelada';
  const noun = parcelada ? 'Parcelamento' : 'Gasto fixo';
  // Aberta para retomar: a série já estava encerrada ao abrir a tela (não muda no meio do preenchimento).
  const [resume] = useState(() => seriesEnded(opened, today));
  const currentMonth = monthOf(today);
  const total = s.installmentTotal;

  // Chips de "Qual é a última conta?": do mês anterior (ou da conta mais antiga em aberto) até 6 meses depois da última conta criada.
  const numbers = useMemo(() => {
    const liveNumbers = occurrences.map((c) => c.series!.number);
    const oldestOpen = occurrences.find((c) => c.status === 'aberto')?.series?.number;
    const start = Math.max(s.firstNumber, Math.min(oldestOpen ?? Infinity, numberOfMonth(s, addMonths(currentMonth, -1))));
    const top = Math.max(...liveNumbers, numberOfMonth(s, currentMonth)) + 6;
    const limit = parcelada ? (total ?? 0) : 600;
    const out: number[] = [];
    for (let n = start; n <= Math.min(top, limit); n++) if (n !== s.lastNumber && !s.skippedNumbers.includes(n)) out.push(n);
    return out;
  }, [occ.data, live.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const initialPay: PaymentDraft = { accountId: personal.accounts[0]?.id ?? '', amountText: '', dateText: formatDateBR(today), category: null };
  const initial = useMemo(
    () => ({ choice: (resume ? (parcelada ? (total ?? null) : 'sem') : null) as EndChoice, otherText: '', payoff: false, pay: initialPay }),
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const [choice, setChoice] = useState<EndChoice>(initial.choice);
  const [otherText, setOtherText] = useState('');
  const [payoff, setPayoff] = useState(false);
  const [payDraft, setPayDraft] = useState<PaymentDraft>(initialPay);
  const [payErrors, setPayErrors] = useState<FieldErrors>({});
  const [choiceError, setChoiceError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [retry, setRetry] = useState(false);
  const [busy, setBusy] = useState(false);
  /**
   * "Quitei o restante": o pagamento já foi confirmado; falta só encerrar. moved: o pagamento incerto foi gravado
   * numa parcela diferente da escolhida depois da falha; a pessoa confere e encerra nela.
   */
  const [paidDone, setPaidDone] = useState<{ number: number; moved: boolean } | null>(null);
  const [leaveTo, setLeaveTo] = useState<null | (() => void)>(null);
  const [confirmDiscard, setConfirmDiscard] = useState<null | (() => void)>(null);

  const payKey = useRef(newOperationKey());
  /** Pagamentos com resultado incerto (falha de rede), do mais antigo para o mais recente. */
  const payPending = useRef<{ key: string; snapshot: string }[]>([]);
  const otherRef = useRef<TextInput>(null);
  const payRefs = {
    description: useRef<TextInput>(null),
    amountText: useRef<TextInput>(null),
    dateText: useRef<TextInput>(null),
    accountId: useRef<TextInput>(null),
  };

  const dirty = !paidDone && JSON.stringify({ choice, otherText, payoff, pay: payDraft }) !== JSON.stringify(initial);

  usePreventRemove(dirty && !leaveTo, ({ data }) => {
    setConfirmDiscard(() => () => navigation.dispatch(data.action));
  });

  useEffect(() => {
    if (leaveTo) leaveTo();
  }, [leaveTo]);

  const leave = (fn: () => void) => setLeaveTo(() => fn);
  const goBack = () => (router.canGoBack() ? router.back() : router.replace(`/gastos-fixos/${s.id}`));

  /** Número da última conta escolhida; undefined se ainda não dá para saber (sem escolha ou mês inválido). */
  const chosen: number | null | undefined = (() => {
    // Depois do pagamento de "Quitei o restante", a última conta é a parcela paga.
    if (paidDone) return paidDone.number;
    if (choice === null) return undefined;
    if (choice === 'sem') return null;
    if (choice !== 'outro') return choice;
    const m = parseMonthBR(otherText);
    return m === null ? undefined : numberOfMonth(s, m);
  })();
  const inRange =
    chosen === undefined ||
    (chosen === null ? !parcelada : chosen >= s.firstNumber - 1 && chosen <= (parcelada ? (total ?? 0) : 600));
  const plan = chosen !== undefined && inRange ? affectedByEnd(allOccurrences, s, chosen) : null;
  /** Conta viva do número escolhido, aberta ou paga (null se ainda não foi criada). */
  const chosenOcc = typeof chosen === 'number' ? (allOccurrences.find((c) => c.series!.number === chosen) ?? null) : null;
  // "Quitei o restante" só vale para uma parcela já criada e em aberto: é ela que recebe o pagamento.
  const payTarget: Commitment | null = parcelada && !resume && chosenOcc?.status === 'aberto' ? chosenOcc : null;
  const paying = payoff && payTarget !== null && !paidDone;

  const monthOfNumber = (n: number) => formatMonthName(seriesMonthOf(s, n));
  const chipLabel = (n: number) => {
    const month = monthChipLabel(seriesMonthOf(s, n), today);
    return parcelada ? `${month} (parcela ${n})` : month;
  };

  const setPay = <K extends keyof PaymentDraft>(k: K, v: PaymentDraft[K]) => {
    setPayDraft((d) => ({ ...d, [k]: v }));
    if (k in payErrors) setPayErrors((e) => ({ ...e, [k]: undefined }));
  };

  const pick = (c: EndChoice) => {
    setChoice(c);
    setChoiceError(null);
    if (c === 'outro') setTimeout(() => otherRef.current?.focus(), 0);
  };

  /**
   * Faixa depois de gravar. prevLast = última conta antes desta gravação (guardada no envio: depois de uma falha de
   * conexão, a série recarregada já pode trazer o término novo). Retomar ou estender diz "retomado"; encurtar, mesmo
   * na tela de retomar, diz "encerrado".
   */
  const done = (w: SeriesWrite, last: number | null, prevLast: number | null) => {
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    if (last === null || (prevLast !== null && last > prevLast)) {
      // Retomar: as contas recriadas pela geração (número depois da antiga última conta).
      const before = prevLast ?? Infinity;
      const back = w.occurrences.filter((c) => c.status === 'aberto' && c.series!.number > before).map((c) => formatMonthName(monthOf(c.dueOn)));
      const tail =
        back.length === 0
          ? ''
          : back.length === 1
            ? ` A conta de ${back[0]} voltou para Contas a pagar.`
            : ` As contas de ${joinList(back)} voltaram para Contas a pagar.`;
      flash.set(`${noun} retomado.${tail}`);
    } else {
      flash.set(`${noun} encerrado.`);
    }
    leave(goBack);
  };

  /**
   * Pagamento com resultado incerto: conferir se alguma tentativa foi gravada antes de repetir.
   * - Gravada nesta parcela (target): se o preenchimento mudou, aplica o atual como edição do gasto gerado (nunca há
   *   um segundo pagamento). input null: não edita.
   * - Gravada em outra parcela (a escolha mudou depois da falha): não mexe nela nem encerra em outra; devolve moved.
   * null se nenhuma tentativa foi gravada.
   */
  const reconcilePay = async (target: Commitment | null, input: PaymentInput | null, snapshot: string | null): Promise<PaySaved> => {
    for (const attempt of [...payPending.current].reverse()) {
      const op = await repo.findCommitmentOperation(attempt.key);
      if (!op || op.action !== 'pagar_compromisso' || !op.recordId) continue;
      qc.invalidateQueries({ queryKey: ['commitments'] });
      qc.invalidateQueries({ queryKey: ['series'] });
      qc.invalidateQueries({ queryKey: ['records'] });
      if (target && op.commitmentId === target.id) {
        const expense = await repo.getRecord(op.recordId);
        if (expense && input && attempt.snapshot !== snapshot) {
          await updateRecord.mutateAsync({
            key: newOperationKey(),
            id: expense.id,
            version: expense.version,
            input: { accountId: input.accountId, amountCents: input.amountCents, occurredOn: input.paidOn, description: expense.description, category: input.category },
          });
        }
        payPending.current = [];
        payKey.current = newOperationKey();
        return { number: target.series!.number, moved: false };
      }
      const paid = allOccurrences.find((c) => c.id === op.commitmentId) ?? (await repo.getCommitment(op.commitmentId));
      const number = paid?.series?.number;
      if (number === undefined) continue;
      payPending.current = [];
      payKey.current = newOperationKey();
      return { number, moved: true };
    }
    return null;
  };

  /** O pagamento incerto foi gravado em outra parcela: a última conta passa a ser ela, e a pessoa confirma o encerramento. */
  const paidElsewhere = (n: number) => {
    setPaidDone({ number: n, moved: true });
    setChoice(n);
    setChoiceError(null);
    setRetry(false);
  };

  /** Passo 1 de "Quitei o restante": pagar a parcela escolhida. true quando o pagamento está confirmado. */
  const payStep = async (target: Commitment): Promise<boolean> => {
    const v = validatePaymentDraft({ ...payDraft, category: target.category }, today);
    if (!v.ok) {
      setPayErrors(v.errors);
      const first = PAYMENT_FIELD_ORDER.find((f) => v.errors[f]);
      if (first) payRefs[first].current?.focus();
      return false;
    }
    setPayErrors({});
    const snapshot = JSON.stringify([v.input, target.id, target.version]);
    try {
      if (payPending.current.length > 0) {
        const saved = await reconcilePay(target, v.input, snapshot);
        if (saved?.moved) {
          paidElsewhere(saved.number);
          return false;
        }
        if (saved) {
          setPaidDone({ number: saved.number, moved: false });
          totalChange.set({ total: 'pago', month: monthOf(v.input.paidOn), deltaCents: v.input.amountCents });
          return true;
        }
        const last = payPending.current[payPending.current.length - 1];
        if (!last || last.snapshot !== snapshot) payKey.current = newOperationKey();
      }
      const key = payKey.current;
      try {
        await pay.mutateAsync({ key, id: target.id, version: target.version, input: v.input });
        payPending.current = [];
        payKey.current = newOperationKey();
        setPaidDone({ number: target.series!.number, moved: false });
        totalChange.set({ total: 'pago', month: monthOf(v.input.paidOn), deltaCents: v.input.amountCents });
        return true;
      } catch (e) {
        if (isRepoError(e) && e.code !== 'rede' && e.code !== 'desconhecido') {
          payKey.current = newOperationKey();
          setRetry(false);
          const field = fieldForErrorCode(e.code);
          if (field && PAYMENT_FIELD_ORDER.includes(field)) {
            setPayErrors({ [field]: paymentText(e.code) });
            payRefs[field].current?.focus();
            return false;
          }
          if (e.code === 'versao_desatualizada' || e.code === 'compromisso_quitado' || e.code === 'nao_encontrado') {
            occ.refetch();
            openOcc.refetch();
            setBanner(e.code === 'compromisso_quitado' ? PAYMENT_ERROR_TEXT.ja_paga_em_outro_aparelho : paymentText(e.code));
            return false;
          }
          setBanner(paymentText(e.code));
          return false;
        }
        // Falha de rede: o pagamento pode ou não ter sido gravado. Guardar a tentativa para reconciliar.
        payPending.current = [...payPending.current, { key, snapshot }];
        qc.invalidateQueries({ queryKey: ['commitments'] });
        qc.invalidateQueries({ queryKey: ['series'] });
        qc.invalidateQueries({ queryKey: ['records'] });
        setRetry(true);
        setBanner(PAYMENT_ERROR_TEXT.pagar_falhou);
        return false;
      }
    } catch {
      setRetry(true);
      setBanner(PAYMENT_ERROR_TEXT.pagar_falhou);
      return false;
    }
  };

  const submit = async () => {
    if (busy) return;
    setBanner(null);
    if (chosen === undefined) {
      if (choice === 'outro') {
        setChoiceError(SERIES_ERROR_TEXT.fim_invalido);
        otherRef.current?.focus();
      } else setChoiceError('Escolha a última conta.');
      return;
    }
    if (!inRange) {
      setChoiceError(SERIES_ERROR_TEXT.fim_invalido);
      return;
    }
    // Listas que falharam ao recarregar: o efeito e a parcela a quitar não são conhecidos. Recarregar antes de gravar.
    if (!listsReady) {
      live.refetch();
      occ.refetch();
      openOcc.refetch();
      setBanner(ERROR_TEXT.carregar_falhou);
      return;
    }
    if (!plan || !plan.ok) {
      setChoiceError(SERIES_ERROR_TEXT.serie_tem_pagamento_posterior);
      return;
    }
    // Última conta antes desta gravação, para a faixa: depois de uma falha, a série recarregada pode já trazer a nova.
    const prevLast = s.lastNumber;
    setBusy(true);
    try {
      let paidNow = false;
      // "Quitei o restante" marcado, mas a parcela escolhida já não está em aberto na lista: um pagamento incerto
      // pode ter sido gravado, nesta ou em outra parcela. Nunca encerrar sem o pagamento pedido.
      if (payoff && !paidDone && parcelada && !resume && typeof chosen === 'number' && !payTarget && (payPending.current.length > 0 || chosenOcc?.status === 'quitado')) {
        let saved: PaySaved = null;
        try {
          saved = payPending.current.length > 0 ? await reconcilePay(chosenOcc, null, null) : null;
        } catch {
          setRetry(true);
          setBanner(PAYMENT_ERROR_TEXT.pagar_falhou);
          return;
        }
        if (saved?.moved) {
          paidElsewhere(saved.number);
          return;
        }
        if (!saved) {
          // Nenhum pagamento registrado agora e a parcela já está paga: confirmar o encerramento sem pagamento novo.
          if (chosenOcc?.status === 'quitado') {
            setPayoff(false);
            setRetry(false);
            setBanner(alreadyPaidText(chosen));
            return;
          }
        } else {
          setPaidDone({ number: saved.number, moved: false });
          paidNow = true;
        }
      }
      if (paying && payTarget) {
        if (!(await payStep(payTarget))) return;
        paidNow = true;
      }
      const afterPayment = Boolean(paidDone) || paidNow;
      // A última conta anterior entra no conteúdo: a reconciliação de uma gravação incerta usa a dela.
      const snapshot = JSON.stringify([s.id, s.version, chosen, plan.affected, prevLast]);
      try {
        if (keys.hasPending()) {
          const saved = await keys.findSaved();
          if (saved?.action === 'encerrar_serie') {
            keys.settled();
            const fresh = await repo.getSeries(s.id);
            const list = await repo.listSeriesOccurrences(s.id);
            if (fresh) {
              setRetry(false);
              // O término e a última conta anterior da tentativa que foi gravada, não os da série recarregada.
              const [, , savedLast, , savedPrev] = JSON.parse(saved.snapshot) as [string, number, number | null, unknown, number | null];
              done({ series: fresh, occurrences: [...list].reverse(), changed: 0 }, savedLast, savedPrev);
              return;
            }
          }
        }
        const key = keys.keyFor(snapshot);
        try {
          const w = await end.mutateAsync({ key, id: s.id, version: s.version, lastNumber: chosen, affected: plan.affected });
          keys.settled();
          setRetry(false);
          done(w, chosen, prevLast);
        } catch (e) {
          if (isRepoError(e) && e.code !== 'rede' && e.code !== 'desconhecido') {
            keys.refused();
            setRetry(false);
            live.refetch();
            occ.refetch();
            openOcc.refetch();
            if (afterPayment) setBanner(PAYOFF_FAILED_END);
            else if (e.code === 'serie_tem_pagamento_posterior' || e.code === 'fim_invalido') setChoiceError(seriesErrorText(e.code, today));
            else setBanner(seriesErrorText(e.code, today));
            return;
          }
          keys.uncertain(key, snapshot);
          setRetry(true);
          setBanner(afterPayment ? PAYOFF_FAILED_END : SERIES_ERROR_TEXT.salvar_falhou);
        }
      } catch {
        setRetry(true);
        setBanner(afterPayment ? PAYOFF_FAILED_END : SERIES_ERROR_TEXT.salvar_falhou);
      }
    } finally {
      setBusy(false);
    }
  };

  const requestCancel = () => {
    if (dirty) setConfirmDiscard(() => goBack);
    else goBack();
  };

  const formatAmountOnBlur = () => {
    const cents = parseBRL(payDraft.amountText);
    if (cents !== null && cents > 0 && cents <= MAX_RECORD_CENTS) setPayDraft((d) => ({ ...d, amountText: centsToInput(cents) }));
  };

  const title = resume ? (parcelada ? 'Retomar parcelas' : 'Voltar a repetir') : parcelada ? 'Encerrar parcelamento' : 'Encerrar gasto fixo';
  const yesterday = addDays(today, -1);
  const lastDue = parcelada && total !== null ? seriesDueOn(s, total) : null;

  // Efeito da escolha, antes de confirmar. Retomar (ou estender): as contas que a geração recria agora.
  const extending = chosen === null || (typeof chosen === 'number' && s.lastNumber !== null && chosen > s.lastNumber);
  // Estender o término ("Sem data para terminar", "Até a última parcela") é retomar, como diz a faixa depois de salvar;
  // um mês antes do término atual, mesmo na tela de retomar, encerra antes.
  const actionLabel =
    (resume && chosen === undefined) || extending ? (parcelada ? 'Retomar parcelas' : 'Voltar a repetir') : paidDone ? 'Encerrar agora' : 'Encerrar';
  const comingBack =
    plan?.ok && extending ? occurrencesToMaterialize({ ...s, lastNumber: chosen ?? null }, allOccurrences, today).map((o) => formatMonthName(o.month)) : [];
  const effect = !plan?.ok
    ? null
    : plan.text ??
      (comingBack.length === 1
        ? `A conta de ${comingBack[0]} volta para Contas a pagar.`
        : comingBack.length > 1
          ? `As contas de ${joinList(comingBack)} voltam para Contas a pagar.`
          : extending
            ? 'As próximas contas aparecem em Contas a pagar um mês antes de vencer.'
            : 'Nenhuma conta em aberto vai sair da lista.');

  // "Quitei o restante": o gasto que o pagamento vai registrar, só com valor e data válidos.
  const payAmount = parseBRL(payDraft.amountText);
  const payDate = parseDateBR(payDraft.dateText);
  const payPreview =
    paying && payTarget && payAmount !== null && payAmount > 0 && payAmount <= MAX_RECORD_CENTS && payDate !== null && payDate <= today
      ? `Um gasto de ${formatBRL(payAmount)} será registrado em Pago de ${formatMonthYearBR(monthOf(payDate))}. Depois, o parcelamento termina na parcela ${payTarget.series!.number}.`
      : null;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SubHeader title={title} onBack={requestCancel} right={<ContextPill label="Salvando em Pessoal" />} />
      <Screen contentStyle={{ padding: space[5], gap: space[4], paddingBottom: space[6] }}>
        <Card style={{ gap: space[1] }}>
          <Txt variant="label" style={{ fontFamily: fonts.bold, fontSize: 16 }}>
            {currentTerm(s, today).description}
          </Txt>
          <Txt variant="caption" color={colors.textSecondary}>
            {seriesCaption(s, today)}
          </Txt>
        </Card>

        {paidDone ? (
          <Banner tone="sucesso" icon={Check}>
            <Txt variant="label" color={colors.successText} style={{ fontFamily: fonts.bold }}>
              {paidDone.moved
                ? `O pagamento foi registrado na parcela ${paidDone.number}. Falta encerrar o parcelamento nela.`
                : `Pagamento registrado. Falta encerrar o parcelamento na parcela ${paidDone.number}.`}
            </Txt>
          </Banner>
        ) : null}

        <Card style={{ gap: space[4] }}>
          {resume && parcelada ? (
            <Txt variant="label">
              As parcelas voltam até a {total}
              {lastDue ? `, com a última em ${formatDateBR(lastDue)}` : ''}.
            </Txt>
          ) : paidDone ? null : resume ? (
            <ChoiceGroup label="Até quando?" error={choice !== 'outro' ? (choiceError ?? undefined) : undefined}>
              <Chip label="Sem data para terminar" selected={choice === 'sem'} onPress={() => pick('sem')} />
              <Chip label="Termina em…" selected={choice === 'outro'} onPress={() => pick('outro')} />
            </ChoiceGroup>
          ) : (
            <ChoiceGroup label="Qual é a última conta?" error={choice !== 'outro' ? (choiceError ?? undefined) : undefined}>
              {numbers.map((n) => (
                <Chip key={n} label={chipLabel(n)} selected={choice === n} onPress={() => pick(n)} />
              ))}
              {!parcelada && s.lastNumber !== null ? (
                <Chip label="Sem data para terminar" selected={choice === 'sem'} onPress={() => pick('sem')} />
              ) : null}
              {parcelada && total !== null && s.lastNumber !== null && s.lastNumber < total ? (
                <Chip label={`Até a última parcela (${total})`} selected={choice === total} onPress={() => pick(total)} />
              ) : null}
              <Chip label="Outro mês" selected={choice === 'outro'} onPress={() => pick('outro')} />
            </ChoiceGroup>
          )}

          {choice === 'outro' && !paidDone ? (
            <TextField
              ref={otherRef}
              label="Último mês (MM/AAAA)"
              value={otherText}
              onChangeText={(t) => {
                setOtherText(maskMonthBR(t));
                setChoiceError(null);
              }}
              placeholder="MM/AAAA"
              keyboardType="number-pad"
              inputMode="numeric"
              maxLength={7}
              error={choiceError ?? undefined}
              hint="Digite só os números."
            />
          ) : null}

          {plan && !plan.ok ? (
            <Banner tone="erro" icon={AlertCircle}>
              <Txt variant="label" color={colors.error}>
                {SERIES_ERROR_TEXT.serie_tem_pagamento_posterior}
              </Txt>
            </Banner>
          ) : effect ? (
            <Banner tone="info" icon={Info} live={false}>
              <Txt variant="label">{effect}</Txt>
            </Banner>
          ) : null}

          {payTarget && !paidDone ? (
            <CheckOption
              label="Quitei o restante nesta parcela"
              hint="Marque esta parcela como paga com o valor total pago ao credor. Depois, o parcelamento termina aqui."
              checked={payoff}
              onPress={() => setPayoff((p) => !p)}
            />
          ) : null}

          {paying && payTarget ? (
            <View style={{ gap: space[4] }}>
              <TextField
                ref={payRefs.amountText}
                label="Valor total pago"
                prefix="R$"
                value={payDraft.amountText}
                onChangeText={(t) => setPay('amountText', t)}
                onBlur={formatAmountOnBlur}
                placeholder="0,00"
                keyboardType="decimal-pad"
                inputMode="decimal"
                large
                error={payErrors.amountText}
                hint={`Valor que saiu da conta para quitar, incluindo a parcela de ${monthOfNumber(payTarget.series!.number)}.`}
              />
              <View style={{ gap: space[2] }}>
                <TextField
                  ref={payRefs.dateText}
                  label="Data do pagamento"
                  value={payDraft.dateText}
                  onChangeText={(t) => setPay('dateText', maskDateBR(t))}
                  placeholder="DD/MM/AAAA"
                  keyboardType="number-pad"
                  inputMode="numeric"
                  maxLength={10}
                  error={payErrors.dateText}
                  hint="Digite só os números. Só datas até hoje."
                />
                <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Atalhos da data do pagamento">
                  <Chip label="Hoje" selected={payDraft.dateText === formatDateBR(today)} onPress={() => setPay('dateText', formatDateBR(today))} />
                  <Chip label="Ontem" selected={payDraft.dateText === formatDateBR(yesterday)} onPress={() => setPay('dateText', formatDateBR(yesterday))} />
                </View>
              </View>
              {personal.accounts.length > 1 ? (
                <ChoiceGroup label="Conta" error={payErrors.accountId}>
                  {personal.accounts.map((a) => (
                    <Chip key={a.id} label={a.name} selected={payDraft.accountId === a.id} onPress={() => setPay('accountId', a.id)} />
                  ))}
                </ChoiceGroup>
              ) : payErrors.accountId ? (
                <Txt variant="label" color={colors.error}>
                  {payErrors.accountId}
                </Txt>
              ) : null}
              {payPreview ? (
                // Prévia que muda a cada tecla: sem região viva, para não ser anunciada de novo a cada dígito.
                <Banner tone="info" icon={Info} live={false}>
                  <Txt variant="label">{payPreview}</Txt>
                </Banner>
              ) : null}
            </View>
          ) : null}
        </Card>
      </Screen>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, space[3]) }]}>
        <View style={styles.footerInner}>
          {banner ? (
            <Banner tone="erro" icon={AlertCircle}>
              <Txt variant="label" color={colors.error}>
                {banner}
              </Txt>
            </Banner>
          ) : null}
          <View style={styles.footerRow}>
            <Button label="Cancelar" tone="ghost" onPress={requestCancel} style={styles.cancel} />
            <Button label={retry ? 'Tentar novamente' : actionLabel} busy={busy} busyLabel="Salvando…" onPress={() => submit()} style={styles.save} />
          </View>
        </View>
      </View>

      <ConfirmDialog
        visible={Boolean(confirmDiscard)}
        title="Descartar o preenchimento?"
        cancelLabel="Continuar editando"
        confirmLabel="Descartar alterações"
        onCancel={() => setConfirmDiscard(null)}
        onConfirm={() => {
          const action = confirmDiscard;
          setConfirmDiscard(null);
          if (action) leave(action);
        }}>
        <Txt color={colors.textSecondary}>Você tem alterações que ainda não foram salvas em Pessoal.</Txt>
      </ConfirmDialog>
    </KeyboardAvoidingView>
  );
}
