import {
  BUDGET_ERROR_TEXT,
  BUDGET_MIN_CENTS,
  BUDGET_TEXT,
  ERROR_TEXT,
  addMonths,
  budgetCategoryFromParam,
  budgetMonthBounds,
  budgetMonthError,
  budgetRowFor,
  centsToInput,
  formatMonthBR,
  formatMonthYearBR,
  isRepoError,
  isValidIsoMonth,
  monthOf,
  validateBudgetDraft,
  type CategoryBudget,
  type IsoMonth,
} from '@clarevo/core';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { AlertCircle } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, View, type TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ConfirmDialog } from '@/components/dialog';
import { ContextPill, SubHeader } from '@/components/header';
import { MoneyTxt, useMoneyMask } from '@/components/money-text';
import { MonthStepper } from '@/components/month-stepper';
import { seriesStyles as styles } from '@/components/series-parts';
import { ErrorState } from '@/components/states';
import { SumValues } from '@/components/sum-values';
import { Banner, Button, Card, Screen, Skeleton, TextField, Txt } from '@/components/ui';
import { announceOnIOS } from '@/lib/a11y';
import { flash } from '@/lib/flash';
import { isRefusal, useBudgetOperationKey, useCategoryBudgets, useDeleteCategoryBudget, useSetCategoryBudget, useSpace } from '@/state/data';
import { useSession } from '@/state/session';
import { colors, fonts, space } from '@/theme/tokens';

/**
 * Orçamento de uma categoria (D-041): valor por mês, "A partir de" (este mês por padrão; meses passados até 24 meses atrás),
 * "Somar valores" e "Tirar o orçamento" (grava uma linha sem valor, que encerra a vigência a partir do mês escolhido; quando a
 * linha do mês é a única com valor até ali, exclui a linha). "Voltar a {valor}" desfaz a retirada e só aparece quando a linha
 * anterior tem valor, que o botão nomeia. Meses anteriores ao escolhido não mudam. Formulário, sem barra inferior. Escrita só por set_category_budget e delete_category_budget,
 * com chave de operação guardada entre tentativas (repetir o mesmo conteúdo depois de falha de rede reconcilia).
 * `?mes=AAAA-MM` escolhe o mês inicial de "A partir de" (sem ele, o mês atual).
 */
export default function OrcamentoCategoriaScreen() {
  const params = useLocalSearchParams<{ categoria?: string; mes?: string }>();
  const category = budgetCategoryFromParam(params.categoria);
  const contextId = useSpace().data?.personalContextId;
  if (!category) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <SubHeader title={BUDGET_TEXT.title} right={<ContextPill label="Pessoal" />} />
        <Screen contentStyle={{ padding: space[5], gap: space[4] }}>
          <Txt>{BUDGET_TEXT.form.unknown}</Txt>
          <Button label="Ver orçamento por categoria" onPress={() => router.replace('/orcamento')} />
        </Screen>
      </View>
    );
  }
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {contextId ? (
        <BudgetForm contextId={contextId} category={category} startMonth={params.mes} />
      ) : (
        <>
          <SubHeader title={BUDGET_TEXT.form.title(category)} right={<ContextPill label="Salvando em Pessoal" />} />
          <Screen contentStyle={{ padding: space[5], gap: space[4] }}>
            <Skeleton width="100%" height={120} />
          </Screen>
        </>
      )}
    </View>
  );
}

const errorText = (code: string) =>
  code in BUDGET_ERROR_TEXT ? BUDGET_ERROR_TEXT[code as keyof typeof BUDGET_ERROR_TEXT] : ERROR_TEXT.salvar_falhou;

