import { ACCOUNTS_TEXT, ERROR_TEXT } from '@clarevo/core';
import { View } from 'react-native';

import { AccountForm } from '@/components/account-form';
import { ContextPill, SubHeader } from '@/components/header';
import { ErrorState, LoadingState } from '@/components/states';
import { Screen } from '@/components/ui';
import { useAccounts, useSpace } from '@/state/data';
import { colors, space } from '@/theme/tokens';

/** Nova conta de origem do dinheiro (D-043). */
export default function NovaContaScreen() {
  const personal = useSpace();
  const ctx = personal.data?.personalContextId;
  const accounts = useAccounts(ctx);
  if (ctx && accounts.data) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <AccountForm mode={{ type: 'novo' }} contextId={ctx} accounts={accounts.data} />
      </View>
    );
  }
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SubHeader title={ACCOUNTS_TEXT.newTitle} right={<ContextPill label="Salvando em Pessoal" />} />
      <Screen contentStyle={{ padding: space[5], gap: space[4] }}>
        {personal.isError || accounts.isError ? (
          <ErrorState message={ERROR_TEXT.carregar_falhou} onRetry={() => (personal.isError ? personal.refetch() : accounts.refetch())} />
        ) : (
          <LoadingState />
        )}
      </Screen>
    </View>
  );
}
