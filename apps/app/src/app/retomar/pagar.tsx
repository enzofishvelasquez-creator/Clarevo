import {
  CATEGORIES,
  MAX_RECORD_CENTS,
  NO_CATEGORY_LABEL,
  PAYMENT_FIELD_ORDER,
  RETURN_TEXT,
  addDays,
  centsToInput,
  fieldForErrorCode,
  formatBRL,
  formatDateBR,
  formatMonthBR,
  isReviewableMonth,
  maskDateBR,
  monthOf,
  parseBRL,
  parseDateBR,
  returnErrorText,
  rowShortName,
  seriesGapsInRange,
  seriesMonthOf,
  validatePaymentDraft,
  type DraftField,
  type FieldErrors,
  type PaymentDraft,
  type PersonalSpace,
  type ReviewRow,
} from '@clarevo/core';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import * as Haptics from 'expo-haptics';
import { AlertCircle, Info } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View, type TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ConfirmDialog } from '@/components/dialog';
import { ContextPill, SubHeader } from '@/components/header';
import { PayRowError, codeOf, isUncertain, returnSession, useReturnWriter } from '@/components/retorno-acoes';
import { ErrorState, LoadingState } from '@/components/states';
import { SumValues } from '@/components/sum-values';
import { Banner, Button, Card, Chip, LinkButton, Screen, TextField, Txt } from '@/components/ui';
import { flash } from '@/lib/flash';
import { explanationHref } from '@/lib/learn';
import { totalChange } from '@/lib/highlight';
import { useReturnReview, useSeries, useSpace } from '@/state/data';
import { useSession } from '@/state/session';
import { colors, fonts, space, tabular } from '@/theme/tokens';

/**
 * /retomar/pagar?serie=<id>&numero=<n> · "Já paguei" numa conta sem registro (valor que muda, ou "Mudar valor ou data"):
 * a conta daquele mês é registrada pela série (create_series_occurrence, chave K1) e paga (pay_commitment, chave K2), em
 * duas chamadas. Se a segunda falhar, a conta fica em aberto e "Salvar de novo" repete só o pagamento. Valor estimado
 * nunca vem preenchido. Com rede incerta, findCommitmentOperation(K1) recupera a conta antes de pagar.
 */
export default function RegistrarPagamento() {
  const { serie, numero } = useLocalSearchParams<{ serie?: string; numero?: string }>();
  const { today } = useSession();
  const personal = useSpace().data;
  const ctx = personal?.personalContextId;
  const n = Number(numero);
  const review = useReturnReview(ctx);
  const series = useSeries(serie, ctx);

  // A linha da revisão; sem ela (revisão já decidida ou aberta pelo detalhe da série), a mesma linha calculada pela série.
  const key = `serie:${serie}:${numero}`;
  const fromReview = review.data?.review ? [...review.data.review.months.flatMap((m) => m.rows)].find((r) => r.key === key) : undefined;
  const s = series.data;
  const fromSeries = s && Number.isInteger(n) ? seriesGapsInRange(s, [], seriesMonthOf(s, n), seriesMonthOf(s, n)).find((r) => r.series?.number === n) : undefined;
  const row = fromReview ?? fromSeries ?? null;
  // Aberto o formulário, ele fica com a mesma linha (os dados recarregam depois de registrar a conta).
  const [opened, setOpened] = useState<ReviewRow | null>(null);
  if (!opened && row && (review.isSuccess || review.isError) && (series.isSuccess || fromReview)) setOpened(row);

  if (opened && personal) {
    if (!isReviewableMonth(opened.month, today)) return <OutOfRange text={returnErrorText('mes_fora_da_revisao')} />;
    return <PaymentForRow key={opened.key} row={opened} space={personal} />;
  }
  if (series.isPending || review.isPending || !personal) return <LoadingState />;
  if (series.isError) return <ErrorState message={RETURN_TEXT.loadFailed} onRetry={() => series.refetch()} />;
  return <OutOfRange text={returnErrorText('nao_encontrado')} />;
}

function OutOfRange({ text }: { text: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SubHeader title={RETURN_TEXT.payScreenTitle} />
      <View style={{ padding: space[5] }}>
        <Card style={{ gap: space[3] }}>
          <Txt>{text}</Txt>
          <Button label={RETURN_TEXT.backToReview} onPress={() => (router.canGoBack() ? router.back() : router.replace('/retomar'))} />
        </Card>
      </View>
    </View>
  );
}

