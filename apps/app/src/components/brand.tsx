import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { LOGO_SYMBOL_C, LOGO_SYMBOL_MOON, LOGO_WORDMARK, LOGO_WORDMARK_WIDTH } from '@/theme/logo-paths';
import { colors } from '@/theme/tokens';

type Variant = 'cor' | 'reverso' | 'uma-cor';

const PALETTE: Record<Variant, { c: string; moon: string; word: string }> = {
  cor: { c: colors.brand, moon: colors.accent, word: colors.text },
  reverso: { c: colors.textOnBrand, moon: colors.accent, word: colors.textOnBrand },
  'uma-cor': { c: colors.text, moon: colors.text, word: colors.text },
};

/** Símbolo: C aberto com crescente lima (logo aprovado em 07/10/2026). */
export function LogoSymbol({ size = 32, variant = 'cor' }: { size?: number; variant?: Variant }) {
  const p = PALETTE[variant];
  return (
    <Svg width={size * (322 / 336)} height={size} viewBox="-6 -6 322 336" accessible={false}>
      <Path d={LOGO_SYMBOL_C} fill={p.c} />
      <Path d={LOGO_SYMBOL_MOON} fill={p.moon} />
    </Svg>
  );
}

/** Assinatura horizontal: símbolo + nome. */
export function Logo({ height = 32, variant = 'cor' }: { height?: number; variant?: Variant }) {
  const p = PALETTE[variant];
  const gap = 34;
  const vbw = 316 + gap + LOGO_WORDMARK_WIDTH + 12;
  return (
    <View accessible accessibilityRole="image" accessibilityLabel="Clarevo">
      <Svg width={height * (vbw / 336)} height={height} viewBox={`-6 -6 ${vbw} 336`}>
        <Path d={LOGO_SYMBOL_C} fill={p.c} />
        <Path d={LOGO_SYMBOL_MOON} fill={p.moon} />
        <Path d={LOGO_WORDMARK} fill={p.word} transform={`translate(${310 + gap} 0)`} />
      </Svg>
    </View>
  );
}
