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
  type BusinessPairKind,
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
import { useBusiness, useCreateContribution, useCreateWithdrawal } from '@/state/business';
import { useAccounts, useSpace } from '@/state/data';
import { attemptFamily, useFamilyKeys } from '@/state/family';
import { useSession } from '@/state/session';
import { colors, space } from '@/theme/tokens';

const T = BUSINESS_TEXT;
const BACK = '/negocio';

/** Os textos de cada par: a retirada (sai do negócio, entra no Pessoal) e o dinheiro trazido do Pessoal (o inverso, D-121). */
const PAIR_TEXT = {
  retirada: {
    title: T.withdrawTitle,
    hint: T.withdrawHint,
    date: 'Data da retirada',
    business: T.withdrawFrom,
    personal: T.withdrawTo,
    descriptionHint: T.withdrawDescriptionHint,
    submit: T.withdrawSubmit,
    saved: T.withdrawSaved,
    locked: T.withdrawalLocked,
  },
  aporte: {
    title: T.contributeTitle,
    hint: T.contributeHint,
    date: T.contributeDate,
    business: T.contributeTo,
    personal: T.contributeFrom,
    descriptionHint: T.contributeDescriptionHint,
    submit: T.contributeSubmit,
    saved: T.contributeSaved,
    locked: T.contributionLocked,
  },
} as const;

/**
 * Os dois movimentos ligados entre o negócio e o Pessoal (D-113, D-121), gravados juntos e ligados, cada lado contando uma vez no próprio
 * espaço: a retirada para o Pessoal (gasto "Retirada para o Pessoal" no negócio e recebimento "Retirada do negócio" no Pessoal) e o dinheiro
 * trazido do Pessoal (gasto "Dinheiro para o negócio" no Pessoal e entrada "Dinheiro do Pessoal" no negócio, fora da operação em "Seu
 * negócio"). Quem só vê o negócio não encontra o formulário.
 */
export function BusinessPairScreen({ kind }: { kind: BusinessPairKind }) {
  const P = PAIR_TEXT[kind];
  const business = useBusiness();
  const personal = useSpace();
  const accounts = useAccounts(business.data?.id);
  const ready = business.data && personal.data && accounts.data;
  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <SubHeader title={P.title} right={<ContextPill label={business.data?.name ?? T.context} fixed />} />
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
  // Quem só vê o negócio (D-116) não retira nem traz dinheiro: a recusa que o banco daria, sem formulário.
  if (business.data!.role === 'leitor') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <SubHeader title={P.title} right={<ContextPill label={business.data!.name} fixed />} />
        <Screen contentStyle={{ padding: space[5], gap: space[4] }}>
          <Card style={{ gap: space[3] }}>
            <Txt>{BUSINESS_ROLE_HELP.leitor}</Txt>
            <Button label={T.accountOpen} tone="soft" onPress={() => router.replace(BACK)} />
          </Card>
        </Screen>
      </View>
    );
  }
  return <PairForm kind={kind} business={business.data!} businessAccounts={activeAccounts(accounts.data!)} personalAccounts={personal.data!.accounts} />;
}

function PairForm({
  kind,
  business,
  businessAccounts,
  personalAccounts,
}: {
  kind: BusinessPairKind;
  business: BusinessContext;
  businessAccounts: FinancialAccount[];
  personalAccounts: FinancialAccount[];
}) {
  const P = PAIR_TEXT[kind];
  const { today } = useSession();
  const withdraw = useCreateWithdrawal();
  const contribute = useCreateContribution();
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
      const slot = `${kind}:${JSON.stringify(v.input)}`;
      const r = await attemptFamily(keys, slot, (key) =>
        kind === 'retirada'
          ? withdraw.mutateAsync({ key, businessContextId: business.id, input: v.input })
          : contribute.mutateAsync({ key, businessContextId: business.id, input: v.input }),
      );
      if (r.ok) {
        flash.set(P.saved);
        guard.leave(() => router.replace(BACK));
        return;
      }
      setError(businessErrorText(r.code));
    } finally {
      setBusy(false);
    }
  }

  const businessPicker = (
    <AccountPicker
      accounts={businessAccounts}
      value={draft.businessAccountId}
      onChange={(id) => set('businessAccountId', id ?? '')}
      label={P.business}
      error={errors.businessAccountId}
      hideManage
    />
  );
  const personalPicker = (
    <AccountPicker
      accounts={personalAccounts}
      value={draft.personalAccountId}
      onChange={(id) => set('personalAccountId', id ?? '')}
      label={P.personal}
      error={errors.personalAccountId}
      hideManage
    />
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={KEYBOARD_BEHAVIOR}>
      <SubHeader title={P.title} onBack={guard.requestCancel} right={<ContextPill label={business.name} fixed />} />
      <Screen contentStyle={{ padding: space[5], gap: space[4], paddingBottom: space[6] }}>
        <Txt color={colors.textSecondary}>{P.hint}</Txt>
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
              label={P.date}
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
          {/* De onde sai primeiro: na retirada, do negócio; no dinheiro trazido do Pessoal, do Pessoal. */}
          {kind === 'retirada' ? businessPicker : personalPicker}
          {kind === 'retirada' ? personalPicker : businessPicker}
          <TextField
            ref={refs.description}
            label={T.withdrawDescriptionLabel}
            hint={P.descriptionHint(business.name)}
            value={draft.description}
            onChangeText={(t) => set('description', t)}
            maxLength={80}
            error={errors.description}
            returnKeyType="done"
            onSubmitEditing={submit}
          />
        </Card>
        <Txt variant="caption" color={colors.textSecondary}>
          {P.locked}
        </Txt>
      </Screen>
      <FormFooter error={error} onCancel={guard.requestCancel} submitLabel={P.submit} busy={busy} onSubmit={submit} />
      {guard.dialog}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
});
