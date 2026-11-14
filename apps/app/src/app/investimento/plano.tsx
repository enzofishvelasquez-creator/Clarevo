import {
  ERROR_TEXT,
  INVESTMENT_PLAN_TEXT,
  formatBRL,
  investmentDepositHistory,
  investmentPlanLine,
  isRepoError,
  newOperationKey,
  validateInvestmentPlanText,
} from '@clarevo/core';
import { router } from 'expo-router';
import { Trash2 } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, View, type TextInput } from 'react-native';

import { formatMoneyText } from '@/components/calc/parts';
import { ConfirmDialog } from '@/components/dialog';
import { ContextPill, SubHeader } from '@/components/header';
import { useLeaveGuard } from '@/components/leave-guard';
import { MoneyTxt } from '@/components/money-text';
import { ErrorState, LoadingState } from '@/components/states';
import { Body, Button, Card, Screen, TextField, Txt } from '@/components/ui';
import { DEVICE_FEATURES } from '@/lib/device';
import { flash } from '@/lib/flash';
import { useContextInvestmentMovements, useInvestmentPlan, useSetInvestmentPlan, useSpace, useWorkOf } from '@/state/data';
import { useSession } from '@/state/session';
import { colors, fonts, space, tabular } from '@/theme/tokens';

const T = INVESTMENT_PLAN_TEXT;

/**
 * Plano de aportes dos investimentos (D-099, item 12): quanto a pessoa pretende aportar por mês, o aportado de cada um dos últimos seis
 * meses ao lado, sem cor, sem sequência e sem comparação. Só no Pessoal. Tirar o plano não muda investimento nem aporte.
 */
export default function PlanoScreen() {
  const { today } = useSession();
  const space_ = useSpace();
  const personal = useWorkOf('pessoal');
  const contextId = space_.data?.personalContextId;
  const plan = useInvestmentPlan(contextId);
  const movements = useContextInvestmentMovements(contextId);
  const save = useSetInvestmentPlan();
  const canWrite = personal.data?.canWrite ?? true;
  const initialText = plan.data ? formatBRL(plan.data.plannedMonthlyCents).replace(/^R\$\s?/, '') : '';
  const [text, setText] = useState<string | null>(null);
  const shown = text ?? initialText;
  const [fieldError, setFieldError] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [saveKey, setSaveKey] = useState(() => newOperationKey());
  const [removeKey] = useState(() => newOperationKey());
  const amountRef = useRef<TextInput>(null);
  const dirty = text !== null && text !== initialText;
  const guard = useLeaveGuard(dirty && !save.isPending, '/investimentos');

  // Outro valor digitado depois de um salvamento: chave nova (a anterior já tem outro pedido gravado).
  useEffect(() => {
    if (text !== null) setSaveKey(newOperationKey());
  }, [text]);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/investimentos'));

  async function submit() {
    if (!contextId || save.isPending) return;
    const v = validateInvestmentPlanText(shown);
    if (!v.ok) {
      setFieldError(v.error);
      setError(null);
      amountRef.current?.focus();
      return;
    }
    setFieldError(undefined);
    setError(null);
    try {
      await save.mutateAsync({ key: saveKey, contextId, plannedCents: v.cents });
      flash.set(T.saved);
      guard.leave(back);
    } catch (e) {
      setError(errorText(e));
    }
  }

  async function remove() {
    if (!contextId || save.isPending) return;
    setError(null);
    try {
      await save.mutateAsync({ key: removeKey, contextId, plannedCents: null });
      setConfirmRemove(false);
      flash.set(T.removed);
      guard.leave(back);
    } catch (e) {
      setConfirmRemove(false);
      setError(errorText(e));
    }
  }

  const history = movements.data ? investmentDepositHistory(movements.data, today) : [];
  const line = movements.data ? investmentPlanLine(plan.data ?? null, movements.data, today) : null;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SubHeader title={T.screenTitle} onBack={guard.requestCancel} right={<ContextPill label="Pessoal" fixed />} />
      <Screen>
        <Body>
          {space_.isError || plan.isError || movements.isError ? (
            <ErrorState
              message={ERROR_TEXT.carregar_falhou}
              onRetry={() => {
                space_.refetch();
                plan.refetch();
                movements.refetch();
              }}
            />
          ) : plan.data === undefined || !movements.data ? (
            <LoadingState />
          ) : (
            <>
              <Txt color={colors.textSecondary}>{T.intro}</Txt>
              {line ? (
                <Card>
                  <MoneyTxt variant="label" style={{ fontFamily: fonts.bold }}>
                    {line}
                  </MoneyTxt>
                </Card>
              ) : null}
              {canWrite ? (
                <Card style={{ gap: space[4] }}>
                  <TextField
                    ref={amountRef}
                    label={T.amountLabel}
                    hint={T.amountHint}
                    prefix="R$"
                    large
                    placeholder="0,00"
                    keyboardType="decimal-pad"
                    inputMode="decimal"
                    value={shown}
                    onChangeText={(t) => {
                      setText(t);
                      if (fieldError) setFieldError(undefined);
                    }}
                    onBlur={() => setText(formatMoneyText(shown))}
                    onSubmitEditing={submit}
                    error={fieldError}
                  />
                  {error ? (
                    <Txt variant="label" color={colors.error} accessibilityLiveRegion="polite">
                      {error}
                    </Txt>
                  ) : null}
                  <Button label={T.save} onPress={submit} busy={save.isPending && !confirmRemove} />
                  {plan.data ? <Button label={T.remove} icon={Trash2} tone="ghost" onPress={() => setConfirmRemove(true)} /> : null}
                </Card>
              ) : null}
              <Card style={{ gap: space[2] }}>
                <Txt variant="title" accessibilityRole="header" aria-level={2}>
                  {T.historyTitle}
                </Txt>
                {history.map((h) => (
                  <MoneyTxt key={h.month} style={tabular}>
                    {T.historyLine(h.month, h.depositedCents, h.current)}
                  </MoneyTxt>
                ))}
                <Txt variant="caption" color={colors.textSecondary}>
                  {T.historyNote}
                </Txt>
              </Card>
              {DEVICE_FEATURES ? (
                <View>
                  <Txt variant="caption" color={colors.textSecondary}>
                    {T.reminderNote}
                  </Txt>
                </View>
              ) : null}
            </>
          )}
        </Body>
      </Screen>
      <ConfirmDialog
        visible={confirmRemove}
        title={T.removeTitle}
        cancelLabel={T.cancel}
        confirmLabel={T.removeConfirm}
        busy={save.isPending}
        onCancel={() => setConfirmRemove(false)}
        onConfirm={remove}>
        <Txt color={colors.textSecondary}>{T.removeBody}</Txt>
      </ConfirmDialog>
      {guard.dialog}
    </KeyboardAvoidingView>
  );
}

function errorText(e: unknown): string {
  const code = isRepoError(e) ? e.code : 'desconhecido';
  if (code === 'contexto_invalido') return T.personalOnly;
  if (code === 'valor_invalido') return T.amountInvalid;
  return T.saveError;
}
