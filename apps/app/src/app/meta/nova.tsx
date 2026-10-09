import { ERROR_TEXT, GOALS_TEXT } from '@clarevo/core';
import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { GoalForm, readGoalPrefill, type GoalPrefillParams } from '@/components/goal-form';
import { ContextPill, SubHeader } from '@/components/header';
import { ErrorState, LoadingState } from '@/components/states';
import { Screen } from '@/components/ui';
import { useSpace } from '@/state/data';
import { colors, space } from '@/theme/tokens';

/**
 * Nova meta (D-027). `tipo=objetivo|oportunidade` escolhe o tipo; o simulador e outros atalhos podem trazer o resto
 * pronto (nome, valor, prazo, inicial, mensal; ver readGoalPrefill). A taxa de uma simulação nunca vem no link.
 */
export default function NovaMetaScreen() {
  const params = useLocalSearchParams<GoalPrefillParams>();
  const personal = useSpace();
  if (personal.data) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <GoalForm mode={{ type: 'nova', prefill: readGoalPrefill(params) }} contextId={personal.data.personalContextId} />
      </View>
    );
  }
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SubHeader title={GOALS_TEXT.form.newTitle} right={<ContextPill label="Salvando em Pessoal" />} />
      <Screen contentStyle={{ padding: space[5], gap: space[4] }}>
        {personal.isError ? <ErrorState message={ERROR_TEXT.carregar_falhou} onRetry={() => personal.refetch()} /> : <LoadingState />}
      </Screen>
    </View>
  );
}
