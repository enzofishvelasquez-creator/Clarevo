import { BUSINESS_TEXT } from '@clarevo/core';
import { router } from 'expo-router';
import { View } from 'react-native';

import { BusinessYearView } from '@/components/business-year';
import { ContextPill, SubHeader } from '@/components/header';
import { ErrorState, LoadingState } from '@/components/states';
import { Button, Card, Screen, Txt } from '@/components/ui';
import { useBusiness } from '@/state/business';
import { colors, space } from '@/theme/tokens';

const T = BUSINESS_TEXT;

/**
 * Resumo do ano do negócio (D-121), a partir de "Seu negócio": o ano com Entrou e Saiu da operação por categoria, o que ficou fora da
 * operação, as retiradas e o que ficou no negócio, com troca de ano e a exportação de sempre (com o negócio escolhido). Para o MEI, as
 * vendas e os serviços separados, com "Confira com a sua contabilidade antes de declarar.". Não é um documento contábil nem uma
 * declaração pronta: "Os valores são os que você anotou." O conteúdo fica em components/business-year.tsx, o mesmo da área da
 * Contabilidade (D-123).
 */
export default function ResumoDoAnoScreen() {
  const business = useBusiness();
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SubHeader title={T.yearTitle} right={<ContextPill label={business.data?.name ?? T.context} fixed />} />
      <Screen contentStyle={{ padding: space[5], gap: space[4] }}>
        {business.isPending ? (
          <LoadingState label={T.loading} />
        ) : business.isError ? (
          <ErrorState message={T.loadFailed} onRetry={() => business.refetch()} />
        ) : business.data ? (
          <BusinessYearView
            business={business.data}
            onExport={(periodo) => router.push({ pathname: '/conta/exportar', params: { espaco: 'negocio', periodo } })}
          />
        ) : (
          <Card style={{ gap: space[3] }}>
            <Txt>{T.loadFailed}</Txt>
            <Button label={T.accountOpen} tone="soft" onPress={() => router.replace('/negocio')} />
          </Card>
        )}
      </Screen>
    </View>
  );
}
