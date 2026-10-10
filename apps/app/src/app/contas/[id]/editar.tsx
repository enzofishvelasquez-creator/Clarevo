import { ACCOUNTS_TEXT, ACCOUNT_ERROR_TEXT, ERROR_TEXT } from '@clarevo/core';
import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { AccountForm } from '@/components/account-form';
import { ContextPill, SubHeader } from '@/components/header';
import { ErrorState, LoadingState } from '@/components/states';
import { Button, Card, Screen, Txt } from '@/components/ui';
import { useAccounts, useSpace } from '@/state/data';
import { colors, space } from '@/theme/tokens';

/** Editar conta (D-043). Conta excluída ou sem leitura: a mensagem de sempre, nunca um formulário vazio. */
export default function EditarContaScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const personal = useSpace();
  const ctx = personal.data?.personalContextId;
  const accounts = useAccounts(ctx);
  const account = accounts.data?.find((a) => a.id === id);

  if (ctx && accounts.data && account) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <AccountForm mode={{ type: 'editar', account }} contextId={ctx} accounts={accounts.data} />
      </View>
    );
  }
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SubHeader title={ACCOUNTS_TEXT.editTitle} right={<ContextPill label="Salvando em Pessoal" />} />
      <Screen contentStyle={{ padding: space[5], gap: space[4] }}>
        {personal.isError || accounts.isError ? (
          <ErrorState message={ERROR_TEXT.carregar_falhou} onRetry={() => (personal.isError ? personal.refetch() : accounts.refetch())} />
        ) : accounts.isSuccess ? (
          <Card style={{ gap: space[3] }}>
            <Txt>{ACCOUNT_ERROR_TEXT.nao_encontrado}</Txt>
            <Button label="Ir para Conta" onPress={() => router.replace('/conta')} />
          </Card>
        ) : (
          <LoadingState />
        )}
      </Screen>
    </View>
  );
}
