import { formatBRL } from '@clarevo/core';
import { StyleSheet, View } from 'react-native';

import { Card, Money, Screen, TopInset, Txt } from '@/components/ui';
import { colors, radius, space } from '@/theme/tokens';

// Meta FICTÍCIA para demonstração. Aportes reais entram no próximo ciclo (regras de reserva na seção 5).
const GOAL = { name: 'Reserva para imprevistos', savedCents: 80000, targetCents: 200000 };

export default function MetasScreen() {
  const pct = Math.round((GOAL.savedCents / GOAL.targetCents) * 100);
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <TopInset color={colors.background} />
      <Screen contentStyle={{ padding: space[6], gap: space[4] }}>
        <Txt variant="title" style={{ fontSize: 24 }}>Metas</Txt>
        <View style={styles.goal}>
          <Txt variant="label" color={colors.text}>Meta pessoal · exemplo fictício</Txt>
          <Txt variant="title" style={{ fontSize: 22 }}>{GOAL.name}</Txt>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space[2], flexWrap: 'wrap' }}>
            <Money cents={GOAL.savedCents} variant="hero" />
            <Txt variant="label">de {formatBRL(GOAL.targetCents)}</Txt>
          </View>
          <View style={styles.track} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: pct }}>
            <View style={[styles.fill, { width: `${pct}%` }]} />
          </View>
          <Txt variant="label">{pct}% reservado · aportes registrados</Txt>
        </View>
        <Card>
          <Txt variant="title">Como funciona</Txt>
          <Txt color={colors.textSecondary}>
            Uma meta mostra apenas aportes registrados. Intenção de reservar não comprova o aporte, e a reserva de emergência tem finalidade
            diferente de uma reserva para oportunidades.
          </Txt>
        </Card>
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  goal: { backgroundColor: colors.accent, borderRadius: radius.lg, padding: space[6], gap: space[2] },
  track: { height: 12, borderRadius: 6, backgroundColor: 'rgba(23,34,59,0.12)', overflow: 'hidden', marginVertical: space[2] },
  fill: { height: '100%', backgroundColor: colors.brand, borderRadius: 6 },
});
