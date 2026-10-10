import { CARDS_TEXT, ERROR_TEXT } from '@clarevo/core';
import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { CardForm } from '@/components/card-form';
import { ContextPill, SubHeader } from '@/components/header';
import { ErrorState, LoadingState } from '@/components/states';
import { Screen } from '@/components/ui';
import { useSpace } from '@/state/data';
import { colors, space } from '@/theme/tokens';

/** Novo cartão (D-037). `?origem=gasto`: veio de Anotar gasto e, depois de salvar, volta para lá. */
export default function NovoCartaoScreen() {
  const { origem } = useLocalSearchParams<{ origem?: string }>();
  const personal = useSpace();
  if (personal.data) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <CardForm mode={{ type: 'novo', backToExpense: origem === 'gasto' }} contextId={personal.data.personalContextId} />
      </View>
    );
  }
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SubHeader title={CARDS_TEXT.form.newTitle} right={<ContextPill label="Salvando em Pessoal" />} />
      <Screen contentStyle={{ padding: space[5], gap: space[4] }}>
        {personal.isError ? <ErrorState message={ERROR_TEXT.carregar_falhou} onRetry={() => personal.refetch()} /> : <LoadingState />}
      </Screen>
    </View>
  );
}
