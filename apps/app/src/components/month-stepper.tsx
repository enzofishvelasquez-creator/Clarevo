import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { Txt } from '@/components/ui';
import { colors, space } from '@/theme/tokens';

/**
 * Seletor de mês de uma tela: seta para trás, o mês no meio e seta para a frente (alvos de 44 px). prev ou next nulo: o limite da
 * tela; o botão fica desativado. O nome do mês é anunciado ao leitor de tela quando muda (região viva educada).
 * Usado em Orçamento por categoria (mês mostrado) e nos formulários "A partir de" (orçamento e limite).
 */
export function MonthStepper({
  label,
  prevLabel,
  nextLabel,
  onPrev,
  onNext,
  groupLabel,
}: {
  label: string;
  prevLabel: string;
  nextLabel: string;
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
  /** Nome acessível do grupo (opcional). */
  groupLabel?: string;
}) {
  return (
    <View style={styles.row} accessibilityRole="toolbar" accessibilityLabel={groupLabel}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={prevLabel}
        accessibilityState={{ disabled: !onPrev }}
        disabled={!onPrev}
        hitSlop={4}
        onPress={() => onPrev?.()}
        style={(st) => [styles.btn, !onPrev && { opacity: 0.35 }, onPrev && (st as { focused?: boolean }).focused && styles.focusRing]}>
        <ChevronLeft size={22} color={colors.brand} />
      </Pressable>
      <Txt variant="label" style={styles.label} accessibilityLiveRegion="polite">
        {label}
      </Txt>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={nextLabel}
        accessibilityState={{ disabled: !onNext }}
        disabled={!onNext}
        hitSlop={4}
        onPress={() => onNext?.()}
        style={(st) => [styles.btn, !onNext && { opacity: 0.35 }, onNext && (st as { focused?: boolean }).focused && styles.focusRing]}>
        <ChevronRight size={22} color={colors.brand} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space[1] },
  btn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  label: { flex: 1, textAlign: 'center' },
  focusRing: { outlineWidth: 3, outlineColor: colors.brand, outlineStyle: 'solid', outlineOffset: 2 } as object,
});
