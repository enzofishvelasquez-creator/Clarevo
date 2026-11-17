import { INVESTMENT_TEXT, investmentTemplateFrom, investmentTemplatePreset } from '@clarevo/core';
import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { ContextPill, SubHeader } from '@/components/header';
import { InvestmentForm } from '@/components/investment-form';
import { LoadingState } from '@/components/states';
import { useSpace } from '@/state/data';
import { colors } from '@/theme/tokens';

/**
 * Novo investimento (D-093), sempre no Pessoal. D-103 (item 5): "?modelo=reserva|titulo|banco|outro", vindo dos modelos de registro da
 * tela vazia da aba, preenche parte do formulário (investmentTemplatePreset); outro valor ou nenhum abre o formulário em branco.
 */
export default function NovoInvestimentoScreen() {
  const space = useSpace();
  const contextId = space.data?.personalContextId;
  const { modelo } = useLocalSearchParams<{ modelo?: string | string[] }>();
  const template = investmentTemplateFrom(modelo);
  if (contextId) return <InvestmentForm contextId={contextId} investment={null} preset={template ? investmentTemplatePreset(template) : null} />;
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SubHeader title={INVESTMENT_TEXT.form.newTitle} right={<ContextPill label="Salvando em Pessoal" fixed />} />
      <LoadingState />
    </View>
  );
}
