import {
  BUSINESS_ROLE_HELP,
  BUSINESS_TEXT,
  WITHDRAWAL_FIELD_ORDER,
  activeAccounts,
  addDays,
  businessErrorText,
  formatDateBR,
  maskDateBR,
  validateWithdrawalDraft,
  type BusinessContext,
  type FinancialAccount,
  type WithdrawalField,
} from '@clarevo/core';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, StyleSheet, View, type TextInput } from 'react-native';

import { AccountPicker } from '@/components/account-picker';
import { FormFooter } from '@/components/form-footer';
import { ContextPill, SubHeader } from '@/components/header';
import { useLeaveGuard } from '@/components/leave-guard';
import { ErrorState, LoadingState } from '@/components/states';
import { Button, Card, Chip, Screen, TextField, Txt } from '@/components/ui';
import { flash } from '@/lib/flash';
import { KEYBOARD_BEHAVIOR } from '@/lib/keyboard';
import { useBusiness, useCreateWithdrawal } from '@/state/business';
import { useAccounts, useSpace } from '@/state/data';
import { attemptFamily, useFamilyKeys } from '@/state/family';
import { useSession } from '@/state/session';
import { colors, space } from '@/theme/tokens';

const T = BUSINESS_TEXT;
const BACK = '/negocio';

/**
 * Retirada para o Pessoal (D-113): o valor sai do negócio (gasto "Retirada para o Pessoal") e entra no Pessoal como recebimento
 * ("Retirada do negócio"), gravados juntos e ligados. Cada lado conta uma vez no próprio espaço, e em "Seu negócio" a retirada
 * fica fora de Saiu.
 */
export default function RetiradaScreen() {
  const business = useBusiness();
  const personal = useSpace();
  const accounts = useAccounts(business.data?.id);
  const ready = business.data && personal.data && accounts.data;
  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <SubHeader title={T.withdrawTitle} right={<ContextPill label={business.data?.name ?? T.context} fixed />} />
        <Screen contentStyle={{ padding: space[5], gap: space[4] }}>
          {business.isError || personal.isError || accounts.isError ? (
            <ErrorState
              message={T.loadFailed}
              onRetry={() => {
                business.refetch();
                personal.refetch();
                accounts.refetch();
              }}
            />
          ) : business.isSuccess && !business.data ? (
            <Card style={{ gap: space[3] }}>
              <Txt>{businessErrorText('nao_encontrado')}</Txt>
              <Button label={T.accountOpen} tone="soft" onPress={() => router.replace(BACK)} />
            </Card>
          ) : (
            <LoadingState label={T.loading} />
          )}
        </Screen>
      </View>
    );
  }
  // Quem só vê o negócio (D-116) não retira: a recusa que o banco daria, sem formulário.
  if (business.data!.role === 'leitor') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <SubHeader title={T.withdrawTitle} right={<ContextPill label={business.data!.name} fixed />} />
        <Screen contentStyle={{ padding: space[5], gap: space[4] }}>
          <Card style={{ gap: space[3] }}>
            <Txt>{BUSINESS_ROLE_HELP.leitor}</Txt>
            <Button label={T.accountOpen} tone="soft" onPress={() => router.replace(BACK)} />
          </Card>
        </Screen>
      </View>
    );
  }
  return <WithdrawalForm business={business.data!} businessAccounts={activeAccounts(accounts.data!)} personalAccounts={personal.data!.accounts} />;
}