function BudgetForm({ contextId, category, startMonth }: { contextId: string; category: string; startMonth: string | undefined }) {
  const { today } = useSession();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const rows = useCategoryBudgets(contextId);
  const set = useSetCategoryBudget();
  const del = useDeleteCategoryBudget();
  const setKeys = useBudgetOperationKey();
  const delKeys = useBudgetOperationKey();
  const mask = useMoneyMask();

  const currentMonth = monthOf(today);
  const bounds = budgetMonthBounds(today);
  const requested = typeof startMonth === 'string' && isValidIsoMonth(startMonth) && budgetMonthError(startMonth, today) === null ? startMonth : null;
  const [month, setMonth] = useState<IsoMonth>(requested ?? currentMonth);
  // null: o campo segue o orçamento em vigor no mês escolhido; texto: a pessoa digitou.
  const [amountDraft, setAmountDraft] = useState<string | null>(null);
  const [errors, setErrors] = useState<Partial<Record<'amountText' | 'fromMonth', string>>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [retry, setRetry] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<null | 'tirar' | 'voltar'>(null);
  const [working, setWorking] = useState(false);
  const [leaveTo, setLeaveTo] = useState<null | (() => void)>(null);
  const [confirmDiscard, setConfirmDiscard] = useState<null | (() => void)>(null);
  const amountRef = useRef<TextInput>(null);
  /** Tentativa de salvar com resultado incerto: o conteúdo e a versão enviados, para repetir idêntico (mesma chave). */
  const attempt = useRef<{ contentKey: string; expectedVersion: number } | null>(null);

  const mine: CategoryBudget[] = (rows.data ?? []).filter((r) => r.category === category);
  const inEffect = budgetRowFor(mine, category, month);
  /** A linha que começa exatamente neste mês: é ela que salvar altera (versão 0 se não existe). */
  const exact = mine.find((r) => r.fromMonth === month) ?? null;
  /** A linha em vigor no mês anterior: é a que volta a valer se a deste mês sair. */
  const before = budgetRowFor(mine, category, addMonths(month, -1));
  const beforeCents = before?.amountCents ?? null;
  const amountText = amountDraft ?? (inEffect && inEffect.amountCents !== null ? centsToInput(inEffect.amountCents) : '');
  const dirty = amountDraft !== null;

  usePreventRemove(dirty && !leaveTo, ({ data }) => {
    setConfirmDiscard(() => () => navigation.dispatch(data.action));
  });
  useEffect(() => {
    if (leaveTo) leaveTo();
  }, [leaveTo]);
  const leave = (fn: () => void) => setLeaveTo(() => fn);
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/orcamento'));

  const done = (text: string) => {
    // Confirmação tátil só depois da gravação confirmada.
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    flash.set(text);
    leave(goBack);
  };

  const showRefusal = (code: string) => {
    if (code === 'valor_invalido' || code === 'valor_acima_do_limite') {
      setErrors({ amountText: errorText(code) });
      amountRef.current?.focus();
      return;
    }
    if (code === 'mes_invalido' || code === 'vigencia_fora_do_intervalo') {
      setErrors({ fromMonth: errorText(code) });
      return;
    }
    // Outra pessoa ou outro aparelho mudou a linha: recarrega para a próxima tentativa usar a versão atual.
    if (code === 'versao_desatualizada' || code === 'nao_encontrado') rows.refetch();
    setBanner(errorText(code));
  };

  const submit = async () => {
    if (busy || !rows.data) return;
    const v = validateBudgetDraft({ category, amountText, fromMonth: month }, today);
    if (!v.ok) {
      setErrors(v.errors);
      if (v.errors.amountText) amountRef.current?.focus();
      return;
    }
    setErrors({});
    setBanner(null);
    setBusy(true);
    // Repetir depois de falha de rede: o mesmo conteúdo, com a versão da primeira tentativa, para o banco reconhecer a chave.
    const contentKey = JSON.stringify([v.category, v.fromMonth, v.amountCents]);
    const prev = attempt.current;
    const expectedVersion = setKeys.hasPending() && prev?.contentKey === contentKey ? prev.expectedVersion : (exact?.version ?? 0);
    const snapshot = JSON.stringify([v.category, v.fromMonth, expectedVersion, v.amountCents]);
    const key = setKeys.keyFor(snapshot);
    try {
      const saved = await set.mutateAsync({ key, contextId, category: v.category, fromMonth: v.fromMonth, expectedVersion, amountCents: v.amountCents });
      setKeys.settled();
      attempt.current = null;
      setRetry(false);
      done(BUDGET_TEXT.form.saved(category, saved.fromMonth));
    } catch (e) {
      if (isRefusal(e) && isRepoError(e)) {
        setKeys.refused();
        attempt.current = null;
        setRetry(false);
        showRefusal(e.code);
      } else {
        // Falha de rede: a gravação pode ou não ter acontecido. Guardar a tentativa para reconciliar.
        setKeys.uncertain(key, snapshot);
        attempt.current = { contentKey, expectedVersion };
        setRetry(true);
        setBanner(ERROR_TEXT.salvar_falhou);
      }
    } finally {
      setBusy(false);
    }
  };

  /**
   * "Tirar o orçamento a partir de {mês}": uma linha sem valor, que encerra a vigência. Quando a linha deste mês tem valor e não
   * há orçamento antes dela, basta excluí-la (o resultado é o mesmo, sem deixar uma linha sem valor).
   */
  const remove = async () => {
    if (working) return;
    setWorking(true);
    setBanner(null);
    const dropRow = exact !== null && exact.amountCents !== null && beforeCents === null ? exact : null;
    const expectedVersion = exact?.version ?? 0;
    const snapshot = dropRow ? JSON.stringify([dropRow.id, dropRow.version]) : JSON.stringify([category, month, expectedVersion, null]);
    const key = delKeys.keyFor(snapshot);
    try {
      if (dropRow) await del.mutateAsync({ key, id: dropRow.id, version: dropRow.version });
      else await set.mutateAsync({ key, contextId, category, fromMonth: month, expectedVersion, amountCents: null });
      delKeys.settled();
      setConfirm(null);
      done(BUDGET_TEXT.form.removed(category, month));
    } catch (e) {
      setConfirm(null);
      if (isRefusal(e) && isRepoError(e)) {
        delKeys.refused();
        showRefusal(e.code);
      } else {
        delKeys.uncertain(key, snapshot);
        setBanner(ERROR_TEXT.salvar_falhou);
      }
    } finally {
      setWorking(false);
    }
  };

  /** Desfaz a retirada: exclui a linha sem valor deste mês, e a anterior volta a valer. */
  const restore = async () => {
    if (!exact || working) return;
    setWorking(true);
    setBanner(null);
    const snapshot = JSON.stringify([exact.id, exact.version]);
    const key = delKeys.keyFor(snapshot);
    try {
      await del.mutateAsync({ key, id: exact.id, version: exact.version });
      delKeys.settled();
      setConfirm(null);
      done(BUDGET_TEXT.form.deleted(category));
    } catch (e) {
      setConfirm(null);
      if (isRefusal(e) && isRepoError(e)) {
        delKeys.refused();
        showRefusal(e.code);
      } else {
        delKeys.uncertain(key, snapshot);
        setBanner(ERROR_TEXT.salvar_falhou);
      }
    } finally {
      setWorking(false);
    }
  };

  const requestCancel = () => {
    if (dirty) setConfirmDiscard(() => goBack);
    else goBack();
  };

  const prevMonth = month > bounds.min ? addMonths(month, -1) : null;
  const nextMonth = month < bounds.max ? addMonths(month, 1) : null;
  const canRemove = inEffect !== null && inEffect.amountCents !== null;
  const endedHere = exact !== null && exact.amountCents === null;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SubHeader title={BUDGET_TEXT.form.title(category)} onBack={requestCancel} right={<ContextPill label="Salvando em Pessoal" />} />
      <Screen contentStyle={{ padding: space[5], gap: space[4], paddingBottom: space[6] }}>
        <Txt>{BUDGET_TEXT.form.intro(category)}</Txt>

        {rows.isPending ? (
          <View style={{ gap: space[3] }}>
            <Skeleton width="100%" height={72} />
            <Skeleton width="100%" height={72} />
          </View>
        ) : rows.isError || !rows.data ? (
          <ErrorState message={ERROR_TEXT.carregar_falhou} onRetry={() => rows.refetch()} />
        ) : (
          <>
            <Card style={{ gap: space[4] }}>
              <TextField
                ref={amountRef}
                label={BUDGET_TEXT.form.amountLabel}
                prefix="R$"
                value={amountText}
                onChangeText={(t) => {
                  setAmountDraft(t);
                  setErrors((e) => ({ ...e, amountText: undefined }));
                }}
                onBlur={() => {
                  const v = validateBudgetDraft({ category, amountText, fromMonth: month }, today);
                  if (v.ok) setAmountDraft(centsToInput(v.amountCents));
                }}
                placeholder="0,00"
                keyboardType="decimal-pad"
                inputMode="decimal"
                large
                error={errors.amountText}
              />
              <SumValues target={amountRef} onUse={(t) => setAmountDraft(t)} />

              <View style={{ gap: space[2] }}>
                <Txt variant="label" style={{ fontFamily: fonts.bold }}>
                  {BUDGET_TEXT.form.fromLabel}
                </Txt>
                <Txt variant="caption" color={colors.textSecondary}>
                  {BUDGET_TEXT.form.fromHint}
                </Txt>
                <MonthStepper
                  groupLabel={BUDGET_TEXT.form.fromLabel}
                  label={formatMonthBR(month)}
                  prevLabel={prevMonth ? BUDGET_TEXT.form.monthPrev(prevMonth) : 'Mês anterior'}
                  nextLabel={nextMonth ? BUDGET_TEXT.form.monthNext(nextMonth) : 'Próximo mês'}
                  onPrev={
                    prevMonth
                      ? () => {
                          setMonth(prevMonth);
                          setErrors((e) => ({ ...e, fromMonth: undefined }));
                          announceOnIOS(formatMonthYearBR(prevMonth));
                        }
                      : null
                  }
                  onNext={
                    nextMonth
                      ? () => {
                          setMonth(nextMonth);
                          setErrors((e) => ({ ...e, fromMonth: undefined }));
                          announceOnIOS(formatMonthYearBR(nextMonth));
                        }
                      : null
                  }
                />
                {errors.fromMonth ? (
                  <Txt variant="label" color={colors.error} accessibilityLiveRegion="polite" accessibilityRole="alert">
                    {errors.fromMonth}
                  </Txt>
                ) : null}
              </View>
              {exact ? (
                <Txt variant="caption" color={colors.textSecondary}>
                  {endedHere ? `O orçamento foi tirado a partir de ${formatMonthYearBR(exact.fromMonth)}. Ao salvar, um valor volta a valer.` : BUDGET_TEXT.form.existing(exact.fromMonth)}
                </Txt>
              ) : null}
            </Card>

            {mine.length > 0 ? (
              <Card style={{ gap: space[1] }}>
                <Txt variant="title" accessibilityRole="header" aria-level={2}>
                  {BUDGET_TEXT.form.historyTitle}
                </Txt>
                {mine.map((r) => (
                  <MoneyTxt key={r.id} variant="label" style={{ minHeight: 28 }}>
                    {BUDGET_TEXT.form.historyRow(r.fromMonth, r.amountCents)}
                  </MoneyTxt>
                ))}
              </Card>
            ) : null}

            {canRemove ? <Button label={BUDGET_TEXT.form.removeFrom(month)} tone="danger" onPress={() => setConfirm('tirar')} /> : null}
            {endedHere && before && beforeCents !== null ? (
              <Button label={mask(BUDGET_TEXT.form.restore(beforeCents, before.fromMonth))} tone="soft" onPress={() => setConfirm('voltar')} />
            ) : null}
          </>
        )}
      </Screen>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, space[3]) }]}>
        <View style={styles.footerInner}>
          {banner ? (
            <Banner tone="erro" icon={AlertCircle}>
              <Txt variant="label" color={colors.error} style={{ fontFamily: fonts.bold }}>
                {banner}
              </Txt>
            </Banner>
          ) : null}
          <View style={styles.footerRow}>
            <Button label={BUDGET_TEXT.form.cancel} tone="ghost" onPress={requestCancel} style={styles.cancel} />
            <Button
              label={retry ? BUDGET_TEXT.retry : BUDGET_TEXT.form.save}
              busy={busy}
              busyLabel="Salvando…"
              disabled={!rows.data}
              onPress={() => submit()}
              style={styles.save}
            />
          </View>
        </View>
      </View>

      <ConfirmDialog
        visible={confirm === 'tirar'}
        title={BUDGET_TEXT.form.removeTitle(category, month)}
        cancelLabel={BUDGET_TEXT.form.cancel}
        confirmLabel={BUDGET_TEXT.form.removeConfirm}
        busy={working}
        onCancel={() => setConfirm(null)}
        onConfirm={() => remove()}>
        <Txt color={colors.textSecondary}>{BUDGET_TEXT.form.removeBody}</Txt>
      </ConfirmDialog>

      <ConfirmDialog
        visible={confirm === 'voltar' && beforeCents !== null}
        title={mask(BUDGET_TEXT.form.restoreTitle(beforeCents ?? BUDGET_MIN_CENTS, month))}
        cancelLabel={BUDGET_TEXT.form.cancel}
        confirmLabel={BUDGET_TEXT.form.restoreConfirm}
        busy={working}
        onCancel={() => setConfirm(null)}
        onConfirm={() => restore()}>
        <Txt color={colors.textSecondary}>{BUDGET_TEXT.form.restoreBody}</Txt>
      </ConfirmDialog>

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
