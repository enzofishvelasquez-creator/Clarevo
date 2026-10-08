import { formatBRL } from '@clarevo/core';
import { Check, Eye, EyeOff, type LucideIcon } from 'lucide-react-native';
import { Children, forwardRef, useEffect, useId, useState, type ReactNode, type Ref } from 'react';
import {
  Platform,
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
import Animated, {
  FadeIn,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts, motion, radius, space, tabular, type } from '@/theme/tokens';

type Variant = keyof typeof type;

/** "R$" e "≈" nunca ficam sozinhos no fim da linha: o espaço depois deles vira não separável (só no texto mostrado). */
const glueMoney = (children: ReactNode) =>
  Children.map(children, (c) => (typeof c === 'string' ? c.replace(/(R\$|≈) /g, '$1\u00a0') : c));

export function Txt({ variant = 'body', color = colors.text, style, children, ...props }: TextProps & { variant?: Variant; color?: string }) {
  return (
    <Text {...props} style={[type[variant], { color }, style]}>
      {glueMoney(children)}
    </Text>
  );
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

/**
 * Valor de destaque que nunca é cortado: reduz a fonte em degraus até caber na largura disponível.
 * (adjustsFontSizeToFit não funciona na web.)
 */
export function FitMoney({ cents, color = colors.text, maxSize = 36, minSize = 22 }: { cents: number; color?: string; maxSize?: number; minSize?: number }) {
  const [width, setWidth] = useState(0);
  const text = formatBRL(cents);
  // Manrope ExtraBold com números tabulares: ~0,62 em por caractere.
  const fits = (size: number) => text.length * size * 0.62 <= width;
  let size = maxSize;
  if (width > 0) while (size > minSize && !fits(size)) size -= 2;
  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ alignSelf: 'stretch' }}>
      <Txt variant="hero" color={color} style={[tabular, { fontSize: size, lineHeight: Math.round(size * 1.22) }]} maxFontSizeMultiplier={1.4}>
        {text}
      </Txt>
    </View>
  );
}

export function Screen({
  children,
  contentStyle,
  bottomInset = true,
  wide,
  scrollRef,
}: {
  children: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  bottomInset?: boolean;
  /** Sem limite de largura (o cabeçalho ocupa a tela inteira; use Body para o conteúdo). */
  wide?: boolean;
  /** Acesso à rolagem (por exemplo, para voltar ao topo). */
  scrollRef?: Ref<ScrollView>;
}) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      ref={scrollRef}
      style={styles.screen}
      contentContainerStyle={[!wide && styles.screenContent, bottomInset && { paddingBottom: insets.bottom + space[10] }, contentStyle]}
      keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}

/** Conteúdo das abas abaixo do cabeçalho de ponta a ponta: limitado a 560 px e centralizado. */
export function Body({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.body, style]}>{children}</View>;
}

