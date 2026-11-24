import { BUSINESS_NAME_MAX, BUSINESS_TEXT, businessErrorText, businessNameError, businessPeopleErrorText, normalizeBusinessName } from '@clarevo/core';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, View, type TextInput } from 'react-native';

import { FormFooter } from '@/components/form-footer';
import { ContextPill, SubHeader } from '@/components/header';
import { useLeaveGuard } from '@/components/leave-guard';
import { ErrorState, LoadingState } from '@/components/states';
import { Button, Card, Screen, TextField, Txt } from '@/components/ui';
import { flash } from '@/lib/flash';
import { KEYBOARD_BEHAVIOR } from '@/lib/keyboard';
import { useBusiness, useRenameBusiness } from '@/state/business';
import { attemptFamily, useFamilyKeys } from '@/state/family';
import { colors, space } from '@/theme/tokens';

const T = BUSINESS_TEXT;
const BACK = '/negocio';

/** Mudar o nome do negócio (D-113): o nome que aparece no seletor de espaço e nas pílulas. */
export default function NomeNegocioScreen() {
  const business = useBusiness();
  if (business.isPending || business.isError || !business.data) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <SubHeader title={T.rename} right={<ContextPill label={T.context} fixed />} />
        <Screen contentStyle={{ padding: space[5], gap: space[4] }}>
          {business.isPending ? (
            <LoadingState label={T.loading} />
          ) : business.isError ? (
            <ErrorState message={T.loadFailed} onRetry={() => business.refetch()} />
          ) : (
            <Card style={{ gap: space[3] }}>
              <Txt>{businessErrorText('nao_encontrado')}</Txt>
              <Button label={T.accountOpen} tone="soft" onPress={() => router.replace(BACK)} />
            </Card>
          )}
        </Screen>
      </View>
    );
  }
  // Só quem administra muda o nome (D-116): para as outras pessoas do negócio, a recusa que o banco daria, sem formulário.
  if (business.data.role !== 'titular') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <SubHeader title={T.rename} right={<ContextPill label={business.data.name} fixed />} />
        <Screen contentStyle={{ padding: space[5], gap: space[4] }}>
          <Card style={{ gap: space[3] }}>
            <Txt>{businessPeopleErrorText('sem_permissao')}</Txt>
            <Button label={T.accountOpen} tone="soft" onPress={() => router.replace(BACK)} />
          </Card>
        </Screen>
      </View>
    );
  }
  return <RenameForm id={business.data.id} current={business.data.name} />;
}

function RenameForm({ id, current }: { id: string; current: string }) {
  const rename = useRenameBusiness();
  const keys = useFamilyKeys();
  const [name, setName] = useState(current);
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<TextInput>(null);
  const guard = useLeaveGuard(name.trim() !== current && !busy, BACK);

  async function submit() {
    if (busy) return;
    const bad = businessNameError(name);
    if (bad) {
      setFieldError(businessErrorText(bad));
      nameRef.current?.focus();
      return;
    }
    const clean = normalizeBusinessName(name);
    if (clean === current) {
      guard.leave(() => router.replace(BACK));
      return;
    }
    setFieldError(undefined);
    setError(null);
    setBusy(true);
    try {
      const r = await attemptFamily(keys, `renomear:${clean}`, (key) => rename.mutateAsync({ key, contextId: id, name: clean }));
      if (r.ok) {
        flash.set(T.renamed);
        guard.leave(() => router.replace(BACK));
        return;
      }
      if (r.code === 'nome_do_negocio_invalido') {
        setFieldError(businessErrorText(r.code));
        nameRef.current?.focus();
        return;
      }
      setError(businessErrorText(r.code));
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={KEYBOARD_BEHAVIOR}>
      <SubHeader title={T.rename} onBack={guard.requestCancel} right={<ContextPill label={current} fixed />} />
      <Screen contentStyle={{ padding: space[5], gap: space[4], paddingBottom: space[6] }}>
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
            maxLength={BUSINESS_NAME_MAX * 2}
            autoFocus
            error={fieldError}
            returnKeyType="done"
            onSubmitEditing={submit}
          />
        </Card>
      </Screen>
      <FormFooter error={error} onCancel={guard.requestCancel} submitLabel={T.renameSubmit} busy={busy} onSubmit={submit} />
      {guard.dialog}
    </KeyboardAvoidingView>
  );
}
