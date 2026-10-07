import { ERROR_TEXT } from '@clarevo/core';
import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { RecordForm } from '@/components/record-form';
import { ErrorState, LoadingState } from '@/components/states';
import { Button, Txt } from '@/components/ui';
import { useRecord, useSpace } from '@/state/data';
import { colors, space } from '@/theme/tokens';

export default function EditarRegistro() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const personal = useSpace().data;
  const record = useRecord(id);

  if (record.isPending || !personal) return <LoadingState />;
  if (record.isError) return <ErrorState message={ERROR_TEXT.carregar_falhou} onRetry={() => record.refetch()} />;
  if (!record.data) {
    return (
      <View style={{ flex: 1, padding: space[6], gap: space[4], justifyContent: 'center', backgroundColor: colors.background }}>
        <Txt>{ERROR_TEXT.nao_encontrado}</Txt>
        <Button label="Ir para Movimentações" onPress={() => router.replace('/movimentacoes')} />
      </View>
    );
  }
  return <RecordForm key={record.data.id} mode={{ type: 'editar', record: record.data }} space={personal} />;
}
