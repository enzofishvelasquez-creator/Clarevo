import { ERROR_TEXT, SERIES_ERROR_TEXT, type CommitmentSeries } from '@clarevo/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { SubHeader } from '@/components/header';
import { SeriesEndForm } from '@/components/series-end-form';
import { ErrorState, LoadingState } from '@/components/states';
import { Button, Card, Txt } from '@/components/ui';
import { useSeries, useSeriesOccurrences, useSeriesOpenOccurrences, useSpace } from '@/state/data';
import { colors, space } from '@/theme/tokens';

/** Encerrar ou retomar o gasto fixo (e "Quitei o restante nesta parcela" no parcelamento). */
export default function EncerrarGastoFixo() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const personal = useSpace().data;
  const ctx = personal?.personalContextId;
  const series = useSeries(id, ctx);
  const occ = useSeriesOccurrences(id, ctx);
  // Todas as em aberto: o conjunto afetado que o banco confere vai além das 60 da lista.
  const openOcc = useSeriesOpenOccurrences(id, ctx);
  // Aberto o formulário, ele fica na tela: uma recusa mostra o aviso ali, sem perder a escolha.
  const [opened, setOpened] = useState<CommitmentSeries | null>(null);
  if (!opened && series.data && occ.data && openOcc.data) setOpened(series.data);

  if (opened && personal) return <SeriesEndForm key={opened.id} series={opened} space={personal} />;
  if (series.isPending || occ.isPending || openOcc.isPending || !personal) return <LoadingState />;
  if (series.isError || occ.isError || openOcc.isError) {
    return (
      <ErrorState
        message={ERROR_TEXT.carregar_falhou}
        onRetry={() => {
          series.refetch();
          occ.refetch();
          openOcc.refetch();
        }}
      />
    );
  }
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SubHeader title="Encerrar gasto fixo" />
      <View style={{ padding: space[5] }}>
        <Card style={{ gap: space[3] }}>
          <Txt>{SERIES_ERROR_TEXT.nao_encontrado}</Txt>
          <Button label="Ir para Gastos fixos" onPress={() => router.replace('/gastos-fixos')} />
        </Card>
      </View>
    </View>
  );
}
