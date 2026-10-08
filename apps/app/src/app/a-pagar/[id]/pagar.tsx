import { COMMITMENT_ERROR_TEXT, ERROR_TEXT, type Commitment } from '@clarevo/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { SubHeader } from '@/components/header';
import { PaymentForm } from '@/components/payment-form';
import { ErrorState, LoadingState } from '@/components/states';
import { Button, Card, Txt } from '@/components/ui';
import { useCommitment, useSpace } from '@/state/data';
import { colors, space } from '@/theme/tokens';

export default function MarcarComoPaga() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const personal = useSpace().data;
  const commitment = useCommitment(id);
  const c = commitment.data;
  // Aberto o formulário, ele fica na tela: o pagamento confirmado aqui atualiza a consulta antes de voltar.
  const [opened, setOpened] = useState<Commitment | null>(null);
  if (!opened && c && c.status === 'aberto') setOpened(c);

  if (opened && personal) return <PaymentForm key={opened.id} commitment={opened} space={personal} />;
  if (commitment.isPending || !personal) return <LoadingState />;
  if (commitment.isError) return <ErrorState message={ERROR_TEXT.carregar_falhou} onRetry={() => commitment.refetch()} />;
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SubHeader title="Marcar como paga" />
      <View style={{ padding: space[5] }}>
        <Card style={{ gap: space[3] }}>
          <Txt>{c ? COMMITMENT_ERROR_TEXT.ja_paga_em_outro_aparelho : COMMITMENT_ERROR_TEXT.nao_encontrado}</Txt>
          {c ? (
            <Button label="Ver conta a pagar" onPress={() => (router.canGoBack() ? router.back() : router.replace(`/a-pagar/${c.id}`))} />
          ) : (
            <Button label="Ir para Contas a pagar" onPress={() => router.replace('/a-pagar')} />
          )}
        </Card>
      </View>
    </View>
  );
}
