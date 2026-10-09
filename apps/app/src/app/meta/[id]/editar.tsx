import { ERROR_TEXT, GOALS_TEXT, GOAL_ERROR_TEXT } from '@clarevo/core';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { GoalForm } from '@/components/goal-form';
import { ContextPill, SubHeader } from '@/components/header';
import { ErrorState, LoadingState } from '@/components/states';
import { Button, Card, Screen, Txt } from '@/components/ui';
import { useGoalDetail } from '@/state/data';
import { colors, space } from '@/theme/tokens';

/** Editar meta (objetivo ou reserva de oportunidade). A reserva para imprevistos se edita em /reserva. */
export default function EditarMetaScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const detail = useGoalDetail(id);

  if (detail.isSuccess) {
    const goal = detail.data.goal;
    if (goal && goal.goalType === 'emergencia') return <Redirect href="/reserva" />;
    if (goal) {
      return (
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          <GoalForm mode={{ type: 'editar', goal, movements: detail.data.movements }} contextId={goal.contextId} />
        </View>
      );
    }
  }
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SubHeader title={GOALS_TEXT.form.editTitle} right={<ContextPill label="Salvando em Pessoal" />} />
      <Screen contentStyle={{ padding: space[5], gap: space[4] }}>
        {detail.isError ? (
          <ErrorState message={ERROR_TEXT.carregar_falhou} onRetry={() => detail.refetch()} />
        ) : detail.isSuccess ? (
          <Card style={{ gap: space[3] }}>
            <Txt>{GOAL_ERROR_TEXT.nao_encontrado}</Txt>
            <Button label="Ir para Metas" onPress={() => router.replace('/metas')} />
          </Card>
        ) : (
          <LoadingState />
        )}
      </Screen>
    </View>
  );
}
