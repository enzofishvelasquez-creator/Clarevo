import { addMonths, formatMonthBR } from '@clarevo/core';
import { router } from 'expo-router';
import { ArrowLeft, ChevronLeft, ChevronRight, Users } from 'lucide-react-native';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { Logo } from '@/components/brand';
import { DemoPill, TopInset, Txt } from '@/components/ui';
import { canGoForward, useView, type SpaceKind } from '@/state/data';
import { useSession } from '@/state/session';
import { colors, fonts, motion, radius, space } from '@/theme/tokens';

export function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '')).toUpperCase() || '·';
}

const focusOnBrand = { outlineWidth: 3, outlineColor: colors.accent, outlineStyle: 'solid', outlineOffset: 2 } as const;

/** Logo reverso, selo de demonstração e acesso à Conta (perfil, segurança e benefício). */
function BrandRow() {
  const { user, auth } = useSession();
  return (
    <View style={styles.top}>
      <Logo height={32} variant="reverso" />
      <View style={styles.topRight}>
        {auth.mode === 'demo' ? <DemoPill /> : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Conta: perfil, segurança e acesso ao plano"
          onPress={() => router.push('/conta')}
          style={(s) => [styles.avatar, (s as { focused?: boolean }).focused && focusOnBrand]}>
          <Txt variant="label" color={colors.brand} style={{ fontFamily: fonts.extrabold }} maxFontSizeMultiplier={1.3}>
            {initialsOf(user?.displayName ?? '')}
          </Txt>
        </Pressable>
      </View>
    </View>
  );
}

/**
 * Cabeçalho das abas: faixa azul de ponta a ponta, conteúdo limitado a 560 px,
 * com logo e avatar em todas as abas (padrão único). `title` aparece abaixo do logo.
 */
export function AppHeader({ title, children }: { title?: string; children?: ReactNode }) {
  return (
    <View style={styles.band}>
      <TopInset color={colors.brand} />
      <View style={styles.inner}>
        <BrandRow />
        {title ? (
          <Txt variant="title" color={colors.textOnBrand} style={styles.title} accessibilityRole="header" aria-level={1}>
            {title}
          </Txt>
        ) : null}
        {children}
      </View>
    </View>
  );
}

/**
 * Cabeçalho compacto das telas internas (formulário, detalhe, composição, conta):
 * voltar, título e, à direita, o contexto fixo ou outra informação.
 */
export function SubHeader({ title, onBack, right }: { title: string; onBack?: () => void; right?: ReactNode }) {
  const back = onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/')));
  return (
    <View style={styles.subBand}>
      <TopInset color={colors.brand} />
      <View style={[styles.inner, styles.subInner]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Voltar"
          onPress={back}
          hitSlop={6}
          style={(s) => [styles.backBtn, (s as { focused?: boolean }).focused && focusOnBrand]}>
          <ArrowLeft size={22} color={colors.textOnBrand} />
        </Pressable>
        <Txt variant="title" color={colors.textOnBrand} style={styles.subTitle} numberOfLines={1} accessibilityRole="header" aria-level={1}>
          {title}
        </Txt>
        {right}
      </View>
    </View>
  );
}

/** Contexto fixo durante o preenchimento ou na leitura de um registro. */
export function ContextPill({ label }: { label: string }) {
  return (
    <View style={styles.pill} accessible accessibilityLabel={`Contexto: ${label}`}>
      <Txt variant="caption" color={colors.brand} style={{ fontFamily: fonts.bold }}>
        {label}
      </Txt>
    </View>
  );
}

const OPTIONS: { kind: SpaceKind; label: string }[] = [
  { kind: 'pessoal', label: 'Pessoal' },
  { kind: 'familia', label: 'Família' },
];

/** Seletor Pessoal/Família sempre visível nas abas (CL-V002). A pílula branca desliza em 200 ms. */
export function ContextSwitch() {
  const { space: active, setSpace } = useView();
  const reduced = useReducedMotion();
  const [width, setWidth] = useState(0);
  const index = OPTIONS.findIndex((o) => o.kind === active);
  const x = useSharedValue(0);
  const half = Math.max(0, (width - 8) / 2);

  useEffect(() => {
    const target = index * half;
    x.value = reduced || half === 0 ? target : withTiming(target, { duration: motion.context });
  }, [index, half, reduced, x]);

  const pill = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return (
    <View
      style={styles.track}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      accessibilityRole="tablist"
      accessibilityLabel="Contexto financeiro">
      {half > 0 ? <Animated.View style={[styles.indicator, { width: half }, pill]} /> : null}
      {OPTIONS.map((o) => {
        const selected = o.kind === active;
        return (
          <Pressable
            key={o.kind}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            aria-selected={selected}
            accessibilityLabel={`Ver dados de ${o.label}`}
            onPress={() => (selected ? undefined : setSpace(o.kind))}
            style={(s) => [styles.option, half === 0 && selected && styles.optionSelected, (s as { focused?: boolean }).focused && focusOnBrand]}>
            {o.kind === 'familia' ? <Users size={18} color={selected ? colors.brand : colors.textOnBrand} /> : null}
            <Txt variant="label" color={selected ? colors.brand : colors.textOnBrand} style={{ fontFamily: fonts.bold, fontSize: 16 }}>
              {o.label}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Período mensal com mês anterior e seguinte (até o mês atual). */
export function MonthSwitcher({ color = colors.textOnBrand }: { color?: string }) {
  const { month, setMonth, currentMonth } = useView();
  const forward = canGoForward(month, currentMonth);
  const prev = addMonths(month, -1);
  const next = addMonths(month, 1);
  return (
    <View style={styles.month}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Mês anterior: ${formatMonthBR(prev)}`}
        hitSlop={8}
        onPress={() => setMonth(prev)}
        style={(s) => [styles.monthBtn, (s as { focused?: boolean }).focused && focusOnBrand]}>
        <ChevronLeft size={22} color={color} />
      </Pressable>
      <Txt variant="label" color={color} style={{ flex: 1, textAlign: 'center', fontFamily: fonts.semibold }} accessibilityRole="header" aria-level={2}>
        {formatMonthBR(month)}
      </Txt>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Próximo mês: ${formatMonthBR(next)}`}
        accessibilityState={{ disabled: !forward }}
        disabled={!forward}
        hitSlop={8}
        onPress={() => setMonth(next)}
        style={(s) => [styles.monthBtn, !forward && { opacity: 0.35 }, forward && (s as { focused?: boolean }).focused && focusOnBrand]}>
        <ChevronRight size={22} color={color} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  band: { backgroundColor: colors.brand, borderBottomLeftRadius: radius.xl, borderBottomRightRadius: radius.xl },
  inner: { width: '100%', maxWidth: 560, alignSelf: 'center', paddingHorizontal: space[6], paddingTop: space[4], paddingBottom: space[6] },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space[5], gap: space[3] },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  title: { fontSize: 24, lineHeight: 32, marginBottom: space[4] },
  avatar: { minWidth: 44, height: 44, paddingHorizontal: 4, borderRadius: 22, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  subBand: { backgroundColor: colors.brand },
  subInner: { flexDirection: 'row', alignItems: 'center', gap: space[2], paddingTop: space[2], paddingBottom: space[3], paddingHorizontal: space[3] },
  backBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  subTitle: { flex: 1, minWidth: 0 },
  pill: { backgroundColor: colors.surface, borderRadius: radius.pill, paddingHorizontal: space[3], paddingVertical: space[1], marginRight: space[3] },
  track: { flexDirection: 'row', backgroundColor: colors.brandDeep, borderRadius: radius.md, padding: 4 },
  indicator: { position: 'absolute', left: 4, top: 4, bottom: 4, borderRadius: 13, backgroundColor: colors.surface },
  option: { flex: 1, minHeight: 48, borderRadius: 13, flexDirection: 'row', gap: space[2], alignItems: 'center', justifyContent: 'center' },
  optionSelected: { backgroundColor: colors.surface },
  month: { flexDirection: 'row', alignItems: 'center', marginTop: space[5] },
  monthBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
