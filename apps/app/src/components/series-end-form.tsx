import {
  PAYMENT_ERROR_TEXT,
  PAYMENT_FIELD_ORDER,
  SERIES_ERROR_TEXT,
  MAX_RECORD_CENTS,
  addDays,
  addMonths,
  affectedByEnd,
  centsToInput,
  fieldForErrorCode,
  formatDateBR,
  formatMonthName,
  formatMonthYearBR,
  isRepoError,
  maskDateBR,
  maskMonthBR,
  monthOf,
  newOperationKey,
  numberOfMonth,
  parseBRL,
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
import { useEndSeries, usePayCommitment, useSeries, useSeriesOccurrences, useSeriesOperationKey, useUpdateRecord } from '@/state/data';
import { useRepo, useSession } from '@/state/session';
import { colors, fonts, space } from '@/theme/tokens';

/** Última conta: um número da série, "sem data para terminar", "Outro mês" (MM/AAAA) ou nada escolhido ainda. */
type EndChoice = number | 'sem' | 'outro' | null;

const PAYOFF_FAILED_END = 'Pagamento registrado. Não foi possível encerrar agora. Tente de novo.';

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
  const s = live.data ?? opened;
  const occurrences = occ.data ? [...occ.data].reverse() : []; // número crescente
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
  /** "Quitei o restante": o pagamento já foi confirmado; falta só encerrar. */
  const [paidDone, setPaidDone] = useState<{ number: number } | null>(null);
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
    if (choice === null) return undefined;
    if (choice === 'sem') return null;
    if (choice !== 'outro') return choice;
    const m = parseMonthBR(otherText);
    return m === null ? undefined : numberOfMonth(s, m);
  })();
  const inRange =
    chosen === undefined ||
    (chosen === null ? !parcelada : chosen >= s.firstNumber - 1 && chosen <= (parcelada ? (total ?? 0) : 600));
  const plan = chosen !== undefined && inRange ? affectedByEnd(occurrences, s, chosen) : null;
  // "Quitei o restante" só vale para uma parcela já criada e em aberto: é ela que recebe o pagamento.
  const payTarget: Commitment | null =
    parcelada && !resume && typeof chosen === 'number' ? (occurrences.find((c) => c.series!.number === chosen && c.status === 'aberto') ?? null) : null;
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

  const done = (w: SeriesWrite, last: number | null) => {
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    if (resume || last === null || (s.lastNumber !== null && last > s.lastNumber)) {
      // Retomar: as contas recriadas pela geração (número depois da antiga última conta).
      const before = s.lastNumber ?? Infinity;
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
   * Pagamento com resultado incerto: conferir se alguma tentativa foi gravada antes de repetir. Se foi e o preenchimento
   * mudou, aplica o atual como edição do gasto gerado (nunca há um segundo pagamento). true se o pagamento existe.
   */
  const reconcilePay = async (input: PaymentInput, snapshot: string): Promise<boolean> => {
    for (const attempt of [...payPending.current].reverse()) {
      const op = await repo.findCommitmentOperation(attempt.key);
      if (!op || op.action !== 'pagar_compromisso' || !op.recordId) continue;
      qc.invalidateQueries({ queryKey: ['commitments'] });
      qc.invalidateQueries({ queryKey: ['series'] });
      qc.invalidateQueries({ queryKey: ['records'] });
      const expense = await repo.getRecord(op.recordId);
      if (expense && attempt.snapshot !== snapshot) {
        await updateRecord.mutateAsync({
          key: newOperationKey(),
          id: expense.id,
          version: expense.version,
          input: { accountId: input.accountId, amountCents: input.amountCents, occurredOn: input.paidOn, description: expense.description, category: input.category },
        });
      }
      payPending.current = [];
      return true;
    }
    return false;
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
        if (await reconcilePay(v.input, snapshot)) {
          setPaidDone({ number: target.series!.number });
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
        setPaidDone({ number: target.series!.number });
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
    if (!plan || !plan.ok) {
      setChoiceError(SERIES_ERROR_TEXT.serie_tem_pagamento_posterior);
      return;
    }
    setBusy(true);
    try {
      if (paying && payTarget && !(await payStep(payTarget))) return;
      const afterPayment = Boolean(paidDone) || paying;
      const snapshot = JSON.stringify([s.id, s.version, chosen, plan.affected]);
      try {
        if (keys.hasPending()) {
          const saved = await keys.findSaved();
          if (saved?.action === 'encerrar_serie') {
            keys.settled();
            const fresh = await repo.getSeries(s.id);
            const list = await repo.listSeriesOccurrences(s.id);
            if (fresh) {
              setRetry(false);
              done({ series: fresh, occurrences: [...list].reverse(), changed: 0 }, fresh.lastNumber);
              return;
            }
          }
        }
        const key = keys.keyFor(snapshot);
        try {
          const w = await end.mutateAsync({ key, id: s.id, version: s.version, lastNumber: chosen, affected: plan.affected });
          keys.settled();
          setRetry(false);
          done(w, chosen);
        } catch (e) {
          if (isRepoError(e) && e.code !== 'rede' && e.code !== 'desconhecido') {
            keys.refused();
            setRetry(false);
            live.refetch();
            occ.refetch();
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
  const actionLabel = resume ? (parcelada ? 'Retomar parcelas' : 'Voltar a repetir') : paidDone ? 'Encerrar agora' : 'Encerrar';
  const yesterday = addDays(today, -1);
  const lastDue = parcelada && total !== null ? seriesDueOn(s, total) : null;

  // Efeito da escolha, antes de confirmar.
  const effect = !plan
    ? null
    : !plan.ok
      ? null
      : plan.text ?? (resume || chosen === null ? null : 'Nenhuma conta em aberto vai sair da lista.');

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SubHeader title={title} onBack={requestCancel} right={<ContextPill label="Salvando em Pessoal" />} />
      <Screen contentStyle={{ padding: space[5], gap: space[4], paddingBottom: space[6] }}>
        <Card style={{ gap: space[1] }}>
          <Txt variant="label" style={{ fontFamily: fonts.bold, fontSize: 16 }}>
            {s.terms[s.terms.length - 1]?.description}
          </Txt>
          <Txt variant="caption" color={colors.textSecondary}>
            {seriesCaption(s, today)}
          </Txt>
        </Card>

        {paidDone ? (
          <Banner tone="sucesso" icon={Check}>
            <Txt variant="label" color={colors.successText} style={{ fontFamily: fonts.bold }}>
              Pagamento registrado. Falta encerrar o parcelamento na parcela {paidDone.number}.
            </Txt>
          </Banner>
        ) : null}

        <Card style={{ gap: space[4] }}>
          {resume && parcelada ? (
            <Txt variant="label">
              As parcelas voltam até a {total}
              {lastDue ? `, com a última em ${formatDateBR(lastDue)}` : ''}. As contas em aberto aparecem em Contas a pagar um mês antes de
              vencer.
            </Txt>
          ) : resume ? (
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

          {choice === 'outro' ? (
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
              <Txt variant="caption" color={colors.textSecondary}>
                O pagamento entra em Pago de {formatMonthYearBR(monthOf(payTarget.dueOn < today ? today : today))} como um gasto, uma única vez.
              </Txt>
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
