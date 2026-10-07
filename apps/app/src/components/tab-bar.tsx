import type { TabListProps, TabTriggerSlotProps } from 'expo-router/ui';
import { ArrowLeftRight, BookOpen, Flag, House, type LucideIcon } from 'lucide-react-native';
import { forwardRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Txt } from '@/components/ui';
import { colors, fonts, radius } from '@/theme/tokens';

export const TABS: { name: string; href: '/' | '/movimentos' | '/metas' | '/aprender'; label: string; icon: LucideIcon }[] = [
  { name: 'index', href: '/', label: 'Resumo', icon: House },
  { name: 'movimentos', href: '/movimentos', label: 'Movimentos', icon: ArrowLeftRight },
  { name: 'metas', href: '/metas', label: 'Metas', icon: Flag },
  { name: 'aprender', href: '/aprender', label: 'Aprender', icon: BookOpen },
];

type ButtonProps = TabTriggerSlotProps & { label: string; icon: LucideIcon };

export const TabButton = forwardRef<View, ButtonProps>(function TabButton({ isFocused, label, icon: Icon, ...props }, ref) {
  const color = isFocused ? colors.brand : colors.textSecondary;
  return (
    <Pressable
      ref={ref}
      {...props}
      accessibilityRole="tab"
      accessibilityState={{ selected: !!isFocused }}
      style={[styles.button, isFocused && styles.buttonActive]}>
      <Icon size={22} color={color} strokeWidth={isFocused ? 2.25 : 2} />
      <Txt variant="caption" color={color} style={{ fontFamily: fonts.bold }}>
        {label}
      </Txt>
    </Pressable>
  );
});

/** Os TabTrigger precisam ser filhos diretos de TabList dentro do layout de Tabs. */
export function TabBar({ children, ...props }: TabListProps) {
  const insets = useSafeAreaInsets();
  return (
    <View {...props} style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    paddingTop: 8,
    paddingHorizontal: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    justifyContent: 'space-around',
  },
  button: {
    flex: 1,
    minHeight: 60,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  buttonActive: { backgroundColor: colors.brandTint },
});