export function TopInset({ color }: { color: string }) {
  const insets = useSafeAreaInsets();
  return <View style={{ height: insets.top, backgroundColor: color }} />;
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

/** Resposta ao toque: leve redução de escala em 120 ms (CL-V008). Com "reduzir movimento", não escala. */
function usePressScale() {
  const reduced = useReducedMotion();
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return {
    style,
    onPressIn: () => {
      if (!reduced) scale.value = withTiming(0.98, { duration: motion.press });
    },
    onPressOut: () => {
      scale.value = reduced ? 1 : withTiming(1, { duration: motion.press });
    },
  };
}

type ButtonTone = 'brand' | 'soft' | 'danger' | 'ghost' | 'onBrand';

const TONES: Record<ButtonTone, { bg: string; bgPressed: string; fg: string }> = {
  brand: { bg: colors.brand, bgPressed: colors.brandPressed, fg: colors.textOnBrand },
  soft: { bg: colors.brandTint, bgPressed: '#DCE6FF', fg: colors.brand },
  danger: { bg: colors.surface, bgPressed: colors.errorTint, fg: colors.error },
  ghost: { bg: 'transparent', bgPressed: colors.brandTint, fg: colors.brand },
  onBrand: { bg: 'transparent', bgPressed: 'rgba(255,255,255,0.16)', fg: colors.textOnBrand },
};

export function Button({
  label,
  icon: Icon,
  tone = 'brand',
  busyLabel,
  busy,
  style,
  onPressIn,
  onPressOut,
  ...props
}: PressableProps & { label: string; icon?: LucideIcon; tone?: ButtonTone; busy?: boolean; busyLabel?: string; style?: StyleProp<ViewStyle> }) {
  const t = TONES[tone];
  const disabled = props.disabled || busy;
  const press = usePressScale();
  return (
    <Animated.View style={[press.style, styles.buttonWrap, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !!disabled, busy: !!busy }}
        {...props}
        disabled={disabled}
        onPressIn={(e) => {
          press.onPressIn();
          onPressIn?.(e);
        }}
        onPressOut={(e) => {
          press.onPressOut();
          onPressOut?.(e);
        }}
        style={(state) => [
          styles.button,
          // Ocupado mantém a cor (o texto muda para "Salvando…"); só desabilitado fica esmaecido.
          { backgroundColor: state.pressed ? t.bgPressed : t.bg, opacity: props.disabled && !busy ? 0.65 : 1 },
          tone === 'danger' && { borderWidth: 1, borderColor: colors.border },
          !(props.disabled && !busy) && (state as { focused?: boolean }).focused && (tone === 'onBrand' ? styles.focusRingOnBrand : styles.focusRing),
        ]}>
        {Icon ? <Icon size={20} color={t.fg} strokeWidth={2.25} /> : null}
        <Txt variant="label" color={t.fg} style={styles.buttonText}>
          {busy && busyLabel ? busyLabel : label}
        </Txt>
      </Pressable>
    </Animated.View>
  );
}

export function LinkButton({
  label,
  color = colors.brand,
  icon: Icon,
  style,
  ...props
}: PressableProps & { label: string; color?: string; icon?: LucideIcon; style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable
      accessibilityRole="button"
      hitSlop={10}
      {...props}
      style={(s) => [styles.link, Icon && styles.linkWithIcon, style, (s as { focused?: boolean }).focused && styles.focusRing]}>
      {Icon ? <Icon size={18} color={color} strokeWidth={2.25} /> : null}
      <Txt variant="label" color={color} style={{ fontFamily: fonts.bold, fontSize: 16, flexShrink: 1 }}>
        {label}
      </Txt>
    </Pressable>
  );
}

/**
 * Campo de texto com rótulo, dica e erro ligados ao campo (leitores de tela anunciam o erro).
 * `prefix` mostra um texto fixo à esquerda (ex.: "R$"); campos de senha ganham o botão "Mostrar senha".
 */
export const TextField = forwardRef<
  TextInput,
  TextInputProps & { label: string; error?: string; hint?: string; large?: boolean; prefix?: string }
>(function TextField({ label, error, hint, large, prefix, style, onFocus, onBlur, secureTextEntry, ...props }, ref) {
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const id = useId().replace(/:/g, '');
  const describedBy = error ? `${id}-erro` : hint ? `${id}-dica` : undefined;
  // Atributos ARIA que o React Native Web repassa ao campo na web.
  const aria = { 'aria-invalid': Boolean(error), 'aria-describedby': describedBy } as object;
  return (
    <View style={{ gap: space[2] }}>
      <Txt variant="label" style={{ fontFamily: fonts.bold }}>
        {label}
      </Txt>
      <View style={[styles.input, large && styles.inputLarge, focused && styles.inputFocused, error ? styles.inputError : null]}>
        {prefix ? (
          <Txt variant={large ? 'amount' : 'body'} color={colors.textSecondary} style={styles.prefix} accessibilityElementsHidden importantForAccessibility="no">
            {prefix}
          </Txt>
        ) : null}
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          accessibilityHint={error ?? hint}
          placeholderTextColor={colors.placeholder}
          secureTextEntry={secureTextEntry && !revealed}
          {...aria}
          {...props}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[styles.inputText, large && styles.inputTextLarge, style]}
        />
        {secureTextEntry ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={revealed ? 'Ocultar senha' : 'Mostrar senha'}
            onPress={() => setRevealed((r) => !r)}
            hitSlop={8}
            style={styles.reveal}>
            {revealed ? <EyeOff size={20} color={colors.textSecondary} /> : <Eye size={20} color={colors.textSecondary} />}
          </Pressable>
        ) : null}
      </View>
      {hint && !error ? (
        <Txt variant="caption" color={colors.textSecondary} nativeID={`${id}-dica`}>
          {hint}
        </Txt>
      ) : null}
      {error ? (
        <Animated.View entering={FadeIn.duration(150).reduceMotion(ReduceMotion.System)}>
          <Txt variant="label" color={colors.error} accessibilityLiveRegion="polite" accessibilityRole="alert" nativeID={`${id}-erro`}>
            {error}
          </Txt>
        </Animated.View>
      ) : null}
    </View>
  );
});

/**
 * Na web, o Pressable só responde ao Enter fora de botões. Rádios e caixas de seleção também respondem ao Espaço,
 * como pede o padrão de acessibilidade, sem rolar a página.
 */
export function spaceKeyPress(onPress: () => void): object {
  if (Platform.OS !== 'web') return {};
  return {
    onKeyDown: (e: { key?: string; repeat?: boolean; preventDefault?: () => void }) => {
      if (e.key !== ' ' && e.key !== 'Spacebar') return;
      e.preventDefault?.();
      if (!e.repeat) onPress();
    },
  };
}

