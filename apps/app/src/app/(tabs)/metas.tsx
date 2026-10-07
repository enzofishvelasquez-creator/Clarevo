import { router } from 'expo-router';
import { View } from 'react-native';

import { AppHeader } from '@/components/header';
import { EmptyState } from '@/components/states';
import { Body, Card, LinkButton, Screen } from '@/components/ui';
import { colors } from '@/theme/tokens';

/** Metas entram em um ciclo próprio. Estado explicativo, sem meta simulada. */
export default function MetasScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Screen wide>
        <AppHeader title="Metas" />
        <Body>
          <Card>
            <EmptyState title="Metas chegam em uma próxima versão" art="metas">
              Você poderá separar valores para objetivos escolhidos por você, como uma reserva para imprevistos. Uma meta vai mostrar só os
              aportes registrados.
            </EmptyState>
          </Card>
          <LinkButton label="Enquanto isso, acompanhe o mês no Resumo" onPress={() => router.navigate('/')} />
        </Body>
      </Screen>
    </View>
  );
}
