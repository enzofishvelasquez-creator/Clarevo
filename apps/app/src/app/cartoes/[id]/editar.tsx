import { CARDS_TEXT, CARD_ERROR_TEXT, ERROR_TEXT } from '@clarevo/core';
import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { CardForm } from '@/components/card-form';
import { ContextPill, SubHeader } from '@/components/header';
import { ErrorState, LoadingState } from '@/components/states';
import { Button, Card, Screen, Txt } from '@/components/ui';
import { useCard } from '@/state/data';
import { colors, space } from '@/theme/tokens';

/** Editar cartão (D-037). Cartão excluído ou sem leitura: a mensagem de sempre, nunca um formulário vazio. */
export default function EditarCartaoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const card = useCard(id);

  if (card.isSuccess && card.data) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <CardForm mode={{ type: 'editar', card: card.data }} contextId={card.data.contextId} />
      </View>
    );
  }
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SubHeader title={CARDS_TEXT.form.editTitle} right={<ContextPill label="Salvando em Pessoal" />} />
      <Screen contentStyle={{ padding: space[5], gap: space[4] }}>
        {card.isError ? (
          <ErrorState message={ERROR_TEXT.carregar_falhou} onRetry={() => card.refetch()} />
        ) : card.isSuccess ? (
          <Card style={{ gap: space[3] }}>
            <Txt>{CARD_ERROR_TEXT.nao_encontrado}</Txt>
            <Button label="Ir para Cartões" onPress={() => router.replace('/cartoes')} />
          </Card>
        ) : (
          <LoadingState />
        )}
      </Screen>
    </View>
  );
}
