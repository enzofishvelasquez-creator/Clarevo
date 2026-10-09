import { ERROR_TEXT, GOAL_ERROR_TEXT, GOALS_TEXT } from '@clarevo/core';
import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { GoalMovementForm, type MovementMode } from '@/components/goal-movement-form';
import { ContextPill, SubHeader } from '@/components/header';
import { ErrorState, LoadingState } from '@/components/states';
import { Button, Card, Screen, Txt } from '@/components/ui';
import { useGoalDetail } from '@/state/data';
import { colors, space } from '@/theme/tokens';

/**
 * Movimento de uma meta (D-027): /meta/<id>/movimento?tipo=aporte|resgate|rendimento|atualizar para registrar, ou
 * ?movimento=<id do movimento> para editar ou excluir um que já existe. Sem tipo válido, aporte.
 */
export default function MovimentoScreen() {
  const { id, tipo, movimento } = useLocalSearchParams<{ id: string; tipo?: string; movimento?: string }>();
  const detail = useGoalDetail(id);

  if (detail.isSuccess && detail.data.goal) {
    const goal = detail.data.goal;
    const existing = movimento ? (detail.data.movements.find((m) => m.id === movimento) ?? null) : null;
    const mode: MovementMode | null = movimento
      ? existing
        ? { type: 'editar', movement: existing }
        : null
      : tipo === 'atualizar'
        ? { type: 'atualizar' }
        : { type: 'novo', kind: tipo === 'resgate' ? 'resgate' : tipo === 'rendimento' ? 'rendimento' : 'aporte' };
    if (mode) {
      return (
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          <GoalMovementForm key={`${tipo ?? ''}-${movimento ?? ''}`} goal={goal} movements={detail.data.movements} mode={mode} />
        </View>
      );
    }
  }
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SubHeader title={GOALS_TEXT.movement.aporte.title} right={<ContextPill label="Salvando em Pessoal" />} />
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
