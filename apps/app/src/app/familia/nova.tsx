import { FAMILY_NAME_MAX, FAMILY_TEXT, familyErrorText, familyNameError, normalizeFamilyName } from '@clarevo/core';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, View, type TextInput } from 'react-native';

import { useIsSeededDemo } from '@/components/family-parts';
import { FormFooter } from '@/components/form-footer';
import { ContextPill, SubHeader } from '@/components/header';
import { useLeaveGuard } from '@/components/leave-guard';
import { ErrorState, LoadingState } from '@/components/states';
import { Button, Card, Screen, TextField, Txt } from '@/components/ui';
import { flash } from '@/lib/flash';
import { attemptFamily, useCreateFamily, useFamily, useFamilyKeys } from '@/state/family';
import { colors, space } from '@/theme/tokens';

const T = FAMILY_TEXT;
const BACK = '/familia';

/** Criar Família (D-055): um nome, e a pessoa vira titular. Na demonstração com dados fictícios não há criação. */
export default function NovaFamiliaScreen() {
  const demo = useIsSeededDemo();
  const family = useFamily();
  const create = useCreateFamily();
  const keys = useFamilyKeys();
  const [name, setName] = useState('');
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<TextInput>(null);
  const guard = useLeaveGuard(name.trim() !== '' && !busy, BACK);

  async function submit() {
    if (busy) return;
    const bad = familyNameError(name);
    if (bad) {
      setFieldError(familyErrorText(bad));
      setError(null);
      nameRef.current?.focus();
      return;
    }
    setFieldError(undefined);
    setError(null);
    setBusy(true);
    try {
      const clean = normalizeFamilyName(name);
      const r = await attemptFamily(keys, `criar:${clean}`, (key) => create.mutateAsync({ key, name: clean }));
      if (r.ok) {
        flash.set(T.created);
        guard.leave(() => router.replace(BACK));
        return;
      }
      if (r.code === 'nome_da_familia_invalido') {
        setFieldError(familyErrorText(r.code));
        nameRef.current?.focus();
        return;
      }
      setError(familyErrorText(r.code));
    } finally {
      setBusy(false);
    }
  }

  const header = <SubHeader title={T.createTitle} onBack={guard.requestCancel} right={<ContextPill label="Família" fixed />} />;

  if (demo) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {header}
        <Screen contentStyle={{ padding: space[5], gap: space[4] }}>
          <Card style={{ gap: space[3] }}>
            <Txt>{T.demoOnly}</Txt>
          </Card>
          <Button label="Voltar" tone="soft" onPress={() => (router.canGoBack() ? router.back() : router.replace(BACK))} />
        </Screen>
      </View>
    );
  }

  if (family.isPending || family.isError || family.data) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {header}
        <Screen contentStyle={{ padding: space[5], gap: space[4] }}>
          {family.isError ? (
            <ErrorState message={T.loadFailed} onRetry={() => family.refetch()} />
          ) : family.data ? (
            <Card style={{ gap: space[3] }}>
              <Txt>{familyErrorText('ja_em_familia')}</Txt>
              <Button label={T.accountOpen} tone="soft" onPress={() => router.replace(BACK)} />
            </Card>
          ) : (
            <LoadingState label={T.loading} />
          )}
        </Screen>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {header}
      <Screen contentStyle={{ padding: space[5], gap: space[4], paddingBottom: space[6] }}>
        <Txt color={colors.textSecondary}>{T.intro}</Txt>
        <Card style={{ gap: space[4] }}>
          <TextField
            ref={nameRef}
            label={T.nameLabel}
            hint={T.nameHint}
            value={name}
            onChangeText={(t) => {
              setName(t);
              setFieldError(undefined);
            }}
            maxLength={FAMILY_NAME_MAX}
            autoFocus
            error={fieldError}
            returnKeyType="done"
            onSubmitEditing={submit}
          />
        </Card>
        <Txt variant="caption" color={colors.textSecondary}>
          {T.privacy}
        </Txt>
        <Txt variant="caption" color={colors.textSecondary}>
          {T.oneAtATime}
        </Txt>
      </Screen>
      <FormFooter error={error} onCancel={guard.requestCancel} submitLabel={T.createSubmit} busy={busy} onSubmit={submit} />
      {guard.dialog}
    </KeyboardAvoidingView>
  );
}
