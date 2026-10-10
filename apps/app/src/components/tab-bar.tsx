import { BAR_TEXT, LEARN_UI_TEXT, barModeFor, topicTabFor } from '@clarevo/core';
import { router, usePathname } from 'expo-router';
import type { TabListProps, TabTriggerSlotProps } from 'expo-router/ui';
import { ArrowLeftRight, BookOpen, Flag, House, type LucideIcon } from 'lucide-react-native';
import { forwardRef, useEffect, useState, useSyncExternalStore } from 'react';
import { Keyboard, Pressable, StyleSheet, useWindowDimensions, View, type PressableProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Txt } from '@/components/ui';
import { setBrowseBarInset } from '@/lib/bar-inset';
import { colors, fonts, radius } from '@/theme/tokens';

/**
 * Navegação: Resumo, Movimentações, Metas e Aprender. "Movimentos" é o rótulo compacto; o nome acessível o contém
 * ("Movimentos: movimentações do mês"; WCAG 2.5.3, rótulo no nome).
 * Aprender mantém o rótulo curto (quatro destinos do Primeiro Ciclo) e o nome acessível "Aprender e dúvidas", que
 * contém o rótulo visível (D-031(1); WCAG 2.5.3).
 */
export const TABS: { name: string; href: '/' | '/movimentacoes' | '/metas' | '/aprender'; label: string; a11y: string; icon: LucideIcon }[] = [
  { name: 'index', href: '/', label: 'Resumo', a11y: 'Resumo', icon: House },
  { name: 'movimentacoes', href: '/movimentacoes', label: 'Movimentos', a11y: 'Movimentos: movimentações do mês', icon: ArrowLeftRight },
  { name: 'metas', href: '/metas', label: 'Metas', a11y: 'Metas', icon: Flag },
  { name: 'aprender', href: '/aprender', label: LEARN_UI_TEXT.tabLabel, a11y: LEARN_UI_TEXT.tabA11y, icon: BookOpen },
];

type Tab = (typeof TABS)[number];

/**
 * Aba de onde a pessoa saiu para uma tela de consulta (Contas a pagar, Calculadoras...). Fica só em memória: a barra das
 * telas de consulta marca essa aba, como a barra das abas faria.
 */
let lastTab: Tab['href'] | null = null;
const lastTabListeners = new Set<() => void>();
function setLastTab(href: Tab['href']) {
  if (lastTab === href) return;
  lastTab = href;
  lastTabListeners.forEach((l) => l());
}
const subscribeLastTab = (l: () => void) => {
  lastTabListeners.add(l);
  return () => void lastTabListeners.delete(l);
};
const useLastTab = () => useSyncExternalStore(subscribeLastTab, () => lastTab, () => null);

type FaceProps = PressableProps & { focused: boolean; label: string; a11y: string; icon: LucideIcon };

/** Botão da barra: o mesmo desenho nas abas e nas telas de consulta (ícone, rótulo curto, 56 px, aba marcada). */
const TabFace = forwardRef<View, FaceProps>(function TabFace({ focused, label, a11y, icon: Icon, ...props }, ref) {
  const color = focused ? colors.brand : colors.textSecondary;
  const narrow = useWindowDimensions().width < 360;
  return (
    <Pressable
      ref={ref}
      {...props}
      accessibilityRole="tab"
      accessibilityLabel={a11y}
      accessibilityState={{ selected: focused }}
      aria-selected={focused}
      style={(s) => [
        styles.button,
        focused && styles.buttonActive,
        (s as { focused?: boolean }).focused && { outlineWidth: 3, outlineColor: colors.brand, outlineStyle: 'solid' },
      ]}>
      <Icon size={22} color={color} strokeWidth={focused ? 2.25 : 2} />
      <Txt variant="caption" color={color} style={{ fontFamily: fonts.bold, fontSize: narrow ? 11.5 : 13 }} numberOfLines={1} maxFontSizeMultiplier={1.3}>
        {label}
      </Txt>
    </Pressable>
  );
});

type ButtonProps = TabTriggerSlotProps & { label: string; a11y: string; icon: LucideIcon };

export const TabButton = forwardRef<View, ButtonProps>(function TabButton({ isFocused, label, a11y, icon, ...props }, ref) {
  // A aba em foco vira a "aba de origem" das telas de consulta abertas por cima dela.
  useEffect(() => {
    const tab = TABS.find((t) => t.a11y === a11y);
    if (isFocused && tab) setLastTab(tab.href);
  }, [isFocused, a11y]);
  return <TabFace ref={ref} {...props} focused={!!isFocused} label={label} a11y={a11y} icon={icon} />;
});

/** Teclado aberto: a barra sai da frente dos campos (no celular). */
function useKeyboardVisible() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return visible;
}

/**
 * Barra das telas de consulta (D-039): as telas abertas por cima de uma aba (Calculadoras, Contas a pagar, detalhes) são
 * rotas fora do layout das abas e perdiam a barra. Esta barra, no layout da raiz, aparece em toda tela que o core
 * (`barModeFor`) classifica como de consulta e marca a aba de onde a pessoa veio. Formulários ficam sem barra: a ação
 * principal está no rodapé fixo. Tocar numa aba volta a ela, fechando as telas abertas por cima.
 */
export function BrowseTabBar() {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardVisible();
  const origin = useLastTab();
  const visible = barModeFor(pathname) === 'consulta' && !keyboard;
  useEffect(() => {
    if (!visible) setBrowseBarInset(0);
  }, [visible]);
  useEffect(() => () => setBrowseBarInset(0), []);
  if (!visible) return null;
  const active = origin ?? topicTabFor(pathname);
  // Sobreposta ao fim da tela (absoluta): a pilha de telas não encolhe quando a barra surge, então não há barra dupla nem salto
  // na animação. A rolagem de cada tela reserva o espaço dela (lib/bar-inset).
  return (
    <View style={[styles.barWrap, styles.overlay, { paddingBottom: Math.max(insets.bottom, 8) }]} onLayout={(e) => setBrowseBarInset(e.nativeEvent.layout.height)}>
      <View accessibilityRole="tablist" aria-label={BAR_TEXT.label} style={styles.bar}>
        {TABS.map((t) => (
          <TabFace key={t.name} focused={t.href === active} label={t.label} a11y={t.a11y} icon={t.icon} onPress={() => router.dismissTo(t.href)} />
        ))}
      </View>
    </View>
  );
}

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
  overlay: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  barWrap: { backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8 },
  bar: { flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 8, width: '100%', maxWidth: 560, alignSelf: 'center' },
  button: { flex: 1, minHeight: 56, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', gap: 4 },
  buttonActive: { backgroundColor: colors.brandTint },
});
