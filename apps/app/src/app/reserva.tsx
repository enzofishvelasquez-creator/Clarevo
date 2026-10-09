import { ERROR_TEXT, GOALS_TEXT } from '@clarevo/core';
import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { ContextPill, SubHeader } from '@/components/header';
import { ReserveForm, readReservePrefill, type ReservePrefillParams } from '@/components/reserve-form';
import { ErrorState } from '@/components/states';
import { Card, Screen, Skeleton } from '@/components/ui';
import { useEssentialEstimate, useGoalDetail, useGoalsOverview, useSpace } from '@/state/data';
import { colors, space } from '@/theme/tokens';

export default function ReservaScreen() {
  const params = useLocalSearchParams<ReservePrefillParams>();
  const personal = useSpace();
  const contextId = personal.data?.personalContextId;
  const overview = useGoalsOverview(contextId);
  const estimate = useEssentialEstimate(contextId);
  const reserve = overview.data?.reserve ?? null;
  const detail = useGoalDetail(reserve?.id);

  const failed = personal.isError || overview.isError || estimate.isError || (reserve !== null && detail.isError);
  const ready = contextId !== undefined && overview.isSuccess && estimate.isSuccess && (reserve === null || detail.isSuccess);

  if (ready) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <ReserveForm
          contextId={contextId}
          reserve={reserve}
          movements={detail.data?.movements ?? []}
          estimate={estimate.data}
          prefill={readReservePrefill(params)}
        />
      </View>
    );
  }
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SubHeader title={GOALS_TEXT.reserve.title} right={<ContextPill label="Salvando em Pessoal" />} />
      <Screen contentStyle={{ padding: space[5], gap: space[4] }}>
        {failed ? (
          <ErrorState
            message={ERROR_TEXT.carregar_falhou}
            onRetry={() => {
              personal.refetch();
              overview.refetch();
              estimate.refetch();
              detail.refetch();
            }}
          />
        ) : (
          <Card style={{ gap: space[3] }}>
            <Skeleton width="60%" height={24} />
            <Skeleton width="100%" height={56} />
            <Skeleton width="100%" height={120} />
          </Card>
        )}
      </Screen>
    </View>
  );
}
