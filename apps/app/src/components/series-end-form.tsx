import {
  ACCOUNTS_TEXT,
  ANNUAL_MAX_YEARS,
  ANNUAL_SERIES_ERROR_TEXT,
  ERROR_TEXT,
  PAYMENT_ERROR_TEXT,
  PAYMENT_FIELD_ORDER,
  SERIES_ERROR_TEXT,
  MAX_RECORD_CENTS,
  addDays,
  addMonths,
  affectedByEnd,
  annualYearOf,
  centsToInput,
  chooseAccountId,
  currentTerm,
  fieldForErrorCode,
  firstMonthBounds,
  formatBRL,
  formatDateBR,
  formatMonthName,
  formatMonthYearBR,
  isRepoError,
  maskDateBR,
  maskMonthBR,
  mergeOccurrences,
  monthOf,
  lastNumberFromEndYear,
  newOperationKey,
  numberAtOrAfter,
  numberAtOrBefore,
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
  termFor,
  validatePaymentDraft,
  type Commitment,
  type CommitmentSeries,
  type FieldErrors,
  type IsoMonth,
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

import { AccountPicker } from '@/components/account-picker';
import { ConfirmDialog } from '@/components/dialog';
import { ContextPill, SubHeader } from '@/components/header';
import { MoneyTxt } from '@/components/money-text';
import { CheckOption, ChoiceGroup, joinList, lastYearHint, monthChipLabel, seriesStyles as styles, yearA11yLabel } from '@/components/series-parts';
import { SumValues } from '@/components/sum-values';
import { Banner, Button, Card, Chip, Screen, TextField, Txt } from '@/components/ui';
import { flash } from '@/lib/flash';
import { useLastAccount } from '@/lib/last-account';
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
 * Conta do ano (D-029): a escolha é o último ano; thenNew ("Mudar a forma de pagamento") abre, depois de encerrar, o
 * cadastro de uma nova conta do ano preenchido, a partir do ano seguinte (duas ações confirmadas pela pessoa).
 */
export function SeriesEndForm({
  series: opened,
  space: personal,
  thenNew = false,
}: {
  series: CommitmentSeries;
  space: PersonalSpace;
  thenNew?: boolean;
}) {
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
  const anual = s.kind === 'anual';
  const k = s.partsPerYear ?? 1;
  const texts: Record<keyof typeof SERIES_ERROR_TEXT, string> = anual ? ANNUAL_SERIES_ERROR_TEXT : SERIES_ERROR_TEXT;
  const noun = parcelada ? 'Parcelamento' : anual ? 'Conta do ano' : 'Gasto fixo';
  /** Maior último número aceito: parcelamento, o total; gasto fixo, 600 contas; conta do ano, 50 anos. */
  const maxLast = parcelada ? (s.installmentTotal ?? 0) : anual ? ANNUAL_MAX_YEARS * k : 600;
  const yearLabelOf = (n: number) => annualYearOf(s, n).label;
  // Aberta para retomar: a série já estava encerrada ao abrir a tela (não muda no meio do preenchimento).
  const [resume] = useState(() => seriesEnded(opened, today));
  const currentMonth = monthOf(today);
  const total = s.installmentTotal;
  /**
   * "Mudar a forma de pagamento": 1º mês do ano seguinte ao último ano n (onde a nova começa, no mesmo mês) e se ele já
   * pode ser cadastrado (até 23 meses depois do mês atual). Encerrar num ano mais distante deixaria a nova sem como
   * começar logo depois.
   */
  const newStartAfter = (n: number): IsoMonth => addMonths(annualYearOf(s, n).firstMonth, 12);
  const newStartMax = firstMonthBounds(today, 'anual').max;
  const newFits = (n: number) => !anual || !thenNew || n < s.firstNumber || newStartAfter(n) <= newStartMax;

  // Chips de "Qual é a última conta?": do mês anterior (ou da conta mais antiga em aberto) até 6 meses depois da última conta criada.
  // Conta do ano, "Qual é o último ano?": do ano de hoje (ou do ano da conta mais antiga em aberto) até 3 anos depois
  // do último ano com conta criada; cada chip é a última parcela do ano.
  const numbers = useMemo(() => {
    const liveNumbers = occurrences.map((c) => c.series!.number);
    const oldestOpen = occurrences.find((c) => c.status === 'aberto')?.series?.number;
    const out: number[] = [];
    if (anual) {
      const yearIdx = (n: number) => Math.floor((n - 1) / k);
      const firstIdx = yearIdx(s.firstNumber);
      const curIdx = yearIdx(Math.max(s.firstNumber, numberAtOrBefore(s, currentMonth)));
      const startIdx = Math.max(firstIdx, Math.min(oldestOpen === undefined ? Infinity : yearIdx(oldestOpen), curIdx));
      const topIdx = Math.max(curIdx, ...liveNumbers.map(yearIdx)) + 3;
      for (let idx = startIdx; idx <= topIdx; idx++) {
        const n = (idx + 1) * k;
        if (n !== s.lastNumber && n <= maxLast && newFits(n)) out.push(n);
      }
      return out;
    }
    const start = Math.max(s.firstNumber, Math.min(oldestOpen ?? Infinity, numberAtOrAfter(s, addMonths(currentMonth, -1))));
    const top = Math.max(...liveNumbers, numberAtOrAfter(s, currentMonth)) + 6;
    for (let n = start; n <= Math.min(top, maxLast); n++) if (n !== s.lastNumber && !s.skippedNumbers.includes(n)) out.push(n);
    return out;
  }, [occ.data, live.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const lastAccount = useLastAccount();
  const initialPay: PaymentDraft = { accountId: chooseAccountId(personal.accounts, lastAccount.last), amountText: '', dateText: formatDateBR(today), category: null };
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
    if (anual) {
      // "Último ano (AAAA)": a última parcela daquele ano.
      const text = otherText.trim();
      return /^\d{4}$/.test(text) ? lastNumberFromEndYear(s, Number(text)) : undefined;
    }
    const m = parseMonthBR(otherText);
    const n = m === null ? null : numberOfMonth(s, m);
    return n === null ? undefined : n;
  })();
  const inRange = chosen === undefined || (chosen === null ? !parcelada : chosen >= s.firstNumber - 1 && chosen <= maxLast);
  /** "Mudar a forma de pagamento" com um último ano tão distante que a nova ainda não pode ser cadastrada: o motivo. */
  const newTooLate =
    typeof chosen === 'number' && inRange && !newFits(chosen)
      ? `Com ${yearLabelOf(chosen)} como último ano, a nova forma de pagamento só poderia ser cadastrada a partir de ${formatMonthYearBR(addMonths(newStartAfter(chosen), -23))}. Escolha um ano anterior.`
      : null;
  const plan = chosen !== undefined && inRange ? affectedByEnd(allOccurrences, s, chosen) : null;
  /** Conta viva do número escolhido, aberta ou paga (null se ainda não foi criada). */
  const chosenOcc = typeof chosen === 'number' ? (allOccurrences.find((c) => c.series!.number === chosen) ?? null) : null;
  // "Quitei o restante" só vale para uma parcela já criada e em aberto: é ela que recebe o pagamento.
  const payTarget: Commitment | null = parcelada && !resume && chosenOcc?.status === 'aberto' ? chosenOcc : null;
  const paying = payoff && payTarget !== null && !paidDone;

  const monthOfNumber = (n: number) => formatMonthName(seriesMonthOf(s, n));
  const chipLabel = (n: number) => {
    if (anual) return yearLabelOf(n);
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
      const recreated = w.occurrences.filter((c) => c.status === 'aberto' && c.series!.number > before);
      if (anual) {
        const n = recreated.length;
        const tail = n === 0 ? '' : n === 1 ? ' 1 conta voltou para Contas a pagar.' : ` ${n} contas voltaram para Contas a pagar.`;
        flash.set(`Conta do ano retomada.${tail}`);
      } else {
        const back = recreated.map((c) => formatMonthName(monthOf(c.dueOn)));
        const tail =
          back.length === 0
            ? ''
            : back.length === 1
              ? ` A conta de ${back[0]} voltou para Contas a pagar.`
              : ` As contas de ${joinList(back)} voltaram para Contas a pagar.`;
        flash.set(`${noun} retomado.${tail}`);
      }
    } else if (anual && thenNew) {
      // "Mudar a forma de pagamento": a nova conta do ano começa no ano seguinte ao último, com o formulário preenchido.
      const fresh = w.series;
      const term = termFor(fresh.terms, Math.max(fresh.firstNumber, last)) ?? currentTerm(fresh, today);
      const lastYear = last >= fresh.firstNumber ? annualYearOf(fresh, last) : null;
      const start = addMonths(lastYear ? lastYear.firstMonth : annualYearOf(fresh, fresh.firstNumber).firstMonth, lastYear ? 12 : 0);
      // A nova nunca começa antes do mês seguinte ao último vencimento da encerrada (nada vence duas vezes no mesmo mês).
      const notBefore = lastYear ? addMonths(seriesMonthOf(fresh, last), 1) : null;
      const params: Record<string, string> = {
        tipo: 'anual',
        descricao: term.description,
        valor: String(term.amountCents),
        dia: String(term.dueDay),
        modo: term.amountMode,
        parcelas: String(k),
        mes: String(Number(start.slice(5, 7))),
        ano: start.slice(0, 4),
        ...(term.category ? { categoria: term.category } : {}),
        ...(lastYear ? { apos: lastYear.label } : {}),
        ...(notBefore ? { 'inicio-minimo': notBefore } : {}),
      };
      leave(() => router.replace({ pathname: '/gastos-fixos/novo', params }));
      return;
    } else {
      flash.set(`${noun} ${anual ? 'encerrada' : 'encerrado'}.`);
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
        lastAccount.remember(v.input.accountId);
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
        setChoiceError(texts.fim_invalido);
        otherRef.current?.focus();
      } else setChoiceError(anual ? 'Escolha o último ano.' : 'Escolha a última conta.');
      return;
    }
    if (!inRange) {
      setChoiceError(texts.fim_invalido);
      return;
    }
    if (newTooLate) {
      setChoiceError(newTooLate);
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
      setChoiceError(texts.serie_tem_pagamento_posterior);
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
            else if (e.code === 'serie_tem_pagamento_posterior' || e.code === 'fim_invalido') setChoiceError(seriesErrorText(e.code, today, s.kind));
            else setBanner(seriesErrorText(e.code, today, s.kind));
            return;
          }
          keys.uncertain(key, snapshot);
          setRetry(true);
          setBanner(afterPayment ? PAYOFF_FAILED_END : texts.salvar_falhou);
        }
      } catch {
        setRetry(true);
        setBanner(afterPayment ? PAYOFF_FAILED_END : texts.salvar_falhou);
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

  const title = resume
    ? parcelada
      ? 'Retomar parcelas'
      : 'Voltar a repetir'
    : parcelada
      ? 'Encerrar parcelamento'
      : anual
        ? 'Encerrar conta do ano'
        : 'Encerrar gasto fixo';
  const yesterday = addDays(today, -1);
  const lastDue = parcelada && total !== null ? seriesDueOn(s, total) : null;
  // "Outro ano" numa conta do ano que atravessa dezembro: o ano digitado é o do começo do período.
  const firstYearMonth = anual ? annualYearOf(s, s.firstNumber).firstMonth : null;
  const otherYearHint = firstYearMonth ? lastYearHint(Number(firstYearMonth.slice(5, 7)), k, Number(firstYearMonth.slice(0, 4))) : null;

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
      (anual
        ? comingBack.length === 1
          ? '1 conta volta para Contas a pagar.'
          : comingBack.length > 1
            ? `${comingBack.length} contas voltam para Contas a pagar.`
            : extending
              ? 'Os próximos anos entram em Contas a pagar dois meses antes do primeiro vencimento.'
              : 'Nenhuma conta em aberto vai sair da lista.'
        : comingBack.length === 1
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
            <ChoiceGroup
              label={anual ? 'Qual é o último ano?' : 'Qual é a última conta?'}
              hint={anual && thenNew ? 'Escolha o último ano com a forma de pagamento atual. Depois, você cadastra a nova a partir do ano seguinte.' : undefined}
              error={choice !== 'outro' ? (choiceError ?? undefined) : undefined}>
              {numbers.map((n) => (
                <Chip key={n} label={chipLabel(n)} accessibilityLabel={yearA11yLabel(chipLabel(n))} selected={choice === n} onPress={() => pick(n)} />
              ))}
              {/* "Mudar a forma de pagamento" sempre encerra: sem a opção de voltar a repetir. */}
              {!parcelada && s.lastNumber !== null && !thenNew ? (
                <Chip label="Sem data para terminar" selected={choice === 'sem'} onPress={() => pick('sem')} />
              ) : null}
              {parcelada && total !== null && s.lastNumber !== null && s.lastNumber < total ? (
                <Chip label={`Até a última parcela (${total})`} selected={choice === total} onPress={() => pick(total)} />
              ) : null}
              <Chip label={anual ? 'Outro ano' : 'Outro mês'} selected={choice === 'outro'} onPress={() => pick('outro')} />
            </ChoiceGroup>
          )}

          {choice === 'outro' && !paidDone ? (
            <TextField
              ref={otherRef}
              label={anual ? 'Último ano (AAAA)' : 'Último mês (MM/AAAA)'}
              value={otherText}
              onChangeText={(t) => {
                setOtherText(anual ? t.replace(/\D/g, '').slice(0, 4) : maskMonthBR(t));
                setChoiceError(null);
              }}
              placeholder={anual ? 'AAAA' : 'MM/AAAA'}
              keyboardType="number-pad"
              inputMode="numeric"
              maxLength={anual ? 4 : 7}
              error={choiceError ?? newTooLate ?? undefined}
              hint={anual ? (otherYearHint ?? 'Útil quando você vai vender o carro ou o imóvel.') : 'Digite só os números.'}
            />
          ) : null}

          {plan && !plan.ok ? (
            <Banner tone="erro" icon={AlertCircle}>
              <Txt variant="label" color={colors.error}>
                {texts.serie_tem_pagamento_posterior}
              </Txt>
            </Banner>
          ) : newTooLate ? null : effect ? (
            <Banner tone="info" icon={Info} live={false}>
              <MoneyTxt variant="label" accessibilityLabel={yearA11yLabel(effect)}>
                {effect}
              </MoneyTxt>
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
              <SumValues target={payRefs.amountText} onUse={(t) => setPay('amountText', t)} />
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
              <AccountPicker
                accounts={personal.accounts}
                value={payDraft.accountId}
                label={ACCOUNTS_TEXT.out}
                error={payErrors.accountId}
                onChange={(id) => setPay('accountId', id ?? '')}
              />
              {payPreview ? (
                // Prévia que muda a cada tecla: sem região viva, para não ser anunciada de novo a cada dígito.
                <Banner tone="info" icon={Info} live={false}>
                  <MoneyTxt variant="label">{payPreview}</MoneyTxt>
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
