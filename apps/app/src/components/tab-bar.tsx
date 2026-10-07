import type { TabListProps, TabTriggerSlotProps } from 'expo-router/ui';
import { ArrowLeftRight, BookOpen, Flag, House, type LucideIcon } from 'lucide-react-native';
import { forwardRef } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Txt } from '@/components/ui';
import { colors, fonts, radius } from '@/theme/tokens';

/** Navegação: Resumo, Movimentações, Metas e Aprender. "Movimentos" é o rótulo compacto; o nome acessível é completo. */
export const TABS: { name: string; href: '/' | '/movimentacoes' | '/metas' | '/aprender'; label: string; a11y: string; icon: LucideIcon }[] = [
  { name: 'index', href: '/', label: 'Resumo', a11y: 'Resumo', icon: House },
  { name: 'movimentacoes', href: '/movimentacoes', label: 'Movimentos', a11y: 'Movimentações', icon: ArrowLeftRight },
  { name: 'metas', href: '/metas', label: 'Metas', a11y: 'Metas', icon: Flag },
  { name: 'aprender', href: '/aprender', label: 'Aprender', a11y: 'Aprender', icon: BookOpen },
];

type ButtonProps = TabTriggerSlotProps & { label: string; a11y: string; icon: LucideIcon };

export const TabButton = forwardRef<View, ButtonProps>(function TabButton({ isFocused, label, a11y, icon: Icon, ...props }, ref) {
  const color = isFocused ? colors.brand : colors.textSecondary;
  const narrow = useWindowDimensions().width < 360;
  return (
    <Pressable
      ref={ref}
      {...props}
      accessibilityRole="tab"
      accessibilityLabel={a11y}
      accessibilityState={{ selected: !!isFocused }}
      aria-selected={!!isFocused}
      style={(s) => [
        styles.button,
        isFocused && styles.buttonActive,
        (s as { focused?: boolean }).focused && { outlineWidth: 3, outlineColor: colors.brand, outlineStyle: 'solid' },
      ]}>
      <Icon size={22} color={color} strokeWidth={isFocused ? 2.25 : 2} />
      <Txt variant="caption" color={color} style={{ fontFamily: fonts.bold, fontSize: narrow ? 11.5 : 13 }} numberOfLines={1} maxFontSizeMultiplier={1.3}>
        {label}
      </Txt>
    </Pressable>
  );
});

/** Os TabTrigger precisam ser filhos diretos de TabList dentro do layout de Tabs. */
export function TabBar({ children, ...props }: TabListProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.barWrap, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      <View {...props} style={styles.bar}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  barWrap: { backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8 },
  bar: { flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 8, width: '100%', maxWidth: 560, alignSelf: 'center' },
  button: { flex: 1, minHeight: 56, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', gap: 4 },
  buttonActive: { backgroundColor: colors.brandTint },
});
