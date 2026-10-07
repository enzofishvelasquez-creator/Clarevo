import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Card, PrimaryButton, Screen, Txt } from '@/components/ui';
import { colors, radius, space } from '@/theme/tokens';

/** Educação ligada à tarefa (CL-V007). Texto do handoff de 07/10/2026. Exemplo fictício. */
export default function FaturaScreen() {
  return (
    <Screen contentStyle={{ padding: space[6], gap: space[4] }}>
      <View style={styles.art} accessible accessibilityLabel="Ilustração: compra e pagamento da fatura">
        <View style={[styles.shape, { backgroundColor: colors.brand, left: 24 }]} />
        <View style={[styles.shape, { backgroundColor: colors.illustration, left: 92, borderRadius: 40 }]} />
      </View>
      <Txt variant="caption" color={colors.textSecondary}>Exemplo fictício</Txt>
      <Txt>
        Uma compra de R$ 160 no cartão registra o consumo. Pagar a fatura quita essa obrigação e movimenta a conta. Contar esse pagamento como uma nova
        compra duplicaria o consumo. Juros e tarifas têm registros próprios.
      </Txt>
      <Card>
        <Txt variant="label" color={colors.textSecondary}>Hipóteses do exemplo</Txt>
        <Txt>Uma única compra à vista no cartão, sem parcelas, juros ou estornos.</Txt>
      </Card>
      <PrimaryButton label="Voltar à tarefa" onPress={() => router.back()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  art: { height: 140, borderRadius: radius.lg, backgroundColor: colors.accent, overflow: 'hidden' },
  shape: { position: 'absolute', top: 30, width: 80, height: 80, borderRadius: 20 },
});