function PaymentForRow({ row, space: personal }: { row: ReviewRow; space: PersonalSpace }) {
  const { today } = useSession();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const writer = useReturnWriter();
  const short = rowShortName(row);

  const initial = useMemo<PaymentDraft>(
    () => ({
      accountId: personal.accounts[0]?.id ?? '',
      amountText: row.amountIsEstimate ? '' : centsToInput(row.amountCents),
      dateText: formatDateBR(row.dueOn <= today ? row.dueOn : today),
      category: row.category,
    }),
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const [draft, setDraft] = useState<PaymentDraft>(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [banner, setBanner] = useState<string | null>(null);
  /** A conta foi registrada e o pagamento não: o botão vira "Salvar de novo" e repete só o pagamento. */
  const [partial, setPartial] = useState(false);
  const [busy, setBusy] = useState(false);
  const [leaveTo, setLeaveTo] = useState<null | (() => void)>(null);
  const [confirmDiscard, setConfirmDiscard] = useState<null | (() => void)>(null);
  const refs = {
    description: useRef<TextInput>(null),
    amountText: useRef<TextInput>(null),
    dateText: useRef<TextInput>(null),
    accountId: useRef<TextInput>(null),
  } satisfies Record<DraftField, React.RefObject<TextInput | null>>;

  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const account = personal.accounts.find((a) => a.id === draft.accountId) ?? personal.accounts[0];

  usePreventRemove(dirty && !leaveTo, ({ data }) => {
    setConfirmDiscard(() => () => navigation.dispatch(data.action));
  });
  useEffect(() => {
    if (leaveTo) leaveTo();
  }, [leaveTo]);
  const leave = (fn: () => void) => setLeaveTo(() => fn);
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/retomar/atualizar'));

  const set = <K extends keyof PaymentDraft>(k: K, v: PaymentDraft[K]) => {
    setDraft((d) => ({ ...d, [k]: v }));
    if (k in errors) setErrors((e) => ({ ...e, [k]: undefined }));
  };
  const focusFirst = (errs: FieldErrors) => {
    const first = PAYMENT_FIELD_ORDER.find((f) => errs[f]);
    if (first) refs[first].current?.focus();
  };

  const submit = async () => {
    if (busy) return;
    const v = validatePaymentDraft(draft, today);
    if (!v.ok) {
      setErrors(v.errors);
      focusFirst(v.errors);
      return;
    }
    setErrors({});
    setBanner(null);
    setBusy(true);
    try {
      const paid = await writer.payRow(row, v.input);
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      if (paid.payment) totalChange.set({ total: 'pago', month: monthOf(paid.payment.paidOn), deltaCents: paid.payment.amountCents });
      returnSession.setOutcome(row.key, { type: 'paga', commitment: paid });
      // Anunciado uma vez na tela de origem (revisão ou detalhe do gasto fixo).
      flash.set(RETURN_TEXT.announcePaid(short));
      leave(goBack);
    } catch (e) {
      const err = e instanceof PayRowError ? e : new PayRowError(e, null);
      const created = err.created ?? writer.createdFor(row.key);
      if (created) {
        // Conta registrada, pagamento não: ela já aparece em Contas a pagar; "Salvar de novo" repete só o pagamento.
        setPartial(true);
        returnSession.noteAction();
        const field = !isUncertain(err.cause) ? fieldForErrorCode(codeOf(err.cause)) : null;
        if (field && PAYMENT_FIELD_ORDER.includes(field)) {
          const errs = { [field]: returnErrorText(codeOf(err.cause)) };
          setErrors(errs);
          focusFirst(errs);
          return;
        }
        setBanner(RETURN_TEXT.partialFailure(row.month));
        return;
      }
      if (isUncertain(err.cause)) {
        setBanner(RETURN_TEXT.saveFailed);
        return;
      }
      const field = fieldForErrorCode(codeOf(err.cause));
      if (field && PAYMENT_FIELD_ORDER.includes(field)) {
        const errs = { [field]: returnErrorText(codeOf(err.cause)) };
        setErrors(errs);
        focusFirst(errs);
        return;
      }
      // Recusa (por exemplo, a conta já foi registrada em outro aparelho): o texto do código; a revisão recarrega.
      setBanner(returnErrorText(codeOf(err.cause)));
    } finally {
      setBusy(false);
    }
  };

  const requestCancel = () => {
    if (dirty) setConfirmDiscard(() => goBack);
    else goBack();
  };
  const formatAmountOnBlur = () => {
    const cents = parseBRL(draft.amountText);
    if (cents !== null && cents > 0 && cents <= MAX_RECORD_CENTS) setDraft((d) => ({ ...d, amountText: centsToInput(cents) }));
  };

  const amount = parseBRL(draft.amountText);
  const paidOn = parseDateBR(draft.dateText);
  const valid = amount !== null && amount > 0 && amount <= MAX_RECORD_CENTS && paidOn !== null && paidOn <= today;
  const yesterday = addDays(today, -1);

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SubHeader title={RETURN_TEXT.payScreenTitle} onBack={requestCancel} right={<ContextPill label="Salvando em Pessoal" />} />
      <Screen contentStyle={styles.body}>
        <Card style={{ gap: space[1] }}>
          <Txt variant="label" style={{ fontFamily: fonts.bold, fontSize: 16 }}>
            {short}
          </Txt>
          <Txt variant="caption" color={colors.textSecondary} style={tabular}>
            {row.label ? `${row.label} · ` : ''}vencimento em {formatDateBR(row.dueOn)} · {RETURN_TEXT.stateGap}
          </Txt>
          <Txt variant="label">{RETURN_TEXT.payScreenExplain(row.month)}</Txt>
        </Card>

        <Card style={{ gap: space[4] }}>
          <TextField
            ref={refs.amountText}
            label="Valor pago"
            prefix="R$"
            value={draft.amountText}
            onChangeText={(t) => set('amountText', t)}
            onBlur={formatAmountOnBlur}
            placeholder="0,00"
            keyboardType="decimal-pad"
            inputMode="decimal"
            large
            autoFocus={row.amountIsEstimate}
            error={errors.amountText}
            hint={row.amountIsEstimate ? RETURN_TEXT.estimateHint(row.amountCents) : 'Use o valor que saiu da conta, com juros ou desconto, se houver.'}
          />
          <SumValues target={refs.amountText} onUse={(t) => set('amountText', t)} />

          <View style={{ gap: space[2] }}>
            <TextField
              ref={refs.dateText}
              label="Data do pagamento"
              value={draft.dateText}
              onChangeText={(t) => set('dateText', maskDateBR(t))}
              placeholder="DD/MM/AAAA"
              keyboardType="number-pad"
              inputMode="numeric"
              maxLength={10}
              error={errors.dateText}
              hint="Digite só os números. Só datas até hoje."
            />
            <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Atalhos da data do pagamento">
              {row.dueOn < yesterday ? (
                <Chip label="Dia do vencimento" selected={draft.dateText === formatDateBR(row.dueOn)} onPress={() => set('dateText', formatDateBR(row.dueOn))} />
              ) : null}
              <Chip label="Hoje" selected={draft.dateText === formatDateBR(today)} onPress={() => set('dateText', formatDateBR(today))} />
            </View>
          </View>

          {personal.accounts.length > 1 ? (
            <View style={{ gap: space[2] }} accessibilityRole="radiogroup" accessibilityLabel="Conta">
              <Txt variant="label" style={{ fontFamily: fonts.bold }}>
                Conta
              </Txt>
              <View style={styles.chips}>
                {personal.accounts.map((a) => (
                  <Chip key={a.id} label={a.name} selected={draft.accountId === a.id} onPress={() => set('accountId', a.id)} />
                ))}
              </View>
            </View>
          ) : null}
          {errors.accountId ? (
            <Txt variant="label" color={colors.error}>
              {errors.accountId}
            </Txt>
          ) : null}

          <View style={{ gap: space[2] }} accessibilityRole="radiogroup" accessibilityLabel="Categoria">
            <Txt variant="label" style={{ fontFamily: fonts.bold }}>
              Categoria
            </Txt>
            <View style={styles.chips}>
              <Chip label={NO_CATEGORY_LABEL} selected={draft.category === null} onPress={() => set('category', null)} />
              {CATEGORIES.despesa.map((cat) => (
                <Chip key={cat} label={cat} selected={draft.category === cat} onPress={() => set('category', cat)} />
              ))}
            </View>
          </View>

          {valid ? (
            // Prévia que muda a cada tecla: sem região viva.
            <Banner tone="info" icon={Info} live={false}>
              <Txt variant="label">
                Um gasto de {formatBRL(amount)} será registrado em Pago de {formatMonthBR(monthOf(paidOn)).toLowerCase()}, da conta {account?.name}.
              </Txt>
            </Banner>
          ) : null}
        </Card>

        <LinkButton label="Como o pagamento entra no mês?" color={colors.textSecondary} onPress={() => router.push(explanationHref('realizado-previsto'))} />
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
            <Button
              label={partial ? RETURN_TEXT.saveAgain : RETURN_TEXT.savePayment}
              busy={busy}
              busyLabel="Salvando…"
              onPress={submit}
              style={styles.save}
            />
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

const styles = StyleSheet.create({
  body: { padding: space[5], gap: space[4], paddingBottom: space[6] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  footer: { backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space[3], paddingHorizontal: space[5] },
  footerInner: { width: '100%', maxWidth: 560, alignSelf: 'center', gap: space[3] },
  footerRow: { flexDirection: 'row', gap: space[3], alignItems: 'center' },
  cancel: { alignSelf: 'auto', flexGrow: 0 },
  save: { alignSelf: 'auto', flex: 1 },
});
