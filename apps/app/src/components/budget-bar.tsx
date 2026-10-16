import { StyleSheet, View } from 'react-native';

import { Stripes } from '@/components/committed-parts';
import { colors, radius } from '@/theme/tokens';

/**
 * Barra de um valor contra o seu limite, em orçamento por categoria e em "Seu limite" (CL-10, D-054). Até 100% é a barra de sempre, na
 * cor da marca. Acima de 100% ela fica cheia, com um trecho final listrado proporcional ao excedente (as larguras vêm do core,
 * `overflowBar`, em décimos da barra inteira). A barra é decorativa: o excedente também sai sempre em texto ("R$ 100,00 acima"), então
 * nada depende só da cor ou do desenho, e o leitor de tela ouve a frase do card ("R$ 100,00 acima do orçamento"). Nunca vermelho.
 */
export function BudgetBar({ solidTenths, stripedTenths, minimal = false }: { solidTenths: number; stripedTenths: number; minimal?: boolean }) {
  return (
    <View
      style={styles.track}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      aria-hidden
      testID="barra-orcamento">
      <View style={[styles.fill, { width: `${solidTenths / 10}%` }, minimal && solidTenths === 0 && stripedTenths === 0 && styles.fillMin]} />
      {stripedTenths > 0 ? (
        <View style={[styles.striped, { width: `${stripedTenths / 10}%` }, solidTenths > 0 && styles.gap]} testID="trecho-listrado">
          <Stripes height={12} color={colors.brand} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 12, borderRadius: radius.pill, backgroundColor: colors.brandTint, overflow: 'hidden', flexDirection: 'row' },
  fill: { height: 12, backgroundColor: colors.brand },
  // Gasto de poucos centavos: ainda aparece um traço.
  fillMin: { width: 4 },
  striped: { height: 12, overflow: 'hidden', backgroundColor: colors.surface },
  // 2 px de branco entre o sólido e o listrado, como no medidor da renda comprometida.
  gap: { borderLeftWidth: 2, borderLeftColor: colors.surface },
});
