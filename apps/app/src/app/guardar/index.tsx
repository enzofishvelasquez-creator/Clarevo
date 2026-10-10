import { ERROR_TEXT, SAVINGS_TEXT, monthOf, savingsReferenceText } from '@clarevo/core';
import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { ContextPill, SubHeader } from '@/components/header';
import { SavingsPlanForm } from '@/components/savings-plan-form';
import { ErrorState } from '@/components/states';
import { Card, Screen, Skeleton } from '@/components/ui';
import { useCommittedSummary, useSavingsCard, useSavingsPlanInputs, useSpace } from '@/state/data';
import { useSession } from '@/state/session';
import { colors, space } from '@/theme/tokens';

/**
 * Plano de guardar, "Sim, consigo" (D-036, spec7 §2). Abre da aba Metas ("Sim, consigo", "Ver o plano", "Mudar valor") e do
 * 4º passo de "Primeiros passos". `editar=1` leva o foco ao campo do valor por mês. O formulário só monta com a resposta, as
 * metas e os gastos essenciais carregados (o rascunho nasce deles); a referência do mês é um apoio que chega depois e, se
 * falhar, apenas não aparece.
 */
export default function GuardarScreen() {
  const { editar } = useLocalSearchParams<{ editar?: string }>();
  const { today } = useSession();
  const personal = useSpace();
  const contextId = personal.data?.personalContextId;
  const card = useSavingsCard(contextId);
  const inputs = useSavingsPlanInputs(contextId);
  const month = monthOf(today);
  const committed = useCommittedSummary(contextId, month);

  const failed = personal.isError || card.isError || inputs.isError;

  if (contextId !== undefined && card.isSuccess && inputs.isSuccess) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <SavingsPlanForm
          contextId={contextId}
          check={card.data.check}
          incomeChangedAt={card.data.incomeChangedAt}
          inputs={inputs.data}
          referenceText={committed.data ? savingsReferenceText(committed.data, month) : null}
          focusAmount={editar === '1'}
        />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SubHeader title={SAVINGS_TEXT.planTitle} right={<ContextPill label="Salvando em Pessoal" />} />
      <Screen contentStyle={{ padding: space[5], gap: space[4] }}>
        {failed ? (
          <ErrorState
            message={ERROR_TEXT.carregar_falhou}
            onRetry={() => {
              personal.refetch();
              card.refetch();
              inputs.refetch();
            }}
          />
        ) : (
          <Card style={{ gap: space[3] }}>
            <Skeleton width="70%" height={24} />
            <Skeleton width="100%" height={60} />
            <Skeleton width="100%" height={120} />
          </Card>
        )}
      </Screen>
    </View>
  );
}
