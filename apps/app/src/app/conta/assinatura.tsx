import { ACCESS_TEXT, accessView } from '@clarevo/core';
import { View } from 'react-native';

import { AccessSituation, PlansCard, useAccessTimeZone } from '@/components/access-parts';
import { SubHeader } from '@/components/header';
import { ErrorState, LoadingState } from '@/components/states';
import { Card, Screen, Txt } from '@/components/ui';
import { useAccess } from '@/state/access';
import { colors, space } from '@/theme/tokens';

const T = ACCESS_TEXT;

/**
 * Conta > Assinatura (D-083): a situação do acesso (teste grátis, só ver e exportar, plano, benefício, cortesia ou Plano Família da
 * pessoa titular), com as datas no fuso da pessoa, e os planos com os preços para quem ainda não paga. A compra pelas lojas e pela web
 * entra na fase 2 (SUBSCRIBE_OPEN); a trava da escrita é do banco.
 */
export default function AssinaturaScreen() {
  const access = useAccess();
  const timeZone = useAccessTimeZone();
  const view = access.data ? accessView(access.data, new Date(), timeZone) : null;
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SubHeader title={T.screenTitle} />
      <Screen contentStyle={{ padding: space[5], gap: space[4] }}>
        {access.isPending ? (
          <LoadingState />
        ) : !access.data || !view ? (
          <ErrorState message={T.loadFailed} onRetry={() => access.refetch()} />
        ) : (
          <>
            <Card style={{ gap: space[3] }}>
              <AccessSituation situation={view.situation} />
              <Txt color={colors.text}>{view.body}</Txt>
            </Card>
            {view.showPlans ? <PlansCard access={access.data} /> : null}
            {view.showPlans ? (
              <Txt variant="caption" color={colors.textSecondary}>
                {T.benefitNote}
              </Txt>
            ) : null}
          </>
        )}
      </Screen>
    </View>
  );
}
