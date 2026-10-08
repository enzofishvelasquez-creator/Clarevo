import { StyleSheet, View } from 'react-native';
import Animated, { ReduceMotion, ZoomIn } from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';

import { LOGO_SYMBOL_C, LOGO_SYMBOL_MOON, LOGOTYPE_DOT, LOGOTYPE_HEIGHT, LOGOTYPE_WIDTH, LOGOTYPE_WORD } from '@/theme/logo-paths';
import { colors } from '@/theme/tokens';

type Variant = 'cor' | 'reverso' | 'uma-cor';

const PALETTE: Record<Variant, { c: string; moon: string; word: string }> = {
  cor: { c: colors.brand, moon: colors.accent, word: colors.brand },
  reverso: { c: colors.textOnBrand, moon: colors.accent, word: colors.textOnBrand },
  'uma-cor': { c: colors.text, moon: colors.text, word: colors.text },
};

/**
 * Símbolo: C aberto com crescente lima (logo aprovado em 07/10/2026).
 * `animated`: o crescente "cresce" como uma fase da lua, uma única vez (300 ms; parado com movimento reduzido).
 */
export function LogoSymbol({ size = 32, variant = 'cor', animated }: { size?: number; variant?: Variant; animated?: boolean }) {
  const p = PALETTE[variant];
  const width = size * (322 / 336);
  if (!animated) {
    return (
      <Svg width={width} height={size} viewBox="-6 -6 322 336" accessible={false}>
        <Path d={LOGO_SYMBOL_C} fill={p.c} />
        <Path d={LOGO_SYMBOL_MOON} fill={p.moon} />
      </Svg>
    );
  }
  return (
    <View style={{ width, height: size }} accessible={false}>
      <Svg width={width} height={size} viewBox="-6 -6 322 336" style={StyleSheet.absoluteFill}>
        <Path d={LOGO_SYMBOL_C} fill={p.c} />
      </Svg>
      <Animated.View
        entering={ZoomIn.duration(300).delay(120).reduceMotion(ReduceMotion.System)}
        style={[StyleSheet.absoluteFill, { transformOrigin: '50% 50%' } as object]}>
        <Svg width={width} height={size} viewBox="-6 -6 322 336">
          <Path d={LOGO_SYMBOL_MOON} fill={p.moon} />
        </Svg>
      </Animated.View>
    </View>
  );
}

/**
 * Logotipo oficial "clarevo." (D-022): nome em minúsculas e ponto lima, como nas telas originais.
 * `height` é a altura da caixa do nome (do topo do "l" à linha de base).
 */
export function Logo({ height = 22, variant = 'cor' }: { height?: number; variant?: Variant }) {
  const p = PALETTE[variant];
  return (
    <View accessible accessibilityRole="image" accessibilityLabel="Clarevo">
      <Svg width={height * (LOGOTYPE_WIDTH / LOGOTYPE_HEIGHT)} height={height} viewBox={`0 0 ${LOGOTYPE_WIDTH} ${LOGOTYPE_HEIGHT}`}>
        <Path d={LOGOTYPE_WORD} fill={p.word} />
        <Circle cx={LOGOTYPE_DOT.cx} cy={LOGOTYPE_DOT.cy} r={LOGOTYPE_DOT.r} fill={p.moon} />
      </Svg>
    </View>
  );
}
