import { COMMITMENT_ERROR_TEXT, ERROR_TEXT, type Commitment } from '@clarevo/core';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { CommitmentForm } from '@/components/commitment-form';
import { SubHeader } from '@/components/header';
import { ErrorState, LoadingState } from '@/components/states';
import { Button, Card, Txt } from '@/components/ui';
import { invoiceHref } from '@/lib/cards';
import { useCommitment, useSpace } from '@/state/data';
import { colors, space } from '@/theme/tokens';

/** /a-pagar/[id]/editar ("Só esta conta" numa conta de gasto fixo) e ?informar=1 ("Informar o valor da conta"). */
export default function EditarContaAPagar() {
  const { id, informar } = useLocalSearchParams<{ id: string; informar?: string }>();
  const personal = useSpace().data;
  const commitment = useCommitment(id);
  const c = commitment.data;
  // Aberto o formulário, ele fica na tela: um conflito mostra o aviso ali, sem perder o preenchimento.
  const [opened, setOpened] = useState<Commitment | null>(null);
  if (!opened && c && c.status === 'aberto') setOpened(c);
  if (c?.invoice) return <Redirect href={invoiceHref(c.invoice.cardId, c.invoice.month)} />;

  if (opened && personal) {
    return <CommitmentForm key={opened.id} mode={{ type: 'editar', commitment: opened, informValue: informar === '1' }} space={personal} />;
  }
  if (commitment.isPending || !personal) return <LoadingState />;
  if (commitment.isError) return <ErrorState message={ERROR_TEXT.carregar_falhou} onRetry={() => commitment.refetch()} />;
  // Conta paga não se edita: é preciso desfazer o pagamento antes (D-021, regra 3).
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SubHeader title="Editar conta a pagar" />
      <View style={{ padding: space[5] }}>
        <Card style={{ gap: space[3] }}>
          <Txt>{c ? COMMITMENT_ERROR_TEXT.compromisso_quitado : COMMITMENT_ERROR_TEXT.nao_encontrado}</Txt>
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
