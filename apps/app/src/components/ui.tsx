import { formatBRL } from '@clarevo/core';
import type { LucideIcon } from 'lucide-react-native';
import { forwardRef, useState, type ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts, radius, space, tabular, type } from '@/theme/tokens';

type Variant = keyof typeof type;

export function Txt({ variant = 'body', color = colors.text, style, ...props }: TextProps & { variant?: Variant; color?: string }) {
  return <Text {...props} style={[type[variant], { color }, style]} />;
}

export function Money({
  cents,
  variant = 'amount',
  color = colors.text,
  style,
  ...props
}: TextProps & { cents: number; variant?: Variant; color?: string }) {
  return (
    <Txt variant={variant} color={color} style={[tabular, style]} {...props}>
      {formatBRL(cents)}
    </Txt>
  );
}

export function Screen({
  children,
  contentStyle,
  bottomInset = true,
}: {
  children: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  bottomInset?: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.screenContent, bottomInset && { paddingBottom: insets.bottom + space[10] }, contentStyle]}
      keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}

export function TopInset({ color }: { color: string }) {
  const insets = useSafeAreaInsets();
  return <View style={{ height: insets.top, backgroundColor: color }} />;
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

type ButtonTone = 'brand' | 'soft' | 'danger' | 'ghost';

const TONES: Record<ButtonTone, { bg: string; bgPressed: string; fg: string }> = {
  brand: { bg: colors.brand, bgPressed: colors.brandPressed, fg: colors.textOnBrand },
  soft: { bg: colors.brandTint, bgPressed: '#DCE6FF', fg: colors.brand },
  danger: { bg: colors.surface, bgPressed: colors.errorTint, fg: colors.error },
  ghost: { bg: 'transparent', bgPressed: colors.brandTint, fg: colors.brand },
};

export function Button({
  label,
  icon: Icon,
  tone = 'brand',
  busyLabel,
  busy,
  style,
  ...props
}: PressableProps & { label: string; icon?: LucideIcon; tone?: ButtonTone; busy?: boolean; busyLabel?: string; style?: StyleProp<ViewStyle> }) {
  const t = TONES[tone];
  const disabled = props.disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled, busy: !!busy }}
      {...props}
      disabled={disabled}
      style={(state) => [
        styles.button,
        { backgroundColor: state.pressed ? t.bgPressed : t.bg, opacity: disabled ? 0.65 : 1 },
        tone === 'danger' && { borderWidth: 1, borderColor: colors.border },
        state.pressed && { transform: [{ scale: 0.98 }] },
        (state as { focused?: boolean }).focused && styles.focusRing,
        style,
      ]}>
      {Icon ? <Icon size={20} color={t.fg} strokeWidth={2.25} /> : null}
      <Txt variant="label" color={t.fg} style={styles.buttonText}>
        {busy && busyLabel ? busyLabel : label}
      </Txt>
    </Pressable>
  );
}

export function LinkButton({ label, color = colors.brand, ...props }: PressableProps & { label: string; color?: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      hitSlop={10}
      {...props}
      style={(s) => [styles.link, (s as { focused?: boolean }).focused && styles.focusRing]}>
      <Txt variant="label" color={color} style={{ fontFamily: fonts.bold, fontSize: 16 }}>
        {label}
      </Txt>
    </Pressable>
  );
}

export const TextField = forwardRef<
  TextInput,
  TextInputProps & { label: string; error?: string; hint?: string; large?: boolean }
>(function TextField({ label, error, hint, large, style, onFocus, onBlur, ...props }, ref) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: space[2] }}>
      <Txt variant="label" style={{ fontFamily: fonts.bold }}>
        {label}
      </Txt>
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        accessibilityHint={error ?? hint}
        placeholderTextColor={colors.textSecondary}
        {...props}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[
          styles.input,
          large && styles.inputLarge,
          focused && styles.inputFocused,
          error ? styles.inputError : null,
          style,
        ]}
      />
      {hint && !error ? (
        <Txt variant="caption" color={colors.textSecondary}>
          {hint}
        </Txt>
      ) : null}
      {error ? (
        <Txt variant="label" color={colors.error} accessibilityLiveRegion="polite" accessibilityRole="alert">
          {error}
        </Txt>
      ) : null}
    </View>
  );
});

export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={(s) => [styles.chip, selected && styles.chipSelected, (s as { focused?: boolean }).focused && styles.focusRing]}>
      <Txt variant="label" color={selected ? colors.brand : colors.text}>
        {label}
      </Txt>
    </Pressable>
  );
}

export function Banner({ tone, children, icon: Icon }: { tone: 'erro' | 'sucesso' | 'info'; children: ReactNode; icon?: LucideIcon }) {
  const bg = tone === 'erro' ? colors.errorTint : tone === 'sucesso' ? colors.successTint : colors.brandTint;
  const fg = tone === 'erro' ? colors.error : tone === 'sucesso' ? colors.success : colors.text;
  return (
    <View style={[styles.banner, { backgroundColor: bg }]} accessibilityRole="alert" accessibilityLiveRegion="polite">
      {Icon ? <Icon size={20} color={fg} /> : null}
      <View style={{ flex: 1, gap: space[1] }}>{children}</View>
    </View>
  );
}

export function DemoBadge() {
  return (
    <View style={styles.demo}>
      <Txt variant="caption" color={colors.text} style={{ fontFamily: fonts.bold }}>
        Demonstração · acesso simulado e dados fictícios
      </Txt>
    </View>
  );
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  screenContent: { width: '100%', maxWidth: 560, alignSelf: 'center' },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space[5],
    shadowColor: '#17223B',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  button: {
    minHeight: 52,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[2],
    paddingHorizontal: space[5],
    paddingVertical: space[3],
  },
  buttonText: { fontFamily: fonts.bold, fontSize: 16, textAlign: 'center', flexShrink: 1 },
  link: { minHeight: 44, justifyContent: 'center', alignSelf: 'center', paddingHorizontal: space[2] },
  focusRing: { outlineWidth: 3, outlineStyle: 'solid', outlineColor: colors.brand, outlineOffset: 2 },
  input: {
    minHeight: 52,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: '#C9D3E6',
    backgroundColor: colors.surface,
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    fontFamily: fonts.medium,
    fontSize: 16,
    color: colors.text,
  },
  inputLarge: { fontFamily: fonts.extrabold, fontSize: 24, minHeight: 60, fontVariant: ['tabular-nums'] },
  inputFocused: { borderColor: colors.text, borderWidth: 2 },
  inputError: { borderColor: colors.error, backgroundColor: colors.errorTint },
  chip: {
    paddingHorizontal: space[4],
    minHeight: 44,
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipSelected: { borderColor: colors.brand, backgroundColor: colors.brandTint },
  banner: { flexDirection: 'row', gap: space[3], padding: space[4], borderRadius: radius.md, alignItems: 'flex-start' },
  demo: { alignSelf: 'center', backgroundColor: colors.accent, paddingHorizontal: space[3], paddingVertical: space[1], borderRadius: radius.pill },
});
