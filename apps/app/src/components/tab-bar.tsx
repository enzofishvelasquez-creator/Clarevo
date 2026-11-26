import { BAR_TEXT, INVESTMENT_TEXT, LEARN_UI_TEXT, TAB_LABEL_MAX_FONT_SCALE, barModeFor, barTabFor } from '@clarevo/core';
import { router, usePathname, useSegments } from 'expo-router';
import type { TabListProps, TabTriggerSlotProps } from 'expo-router/ui';
import { ArrowLeftRight, BookOpen, Flag, House, TrendingUp, type LucideIcon } from 'lucide-react-native';
import { forwardRef, useEffect, useState, useSyncExternalStore } from 'react';
import { Keyboard, Platform, Pressable, StyleSheet, useWindowDimensions, View, type PressableProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FitTxt } from '@/components/ui';
import { setBrowseBarInset } from '@/lib/bar-inset';
import { useWideLayout } from '@/lib/layout';
import { contaBelow, useNavState } from '@/lib/nav-state';
import { colors, fonts, radius } from '@/theme/tokens';

/**
 * Navegação: Resumo, Movimentos, Metas, Investir (D-093) e Aprender. "Movimentos" é o rótulo compacto; o nome acessível o contém
 * ("Movimentos do mês"; WCAG 2.5.3, rótulo no nome).
 * Aprender mantém o rótulo curto (quatro destinos do Primeiro Ciclo) e o nome acessível "Aprender e dúvidas", que
 * contém o rótulo visível (D-031(1); WCAG 2.5.3).
 */
export const TABS: { name: string; href: '/' | '/movimentacoes' | '/metas' | '/investimentos' | '/aprender'; label: string; a11y: string; icon: LucideIcon }[] = [
  { name: 'index', href: '/', label: 'Resumo', a11y: 'Resumo', icon: House },
  { name: 'movimentacoes', href: '/movimentacoes', label: 'Movimentos', a11y: 'Movimentos do mês', icon: ArrowLeftRight },
  { name: 'metas', href: '/metas', label: 'Metas', a11y: 'Metas', icon: Flag },
  // Investimentos (D-093): rótulo curto, para caber nas cinco abas a 320 px.
  { name: 'investimentos', href: '/investimentos', label: INVESTMENT_TEXT.tabLabel, a11y: INVESTMENT_TEXT.tabLabel, icon: TrendingUp },
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
export const useLastTab = () => useSyncExternalStore(subscribeLastTab, () => lastTab, () => null);

type FaceProps = PressableProps & { focused: boolean; label: string; a11y: string; icon: LucideIcon };

/**
 * Botão da barra: o mesmo desenho nas abas e nas telas de consulta (ícone, rótulo curto, 56 px, aba marcada). Com letra grande (estudo de
 * 25/11/2026, sinal 20: "Resu…", "Movi…"), o rótulo cresce até 1,3 vez e encolhe para caber, nunca com reticências, e continua à vista em
 * qualquer escala (revisão de 26/11/2026: sumir com o rótulo acima de 1,3 tirava o nome de quem mais precisa dele). No iPhone, tocar e
 * segurar a aba mostra o nome grande no centro da tela (o visualizador de conteúdo grande do sistema, como nas barras de abas do próprio
 * iOS); o nome acessível continua para o leitor de tela.
 */
const TabFace = forwardRef<View, FaceProps>(function TabFace({ focused, label, a11y, icon: Icon, ...props }, ref) {
  const color = focused ? colors.brandText : colors.textSecondary;
  // Cinco abas (D-093): o rótulo mais longo ("Movimentos") cabe inteiro de 320 px para cima, com letra de 12, 11 ou 10,5.
  const { width } = useWindowDimensions();
  const fontSize = width >= 375 ? 12 : width >= 340 ? 11 : 10.5;
  return (
    <Pressable
      ref={ref}
      {...props}
      accessibilityRole="tab"
      accessibilityLabel={a11y}
      accessibilityState={{ selected: focused }}
      aria-selected={focused}
      {...(Platform.OS === 'ios' ? { accessibilityShowsLargeContentViewer: true, accessibilityLargeContentTitle: label } : {})}
      style={(s) => [
        styles.button,
        focused && styles.buttonActive,
        (s as { focused?: boolean }).focused && { outlineWidth: 3, outlineColor: colors.brandText, outlineStyle: 'solid' },
      ]}>
      <Icon size={22} color={color} strokeWidth={focused ? 2.25 : 2} />
      <FitTxt variant="caption" color={color} style={{ fontFamily: fonts.bold, fontSize, letterSpacing: -0.1 }} maxFontSizeMultiplier={TAB_LABEL_MAX_FONT_SCALE} minimumFontScale={0.6}>
        {label}
      </FitTxt>
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
  // Versão para computador (a partir de 1024 px): a barra lateral (`DesktopNav`) faz este papel.
  const wide = useWideLayout();
  // Endereço que não existe (+not-found, e _sitemap, que mostra a mesma tela): tela de entrada, sem barra, com a saída no botão.
  const unmatched = useSegments().some((s) => s === '+not-found' || s === '_sitemap');
  const visible = !unmatched && barModeFor(pathname) === 'consulta' && !keyboard && !wide;
  // A área de Conta (e o que se abre dela) fica sem aba marcada, por qualquer caminho (estudo de 25/11/2026, sinal 21; core/navigation).
  const navState = useNavState();
  useEffect(() => {
    if (!visible) setBrowseBarInset(0);
  }, [visible]);
  useEffect(() => () => setBrowseBarInset(0), []);
  if (!visible) return null;
  const active = barTabFor(pathname, origin, contaBelow(navState));
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

/**
 * Os TabTrigger precisam ser filhos diretos de TabList dentro do layout de Tabs. `hidden`: na versão para computador, a barra lateral
 * navega; a lista continua montada (as abas existem para o roteador), mas fora da tela e do leitor de tela.
 */
export function TabBar({ children, hidden = false, ...props }: TabListProps & { hidden?: boolean }) {
  const insets = useSafeAreaInsets();
  if (hidden) {
    return (
      <View style={{ display: 'none' }} aria-hidden>
        <View {...props}>{children}</View>
      </View>
    );
  }
  return (
    <View style={[styles.barWrap, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {/* A mesma lista de abas da barra das telas de consulta, com o mesmo nome para o leitor de tela. */}
      <View {...props} accessibilityRole="tablist" aria-label={BAR_TEXT.label} style={styles.bar}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  barWrap: { backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8 },
  bar: { flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 4, width: '100%', maxWidth: 560, alignSelf: 'center' },
  button: { flex: 1, minHeight: 56, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', gap: 4 },
  buttonActive: { backgroundColor: colors.brandTint },
});
