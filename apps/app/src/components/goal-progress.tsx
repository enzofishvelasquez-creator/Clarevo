import { useIsFocused } from 'expo-router';
import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { useMoneyLabelMask } from '@/components/money-text';
import { colors, motion } from '@/theme/tokens';

/**
 * Barra de progresso de meta (spec2 §4.2, `GoalProgress`). No fundo claro: preenchimento azul sobre o trilho
 * `brandTint` contornado. No card azul: preenchimento lima sobre o trilho `brandDeep`. O lima sozinho no fundo branco
 * (1,28:1) nunca é a única marca: o percentual e os valores estão sempre em texto ao lado.
 *
 * Movimento: a primeira exibição já mostra o valor final. Quando o percentual muda (só muda depois que o servidor
 * confirmou a gravação, porque a tela lê o estado confirmado), a largura vai do valor anterior ao novo em
 * `motion.progress`, sem animar enquanto a tela está coberta por outra (por exemplo, o formulário de aporte): a barra anima
 * quando a pessoa volta e a vê. "Reduzir movimento" vai direto ao valor final.
 *
 * Leitor de tela: um único elemento "barra de progresso" com a frase completa (`label` e `valueText`); o desenho fica
 * oculto. Dentro de um cartão tocável, use `decorative` para o cartão carregar a frase.
 */
export function GoalProgress({
  percent,
  tone = 'light',
  label,
  valueText,
  decorative,
}: {
  /** 0 a 100 (GoalProgress.barPercent do core). */
  percent: number;
  tone?: 'light' | 'onBrand';
  /** Nome acessível: "Reserva para imprevistos: 15% da meta, R$ 3.500,00 de R$ 22.500,00." */
  label?: string;
  /** Texto do valor para o leitor de tela: "R$ 3.500,00 de R$ 22.500,00, 15%". */
  valueText?: string;
  decorative?: boolean;
}) {
  const focused = useIsFocused();
  const mask = useMoneyLabelMask();
  const bar = Math.max(0, Math.min(100, percent));
  const width = useSharedValue(bar);
  const shown = useRef(bar);

  useEffect(() => {
    if (!focused || shown.current === bar) return;
    shown.current = bar;
    width.value = withTiming(bar, { duration: motion.progress, easing: Easing.out(Easing.cubic), reduceMotion: ReduceMotion.System });
  }, [bar, focused, width]);

  const fill = useAnimatedStyle(() => ({ width: `${width.value}%` }));
  const light = tone === 'light';

  const track = (
    <View style={[styles.track, light ? styles.trackLight : styles.trackOnBrand]}>
      <Animated.View style={[styles.fill, { backgroundColor: light ? colors.brand : colors.accent }, fill]} />
    </View>
  );

  if (decorative) {
    return (
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden>
        {track}
      </View>
    );
  }
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label === undefined ? undefined : mask(label)}
      accessibilityValue={{ min: 0, max: 100, now: bar, text: valueText === undefined ? undefined : mask(valueText) }}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={bar}
      aria-valuetext={valueText === undefined ? undefined : mask(valueText)}>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {track}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 12, borderRadius: 6, overflow: 'hidden' },
  trackLight: { backgroundColor: colors.brandTint, borderWidth: 1, borderColor: colors.borderStrong },
  trackOnBrand: { backgroundColor: colors.brandDeep },
  fill: { height: '100%', borderRadius: 6 },
});
