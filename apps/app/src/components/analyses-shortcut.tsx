import { ANALYSES_ENTRY_TEXT } from '@clarevo/core';
import { ChartPie } from 'lucide-react-native';
import { Pressable, StyleSheet } from 'react-native';

import { Txt } from '@/components/ui';
import { colors, fonts, radius, space } from '@/theme/tokens';

/**
 * "Análises" no alto de Movimentos (D-105, retorno do teste de 17/11/2026: "não estou mais achando as análises"): uma pílula na linha do
 * título, na faixa azul, que abre as Análises do mês em exibição sem empurrar a lista. A linha "Ver análises do mês" depois da lista
 * continua. 44 px de altura; o nome acessível começa pelo texto visível.
 */
export function AnalysesHeaderEntry({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={ANALYSES_ENTRY_TEXT.a11y}
      onPress={onPress}
      hitSlop={4}
      style={(st) => [styles.pill, st.pressed && { backgroundColor: colors.onBrandSoftPressed }, (st as { focused?: boolean }).focused && styles.focus]}>
      <ChartPie size={18} color={colors.brand} strokeWidth={2.25} aria-hidden />
      <Txt variant="label" color={colors.brand} style={{ fontFamily: fonts.bold }}>
        {ANALYSES_ENTRY_TEXT.label}
      </Txt>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    minHeight: 44,
    paddingHorizontal: space[4],
    borderRadius: radius.pill,
    backgroundColor: colors.onBrandSoft,
  },
  focus: { outlineWidth: 3, outlineColor: colors.accent, outlineStyle: 'solid', outlineOffset: 2 } as object,
});
