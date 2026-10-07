import type { FinancialEvent } from '@clarevo/core';
import { formatBRL } from '@clarevo/core';
import {
  Bus,
  GraduationCap,
  Home,
  Receipt,
  ShoppingBasket,
  Wallet,
  Zap,
  type LucideIcon,
} from 'lucide-react-native';
import type { ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type StyleProp,
  type TextProps,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { shortDate } from '@/state/finance';
import { colors, fonts, radius, space, tabular, type } from '@/theme/tokens';

type Variant = keyof typeof type;

export function Txt({
  variant = 'body',
  color = colors.text,
  style,
  ...props
}: TextProps & { variant?: Variant; color?: string }) {
  return <Text {...props} style={[type[variant], { color }, style]} />;
}

export function Money({ cents, variant = 'amount', color = colors.text, style, ...props }: TextProps & { cents: number; variant?: Variant; color?: string }) {
  return (
    <Txt variant={variant} color={color} style={[tabular, style]} {...props}>
      {formatBRL(cents)}
    </Txt>
  );
}

export function Logo({ color = colors.textOnBrand }: { color?: string }) {
  return (
    <View style={styles.logo} accessible accessibilityRole="header" accessibilityLabel="Clarevo">
      <Text style={[styles.logoText, { color }]}>clarevo</Text>
      <View style={styles.logoDot} />
    </View>
  );
}

export function Screen({ children, contentStyle }: { children: ReactNode; contentStyle?: StyleProp<ViewStyle> }) {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.screenContent, contentStyle]} keyboardShouldPersistTaps="handled">
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

export function PrimaryButton({
  label,
  icon: Icon,
  style,
  tone = 'brand',
  ...props
}: PressableProps & { label: string; icon?: LucideIcon; style?: StyleProp<ViewStyle>; tone?: 'brand' | 'accent' }) {
  const bg = tone === 'brand' ? colors.brand : colors.accent;
  const fg = tone === 'brand' ? colors.textOnBrand : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      {...props}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: pressed && tone === 'brand' ? colors.brandPressed : bg, opacity: props.disabled ? 0.6 : 1 },
        pressed && { transform: [{ scale: 0.98 }] },
        style,
      ]}>
      {Icon ? <Icon size={20} color={fg} strokeWidth={2.25} /> : null}
      <Txt variant="label" color={fg} style={{ fontSize: 16 }}>
        {label}
      </Txt>
    </Pressable>
  );
}

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  Mercado: ShoppingBasket,
  Transporte: Bus,
  Moradia: Home,
  Educação: GraduationCap,
  Renda: Wallet,
  Cartão: Receipt,
  Energia: Zap,
};

export function EventRow({ event, onPress }: { event: FinancialEvent; onPress?: () => void }) {
  const Icon = CATEGORY_ICONS[event.category] ?? Receipt;
  const isIn = event.direction === 'entrada';
  const when =
    event.status === 'confirmado'
      ? `${isIn ? 'Recebido' : 'Pago'} · ${shortDate(event.settledOn)}`
      : `Vence · ${shortDate(event.dueOn)}`;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${event.description}, ${when}, ${formatBRL(event.amountCents)}`}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}>
      <View style={styles.rowIcon}>
        <Icon size={20} color={colors.brand} />
      </View>
      <View style={{ flex: 1 }}>
        <Txt variant="label" style={{ fontFamily: fonts.bold, fontSize: 15 }}>
          {event.description}
        </Txt>
        <Txt variant="caption" color={colors.textSecondary}>
          {when}
        </Txt>
      </View>
      <Money cents={event.amountCents} variant="label" style={{ fontFamily: fonts.bold, fontSize: 15 }} color={isIn ? colors.success : colors.text} />
    </Pressable>
  );
}

export const styles = StyleSheet.create({
  logo: { flexDirection: 'row', alignItems: 'flex-end' },
  logoText: { fontFamily: fonts.extrabold, fontSize: 30, letterSpacing: -1, lineHeight: 36 },
  logoDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent, marginLeft: 3, marginBottom: 8 },
  screen: { flex: 1, backgroundColor: colors.background },
  screenContent: { paddingBottom: 120, width: '100%', maxWidth: 560, alignSelf: 'center' },
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
    minHeight: 56,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[2],
    paddingHorizontal: space[5],
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: space[3] },
  rowIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    backgroundColor: colors.brandTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
