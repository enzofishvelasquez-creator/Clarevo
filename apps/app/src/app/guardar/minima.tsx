import { ERROR_TEXT } from '@clarevo/core';
import { View } from 'react-native';

import { ContextPill, SubHeader } from '@/components/header';
import { MinimumReserve } from '@/components/minimum-reserve';
import { ErrorState } from '@/components/states';
import { Card, Screen, Skeleton } from '@/components/ui';
import { useSavingsCheck, useSavingsPlanInputs, useSpace } from '@/state/data';
import { colors, space } from '@/theme/tokens';

/**
 * Reserva mínima (D-036, "Agora não", spec7 §3). Abre depois de a resposta "agora não" ser confirmada pelo servidor. Só monta
 * com a resposta, as metas e os gastos essenciais carregados: a opção "1 mês dos seus gastos essenciais" depende deles, e uma
 * reserva que já existe troca a criação por um link para ela.
 */
export default function ReservaMinimaScreen() {
  const personal = useSpace();
  const contextId = personal.data?.personalContextId;
  const check = useSavingsCheck(contextId);
  const inputs = useSavingsPlanInputs(contextId);
  const failed = personal.isError || check.isError || inputs.isError;

  if (contextId !== undefined && check.isSuccess && inputs.isSuccess) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <MinimumReserve contextId={contextId} check={check.data ?? null} inputs={inputs.data} />
      </View>
    );
  }
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SubHeader title="Reserva mínima" right={<ContextPill label="Salvando em Pessoal" />} />
      <Screen contentStyle={{ padding: space[5], gap: space[4] }}>
        {failed ? (
          <ErrorState
            message={ERROR_TEXT.carregar_falhou}
            onRetry={() => {
              personal.refetch();
              check.refetch();
              inputs.refetch();
            }}
          />
        ) : (
          <Card style={{ gap: space[3] }}>
            <Skeleton width="70%" height={24} />
            <Skeleton width="100%" height={80} />
          </Card>
        )}
      </Screen>
    </View>
  );
}
