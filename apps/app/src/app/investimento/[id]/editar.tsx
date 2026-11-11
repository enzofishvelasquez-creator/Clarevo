import { ERROR_TEXT, INVESTMENT_TEXT } from '@clarevo/core';
import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { ContextPill, SubHeader } from '@/components/header';
import { InvestmentForm } from '@/components/investment-form';
import { ErrorState, LoadingState } from '@/components/states';
import { Button, Card, Screen, Txt } from '@/components/ui';
import { useInvestment } from '@/state/data';
import { colors, space } from '@/theme/tokens';

/** Editar o nome e o tipo de um investimento (D-093). */
export default function EditarInvestimentoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const one = useInvestment(id);
  if (one.isSuccess && one.data) return <InvestmentForm contextId={one.data.contextId} investment={one.data} />;
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SubHeader title={INVESTMENT_TEXT.form.editTitle} right={<ContextPill label="Salvando em Pessoal" fixed />} />
      <Screen contentStyle={{ padding: space[5], gap: space[4] }}>
        {one.isError ? (
          <ErrorState message={ERROR_TEXT.carregar_falhou} onRetry={() => one.refetch()} />
        ) : one.isSuccess ? (
          <Card style={{ gap: space[3] }}>
            <Txt>{INVESTMENT_TEXT.errors.notFound}</Txt>
            <Button label="Ir para Investimentos" onPress={() => router.replace('/investimentos')} />
          </Card>
        ) : (
          <LoadingState />
        )}
      </Screen>
    </View>
  );
}
