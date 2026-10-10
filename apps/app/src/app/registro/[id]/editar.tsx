import { ERROR_TEXT } from '@clarevo/core';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { RecordForm } from '@/components/record-form';
import { ErrorState, LoadingState } from '@/components/states';
import { Button, Txt } from '@/components/ui';
import { invoiceHref } from '@/lib/cards';
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
  // Pagamento de fatura (D-037): só a fatura muda o pagamento (desfazer e pagar de novo).
  if (record.data.invoice) return <Redirect href={invoiceHref(record.data.invoice.cardId, record.data.invoice.month)} />;
  return <RecordForm key={record.data.id} mode={{ type: 'editar', record: record.data }} space={personal} />;
}
