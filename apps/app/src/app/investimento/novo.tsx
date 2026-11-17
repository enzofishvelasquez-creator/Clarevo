import { INVESTMENT_TEXT, investmentTemplateFrom, investmentTemplatePreset, type InvestmentTemplatePreset } from '@clarevo/core';
import { useLocalSearchParams } from 'expo-router';
import type { ComponentProps, ComponentType } from 'react';
import { View } from 'react-native';

import { ContextPill, SubHeader } from '@/components/header';
import { InvestmentForm } from '@/components/investment-form';
import { LoadingState } from '@/components/states';
import { useSpace } from '@/state/data';
import { colors } from '@/theme/tokens';

/**
 * O formulário com o modelo de registro (D-103, item 5). O formulário é da frente do detalhe e passa a ler `preset` com a mudança descrita
 * no relatório da D-103; até lá, o modelo só abre o formulário em branco. Quando o formulário declarar `preset`, este apelido pode sair.
 */
const InvestmentFormWithPreset = InvestmentForm as ComponentType<ComponentProps<typeof InvestmentForm> & { preset?: InvestmentTemplatePreset | null }>;

/**
 * Novo investimento (D-093), sempre no Pessoal. D-103 (item 5): "?modelo=reserva|titulo|banco|outro", vindo dos modelos de registro da
 * tela vazia da aba, preenche parte do formulário (investmentTemplatePreset); outro valor ou nenhum abre o formulário em branco.
 */
export default function NovoInvestimentoScreen() {
  const space = useSpace();
  const contextId = space.data?.personalContextId;
  const { modelo } = useLocalSearchParams<{ modelo?: string | string[] }>();
  const template = investmentTemplateFrom(modelo);
  if (contextId) return <InvestmentFormWithPreset contextId={contextId} investment={null} preset={template ? investmentTemplatePreset(template) : null} />;
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SubHeader title={INVESTMENT_TEXT.form.newTitle} right={<ContextPill label="Salvando em Pessoal" fixed />} />
      <LoadingState />
    </View>
  );
}
