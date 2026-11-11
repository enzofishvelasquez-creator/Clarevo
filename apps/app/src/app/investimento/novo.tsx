import { INVESTMENT_TEXT } from '@clarevo/core';
import { View } from 'react-native';

import { ContextPill, SubHeader } from '@/components/header';
import { InvestmentForm } from '@/components/investment-form';
import { LoadingState } from '@/components/states';
import { useSpace } from '@/state/data';
import { colors } from '@/theme/tokens';

/** Novo investimento (D-093), sempre no Pessoal. */
export default function NovoInvestimentoScreen() {
  const space = useSpace();
  const contextId = space.data?.personalContextId;
  if (contextId) return <InvestmentForm contextId={contextId} investment={null} />;
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SubHeader title={INVESTMENT_TEXT.form.newTitle} right={<ContextPill label="Salvando em Pessoal" fixed />} />
      <LoadingState />
    </View>
  );
}
