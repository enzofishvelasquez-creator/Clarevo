import { ERROR_TEXT, MAX_RECORD_CENTS, SERIES_ERROR_TEXT, type CommitmentSeries } from '@clarevo/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { SubHeader } from '@/components/header';
import { SeriesEditForm } from '@/components/series-edit-form';
import { ErrorState, LoadingState } from '@/components/states';
import { Button, Card, Txt } from '@/components/ui';
import { useSeries, useSeriesOccurrences, useSpace } from '@/state/data';
import { colors, space } from '@/theme/tokens';

type Params = { id: string; 'a-partir'?: string; valor?: string };

const intParam = (v: string | undefined) => (typeof v === 'string' && /^\d{1,9}$/.test(v) ? Number(v) : undefined);

/** "Esta e as próximas": /gastos-fixos/[id]/editar?a-partir=<n>&valor=<centavos>. */
export default function EditarGastoFixo() {
  const params = useLocalSearchParams<Params>();
  const personal = useSpace().data;
  const ctx = personal?.personalContextId;
  const series = useSeries(params.id, ctx);
  const occ = useSeriesOccurrences(params.id, ctx);
  // Aberto o formulário, ele fica na tela: uma recusa mostra o aviso ali, sem perder o preenchimento.
  const [opened, setOpened] = useState<CommitmentSeries | null>(null);
  if (!opened && series.data && occ.data) setOpened(series.data);

  const valor = intParam(params.valor);
  if (opened && ctx) {
    return (
      <SeriesEditForm
        key={opened.id}
        series={opened}
        contextId={ctx}
        fromNumber={intParam(params['a-partir'])}
        suggestedCents={valor !== undefined && valor >= 1 && valor <= MAX_RECORD_CENTS ? valor : undefined}
      />
    );
  }
  if (series.isPending || occ.isPending || !personal) return <LoadingState />;
  if (series.isError || occ.isError) {
    return (
      <ErrorState
        message={ERROR_TEXT.carregar_falhou}
        onRetry={() => {
          series.refetch();
          occ.refetch();
        }}
      />
    );
  }
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SubHeader title="Editar gasto fixo" />
      <View style={{ padding: space[5] }}>
        <Card style={{ gap: space[3] }}>
          <Txt>{SERIES_ERROR_TEXT.nao_encontrado}</Txt>
          <Button label="Ir para Gastos fixos" onPress={() => router.replace('/gastos-fixos')} />
        </Card>
      </View>
    </View>
  );
}
