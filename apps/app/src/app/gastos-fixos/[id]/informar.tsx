import { ANNUAL_SERIES_ERROR_TEXT, ERROR_TEXT, type CommitmentSeries } from '@clarevo/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { SubHeader } from '@/components/header';
import { ErrorState, LoadingState } from '@/components/states';
import { Button, Card, Txt } from '@/components/ui';
import { YearInformForm } from '@/components/year-inform-form';
import { useSeries, useSpace } from '@/state/data';
import { colors, space } from '@/theme/tokens';

const intParam = (v: string | undefined) => (typeof v === 'string' && /^\d{1,9}$/.test(v) ? Number(v) : undefined);

/** "Informar o valor de 2027": /gastos-fixos/[id]/informar?numero=<n>, com n uma parcela do ano (conta do ano). */
export default function InformarValorDoAno() {
  const { id, numero } = useLocalSearchParams<{ id: string; numero?: string }>();
  const personal = useSpace().data;
  const ctx = personal?.personalContextId;
  const series = useSeries(id, ctx);
  const number = intParam(numero);
  // Aberto o formulário, ele fica na tela: uma recusa mostra o aviso ali, sem perder o valor digitado.
  const [opened, setOpened] = useState<CommitmentSeries | null>(null);
  if (!opened && series.data && series.data.kind === 'anual') setOpened(series.data);

  if (opened && ctx && number !== undefined) return <YearInformForm key={opened.id} series={opened} number={number} contextId={ctx} />;
  if (series.isPending || !personal) return <LoadingState />;
  if (series.isError) return <ErrorState message={ERROR_TEXT.carregar_falhou} onRetry={() => series.refetch()} />;
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SubHeader title="Informar o valor do ano" />
      <View style={{ padding: space[5] }}>
        <Card style={{ gap: space[3] }}>
          <Txt>{series.data && number === undefined ? ANNUAL_SERIES_ERROR_TEXT.numero_fora_da_serie : ANNUAL_SERIES_ERROR_TEXT.nao_encontrado}</Txt>
          <Button label="Ir para Gastos fixos" onPress={() => router.replace('/gastos-fixos')} />
        </Card>
      </View>
    </View>
  );
}