export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const press = usePressScale();
  return (
    <Animated.View style={[press.style, styles.chipWrap]}>
      <Pressable
        accessibilityRole="radio"
        accessibilityState={{ checked: selected }}
        aria-checked={selected}
        onPress={onPress}
        {...spaceKeyPress(onPress)}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={(s) => [styles.chip, selected && styles.chipSelected, (s as { focused?: boolean }).focused && styles.focusRing]}>
        {selected ? <Check size={16} color={colors.brand} strokeWidth={2.5} style={{ flexShrink: 0 }} /> : null}
        <Txt variant="label" color={selected ? colors.brand : colors.text} style={{ flexShrink: 1 }}>
          {label}
        </Txt>
      </Pressable>
    </Animated.View>
  );
}

/**
 * Aviso em faixa. Por padrão é anunciado por leitores de tela ao aparecer; `live={false}` serve para textos
 * que mudam enquanto a pessoa digita (prévias), que não devem ser anunciados de novo a cada tecla.
 */
export function Banner({
  tone,
  children,
  icon: Icon,
  live = true,
}: {
  tone: 'erro' | 'sucesso' | 'info';
  children: ReactNode;
  icon?: LucideIcon;
  live?: boolean;
}) {
  const bg = tone === 'erro' ? colors.errorTint : tone === 'sucesso' ? colors.successTint : colors.brandTint;
  const fg = tone === 'erro' ? colors.error : tone === 'sucesso' ? colors.successText : colors.text;
  return (
    <Animated.View
      entering={FadeIn.duration(motion.confirm).reduceMotion(ReduceMotion.System)}
      style={[styles.banner, { backgroundColor: bg }]}
      accessibilityRole={live ? 'alert' : undefined}
      accessibilityLiveRegion={live ? 'polite' : undefined}>
      {Icon ? <Icon size={20} color={fg} /> : null}
      <View style={{ flex: 1, gap: space[1] }}>{children}</View>
    </Animated.View>
  );
}

/** Bloco de carregamento no formato do conteúdo. Pulsa devagar; parado com "reduzir movimento". */
export function Skeleton({ width, height, onBrand, style }: { width: number | `${number}%`; height: number; onBrand?: boolean; style?: StyleProp<ViewStyle> }) {
  const reduced = useReducedMotion();
  const opacity = useSharedValue(1);
  useEffect(() => {
    if (!reduced) opacity.value = withRepeat(withTiming(0.5, { duration: 700 }), -1, true);
  }, [reduced, opacity]);
  const anim = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={[{ width, height, borderRadius: 8, backgroundColor: onBrand ? 'rgba(255,255,255,0.22)' : '#E6EBF5' }, anim, style]}
    />
  );
}

/** Selo compacto da demonstração (acesso simulado e dados fictícios). */
export function DemoPill() {
  return (
    <View style={styles.demo} accessible accessibilityLabel="Demonstração: acesso simulado e dados fictícios">
      <Txt variant="caption" color={colors.text} style={{ fontFamily: fonts.bold, fontSize: 12, lineHeight: 16 }}>
        Demonstração
      </Txt>
    </View>
  );
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  screenContent: { width: '100%', maxWidth: 560, alignSelf: 'center' },
  body: { width: '100%', maxWidth: 560, alignSelf: 'center', padding: space[6], gap: space[4] },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space[5],
    shadowColor: '#17223B',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  buttonWrap: { alignSelf: 'stretch' },
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
  linkWithIcon: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  focusRing: { outlineWidth: 3, outlineStyle: 'solid', outlineColor: colors.brand, outlineOffset: 2 },
  focusRingOnBrand: { outlineWidth: 3, outlineStyle: 'solid', outlineColor: colors.accent, outlineOffset: 2 },
  input: {
    minHeight: 52,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space[4],
  },
  inputText: {
    flex: 1,
    minWidth: 0,
    alignSelf: 'stretch',
    paddingVertical: space[3],
    fontFamily: fonts.medium,
    fontSize: 16,
    color: colors.text,
    outlineStyle: 'none',
  } as object,
  inputLarge: { minHeight: 60 },
  inputTextLarge: { fontFamily: fonts.extrabold, fontSize: 24, fontVariant: ['tabular-nums'] },
  prefix: { marginRight: space[2] },
  reveal: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -space[3] },
  inputFocused: { borderColor: colors.text, borderWidth: 2 },
  inputError: { borderColor: colors.error, backgroundColor: colors.errorTint },
  // Rótulos longos quebram dentro do chip em telas estreitas (nunca passam da largura do grupo).
  chipWrap: { maxWidth: '100%' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[1],
    paddingHorizontal: space[4],
    paddingVertical: space[2],
    minHeight: 44,
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  chipSelected: { borderColor: colors.brand, backgroundColor: colors.brandTint },
  banner: { flexDirection: 'row', gap: space[3], padding: space[4], borderRadius: radius.md, alignItems: 'flex-start' },
  demo: { backgroundColor: colors.accent, paddingHorizontal: space[2], paddingVertical: 2, borderRadius: radius.pill },
});
