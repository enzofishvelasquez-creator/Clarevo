import { BUSINESS_NAME_MAX, BUSINESS_TEXT, businessErrorText, businessNameError, normalizeBusinessName } from '@clarevo/core';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, View, type TextInput } from 'react-native';

import { useIsSeededDemo } from '@/components/family-parts';
import { FormFooter } from '@/components/form-footer';
import { ContextPill, SubHeader } from '@/components/header';
import { useLeaveGuard } from '@/components/leave-guard';
import { ErrorState, LoadingState } from '@/components/states';
import { Button, Card, Screen, TextField, Txt } from '@/components/ui';
import { flash } from '@/lib/flash';
import { KEYBOARD_BEHAVIOR } from '@/lib/keyboard';
import { useBusiness, useCreateBusiness } from '@/state/business';
import { useView } from '@/state/data';
import { attemptFamily, useFamilyKeys } from '@/state/family';
import { colors, space } from '@/theme/tokens';

const T = BUSINESS_TEXT;
const BACK = '/negocio';

/**
 * Criar o espaço Negócio (D-113): o nome do negócio, e a pessoa vira titular, com a "Conta do negócio". Um negócio por pessoa no plano.
 * Na demonstração, o negócio criado fica só na memória do aparelho (o cenário "negocio" já traz o de exemplo).
 */
export default function NovoNegocioScreen() {
  const demo = useIsSeededDemo();
  const business = useBusiness();
  const create = useCreateBusiness();
  const { setSpace } = useView();
  const keys = useFamilyKeys();
  const [name, setName] = useState('');
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<TextInput>(null);
  const guard = useLeaveGuard(name.trim() !== '' && !busy, BACK);

  async function submit() {
    if (busy) return;
    const bad = businessNameError(name);
    if (bad) {
      setFieldError(businessErrorText(bad));
      setError(null);
      nameRef.current?.focus();
      return;
    }
    setFieldError(undefined);
    setError(null);
    setBusy(true);
    try {
      const clean = normalizeBusinessName(name);
      const r = await attemptFamily(keys, `criar-negocio:${clean}`, (key) => create.mutateAsync({ key, name: clean }));
      if (r.ok) {
        flash.set(T.created);
        setSpace('negocio');
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

  const header = <SubHeader title={T.createTitle} onBack={guard.requestCancel} right={<ContextPill label={T.context} fixed />} />;

  if (business.isPending || business.isError || business.data) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {header}
        <Screen contentStyle={{ padding: space[5], gap: space[4] }}>
          {business.isError ? (
            <ErrorState message={T.loadFailed} onRetry={() => business.refetch()} />
          ) : business.isPending ? (
            <LoadingState label={T.loading} />
          ) : (
            <Card style={{ gap: space[3] }}>
              <Txt>{businessErrorText('ja_tem_negocio')}</Txt>
              <Button label={T.accountOpen} tone="soft" onPress={() => router.replace(BACK)} />
            </Card>
          )}
        </Screen>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={KEYBOARD_BEHAVIOR}>
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
            // O campo conta unidades de texto (um emoji vale 2); o limite de 60 caracteres, contados como o banco conta, vem de businessNameError.
            maxLength={BUSINESS_NAME_MAX * 2}
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
          {T.light}
        </Txt>
        <Txt variant="caption" color={colors.textSecondary}>
          {T.included}
        </Txt>
        {demo ? (
          <Txt variant="caption" color={colors.textSecondary}>
            {T.demoOnly}
          </Txt>
        ) : null}
      </Screen>
      <FormFooter error={error} onCancel={guard.requestCancel} submitLabel={T.createSubmit} busy={busy} onSubmit={submit} />
      {guard.dialog}
    </KeyboardAvoidingView>
  );
}
