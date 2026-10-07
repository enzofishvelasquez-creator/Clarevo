import { RotateCcw } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { Button, Txt } from '@/components/ui';
import { colors, radius, space } from '@/theme/tokens';

/** Ilustração orgânica: formas abertas em lima e azul, com um cartão de anotação. */
export function WelcomeArt({ width = 300 }: { width?: number }) {
  return (
    <Svg width={width} height={width * 0.72} viewBox="0 0 300 216" accessible={false}>
      <Path d="M70 20C112 4 150 30 156 72C162 116 132 150 92 156C50 162 12 138 8 96C4 58 30 34 70 20Z" fill={colors.accent} />
      <Path d="M226 74C262 70 292 96 290 132C288 172 254 200 216 196C182 192 162 166 166 134C170 100 192 78 226 74Z" fill={colors.brand} />
      <Rect x="86" y="32" width="122" height="144" rx="20" fill={colors.surface} transform="rotate(-8 147 104)" />
      <Path d="M108 64l8 8 14-16" stroke={colors.text} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" fill="none" transform="rotate(-8 147 104)" />
      <Rect x="106" y="98" width="82" height="9" rx="4.5" fill="#E3E8F2" transform="rotate(-8 147 104)" />
      <Rect x="106" y="118" width="58" height="9" rx="4.5" fill={colors.brand} transform="rotate(-8 147 104)" />
    </Svg>
  );
}

/** Pequena composição para estados vazios. */
function EmptyArt() {
  return (
    <Svg width={120} height={84} viewBox="0 0 120 84" accessible={false}>
      <Path d="M30 8C52 0 72 14 74 36C76 58 60 74 38 76C16 78 2 64 2 44C2 26 12 14 30 8Z" fill={colors.accent} />
      <Path d="M92 30C108 28 120 40 118 56C116 72 102 82 88 80C74 78 66 66 68 52C70 40 78 32 92 30Z" fill={colors.brand} opacity={0.9} />
      <Circle cx={60} cy={42} r={16} fill={colors.surface} />
      <Path d="M53 42h14" stroke={colors.text} strokeWidth={3} strokeLinecap="round" />
    </Svg>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <View style={styles.empty}>
      <EmptyArt />
      <Txt variant="title" style={{ textAlign: 'center' }}>
        {title}
      </Txt>
      {children ? (
        <Txt color={colors.textSecondary} style={{ textAlign: 'center' }}>
          {children}
        </Txt>
      ) : null}
      {action}
    </View>
  );
}

export function LoadingState({ label = 'Carregando…', color = colors.brand }: { label?: string; color?: string }) {
  return (
    <View style={styles.loading} accessibilityRole="progressbar" accessibilityLabel={label}>
      <ActivityIndicator color={color} />
      <Txt variant="label" color={color === colors.brand ? colors.textSecondary : color}>
        {label}
      </Txt>
    </View>
  );
}

/** Falha de consulta: nunca exibida como zero. */
export function ErrorState({ message, onRetry, onBrand }: { message: string; onRetry: () => void; onBrand?: boolean }) {
  return (
    <View style={[styles.error, onBrand && { backgroundColor: 'rgba(255,255,255,0.14)' }]} accessibilityRole="alert">
      <Txt variant="label" color={onBrand ? colors.textOnBrand : colors.error}>
        {message}
      </Txt>
      <Button label="Tentar novamente" icon={RotateCcw} tone={onBrand ? 'soft' : 'soft'} onPress={onRetry} />
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', gap: space[3], paddingVertical: space[4] },
  loading: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: space[4] },
  error: { gap: space[3], padding: space[4], borderRadius: radius.md, backgroundColor: colors.errorTint },
});