function WithdrawalForm({
  business,
  businessAccounts,
  personalAccounts,
}: {
  business: BusinessContext;
  businessAccounts: FinancialAccount[];
  personalAccounts: FinancialAccount[];
}) {
  const { today } = useSession();
  const create = useCreateWithdrawal();
  const keys = useFamilyKeys();
  const initial = {
    amountText: '',
    dateText: formatDateBR(today),
    description: '',
    businessAccountId: businessAccounts[0]?.id ?? '',
    personalAccountId: personalAccounts[0]?.id ?? '',
  };
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState<Partial<Record<WithdrawalField, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const refs: Partial<Record<WithdrawalField, React.RefObject<TextInput | null>>> = {
    amountText: useRef<TextInput>(null),
    dateText: useRef<TextInput>(null),
    description: useRef<TextInput>(null),
  };
  const dirty = draft.amountText !== '' || draft.description !== '' || draft.dateText !== initial.dateText;
  const guard = useLeaveGuard(dirty && !busy, BACK);
  const set = <K extends keyof typeof draft>(k: K, v: (typeof draft)[K]) => {
    setDraft((d) => ({ ...d, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };

  async function submit() {
    if (busy) return;
    const v = validateWithdrawalDraft(draft, today);
    if (!v.ok) {
      setErrors(v.errors);
      const first = WITHDRAWAL_FIELD_ORDER.find((f) => v.errors[f]);
      if (first) refs[first]?.current?.focus();
      return;
    }
    setErrors({});
    setError(null);
    setBusy(true);
    try {
      const slot = `retirada:${JSON.stringify(v.input)}`;
      const r = await attemptFamily(keys, slot, (key) => create.mutateAsync({ key, businessContextId: business.id, input: v.input }));
      if (r.ok) {
        flash.set(T.withdrawSaved);
        guard.leave(() => router.replace(BACK));
        return;
      }
      setError(businessErrorText(r.code));
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={KEYBOARD_BEHAVIOR}>
      <SubHeader title={T.withdrawTitle} onBack={guard.requestCancel} right={<ContextPill label={business.name} fixed />} />
      <Screen contentStyle={{ padding: space[5], gap: space[4], paddingBottom: space[6] }}>
        <Txt color={colors.textSecondary}>{T.withdrawHint}</Txt>
        <Card style={{ gap: space[4] }}>
          <TextField
            ref={refs.amountText}
            label="Valor em reais"
            prefix="R$"
            value={draft.amountText}
            onChangeText={(t) => set('amountText', t)}
            placeholder="0,00"
            keyboardType="decimal-pad"
            inputMode="decimal"
            large
            autoFocus
            error={errors.amountText}
          />
          <View style={{ gap: space[2] }}>
            <TextField
              ref={refs.dateText}
              label="Data da retirada"
              value={draft.dateText}
              onChangeText={(t) => set('dateText', maskDateBR(t))}
              placeholder="DD/MM/AAAA"
              keyboardType="number-pad"
              inputMode="numeric"
              maxLength={10}
              error={errors.dateText}
              hint="Digite só os números. Só datas até hoje."
            />
            <View style={styles.chips}>
              <Chip label="Hoje" selected={draft.dateText === formatDateBR(today)} onPress={() => set('dateText', formatDateBR(today))} />
              <Chip
                label="Ontem"
                selected={draft.dateText === formatDateBR(addDays(today, -1))}
                onPress={() => set('dateText', formatDateBR(addDays(today, -1)))}
              />
            </View>
          </View>
          <AccountPicker
            accounts={businessAccounts}
            value={draft.businessAccountId}
            onChange={(id) => set('businessAccountId', id ?? '')}
            label={T.withdrawFrom}
            error={errors.businessAccountId}
            hideManage
          />
          <AccountPicker
            accounts={personalAccounts}
            value={draft.personalAccountId}
            onChange={(id) => set('personalAccountId', id ?? '')}
            label={T.withdrawTo}
            error={errors.personalAccountId}
            hideManage
          />
          <TextField
            ref={refs.description}
            label={T.withdrawDescriptionLabel}
            hint={T.withdrawDescriptionHint(business.name)}
            value={draft.description}
            onChangeText={(t) => set('description', t)}
            maxLength={80}
            error={errors.description}
            returnKeyType="done"
            onSubmitEditing={submit}
          />
        </Card>
        <Txt variant="caption" color={colors.textSecondary}>
          {T.withdrawalLocked}
        </Txt>
      </Screen>
      <FormFooter error={error} onCancel={guard.requestCancel} submitLabel={T.withdrawSubmit} busy={busy} onSubmit={submit} />
      {guard.dialog}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
});
