import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { spaceKeyPress, Txt } from '@/components/ui';
import { colors, fonts, motion, radius, space } from '@/theme/tokens';

const TRACK_WIDTH = 48;
const KNOB = 22;
const TRAVEL = TRACK_WIDTH - KNOB - 6;

/**
 * Interruptor de preferência (Conta, A2): a linha inteira é o alvo (no mínimo 44 px), com papel "switch", estado
 * marcado e foco visível. A bolinha desliza em 120 ms; com "reduzir movimento", vai direto. Desligado: trilho
 * contornado (3,4:1 sobre branco); ligado: azul. A cor nunca é a única marca: o leitor de tela diz o estado.
 */
export function SettingSwitch({
  label,
  caption,
  value,
  onChange,
  disabled,
}: {
  label: string;
  caption?: string;
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  const x = useSharedValue(value ? 1 : 0);
  useEffect(() => {
    x.value = withTiming(value ? 1 : 0, { duration: motion.press, reduceMotion: ReduceMotion.System });
  }, [value, x]);
  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: x.value * TRAVEL }] }));
  const toggle = () => {
    if (!disabled) onChange(!value);
  };
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled: !!disabled }}
      aria-checked={value}
      accessibilityLabel={label}
      accessibilityHint={caption}
      disabled={disabled}
      onPress={toggle}
      {...spaceKeyPress(toggle)}
      style={(s) => [styles.row, disabled && { opacity: 0.65 }, (s as { focused?: boolean }).focused && styles.focusRing]}>
      <View style={styles.text}>
        <Txt variant="label" style={{ fontFamily: fonts.bold, fontSize: 16, lineHeight: 22 }}>
          {label}
        </Txt>
        {caption ? (
          <Txt variant="caption" color={colors.textSecondary}>
            {caption}
          </Txt>
        ) : null}
      </View>
      <View style={[styles.track, value && styles.trackOn]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Animated.View style={[styles.knob, value && { borderColor: colors.surface }, knob]} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 44, paddingVertical: space[1], borderRadius: radius.sm },
  text: { flex: 1, gap: 2 },
  track: {
    width: TRACK_WIDTH,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    padding: 1.5,
    justifyContent: 'center',
    flexShrink: 0,
  },
  trackOn: { borderColor: colors.brand, backgroundColor: colors.brand },
  knob: {
    width: KNOB,
    height: KNOB,
    borderRadius: KNOB / 2,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
  },
  focusRing: { outlineWidth: 3, outlineStyle: 'solid', outlineColor: colors.brand, outlineOffset: 2 },
});
