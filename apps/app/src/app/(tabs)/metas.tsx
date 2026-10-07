import { router } from 'expo-router';
import { View } from 'react-native';

import { EmptyState } from '@/components/states';
import { Card, LinkButton, Screen, TopInset, Txt } from '@/components/ui';
import { colors, space } from '@/theme/tokens';

/** Metas entram em um ciclo próprio. Estado explicativo, sem meta simulada. */
export default function MetasScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <TopInset color={colors.background} />
      <Screen contentStyle={{ padding: space[6], gap: space[4] }}>
        <Txt variant="title" style={{ fontSize: 24, lineHeight: 32 }} accessibilityRole="header">
          Metas
        </Txt>
        <Card>
          <EmptyState title="Metas chegam em uma próxima versão">
            Você poderá separar valores para objetivos escolhidos por você, como uma reserva para imprevistos. Uma meta vai mostrar só os
            aportes registrados.
          </EmptyState>
        </Card>
        <LinkButton label="Enquanto isso, acompanhe o mês no Resumo" onPress={() => router.navigate('/')} />
      </Screen>
    </View>
  );
}
