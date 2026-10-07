import { addMonths, formatMonthBR } from '@clarevo/core';
import { router } from 'expo-router';
import { ChevronLeft, ChevronRight, Users } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { Logo } from '@/components/brand';
import { Txt } from '@/components/ui';
import { canGoForward, useView, type SpaceKind } from '@/state/data';
import { useSession } from '@/state/session';
import { colors, fonts, radius, space } from '@/theme/tokens';

export function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '')).toUpperCase() || '·';
}

/** Logo reverso e acesso à Conta (perfil e benefício). */
export function BrandHeader() {
  const { user } = useSession();
  return (
    <View style={styles.top}>
      <Logo height={34} variant="reverso" />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Conta: perfil e acesso ao plano"
        onPress={() => router.push('/conta')}
        style={(s) => [styles.avatar, (s as { focused?: boolean }).focused && { outlineWidth: 3, outlineColor: colors.accent, outlineStyle: 'solid' }]}>
        <Txt variant="label" color={colors.brand} style={{ fontFamily: fonts.extrabold }} maxFontSizeMultiplier={1.3}>
          {initialsOf(user?.displayName ?? '')}
        </Txt>
      </Pressable>
    </View>
  );
}

const OPTIONS: { kind: SpaceKind; label: string }[] = [
  { kind: 'pessoal', label: 'Pessoal' },
  { kind: 'familia', label: 'Família' },
];

/**
 * Seletor Pessoal/Família sempre visível (CL-V002).
 * `onRequest` permite à tela confirmar antes de trocar (ex.: formulário com alterações).
 */
export function ContextSwitch({ onRequest }: { onRequest?: (next: SpaceKind) => void }) {
  const { space: active, setSpace } = useView();
  return (
    <View style={styles.track} accessibilityRole="tablist" accessibilityLabel="Contexto financeiro">
      {OPTIONS.map((o) => {
        const selected = o.kind === active;
        return (
          <Pressable
            key={o.kind}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            aria-selected={selected}
            accessibilityLabel={`Ver dados de ${o.label}`}
            onPress={() => (selected ? undefined : onRequest ? onRequest(o.kind) : setSpace(o.kind))}
            style={(s) => [
              styles.option,
              selected && styles.optionSelected,
              (s as { focused?: boolean }).focused && { outlineWidth: 3, outlineColor: colors.accent, outlineStyle: 'solid' },
            ]}>
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
        style={styles.monthBtn}>
        <ChevronLeft size={22} color={color} />
      </Pressable>
      <Txt variant="label" color={color} style={{ flex: 1, textAlign: 'center', fontFamily: fonts.semibold }} accessibilityRole="header">
        {formatMonthBR(month)}
      </Txt>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Próximo mês: ${formatMonthBR(next)}`}
        accessibilityState={{ disabled: !forward }}
        disabled={!forward}
        hitSlop={8}
        onPress={() => setMonth(next)}
        style={[styles.monthBtn, !forward && { opacity: 0.35 }]}>
        <ChevronRight size={22} color={color} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space[5] },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  track: { flexDirection: 'row', backgroundColor: colors.brandDeep, borderRadius: radius.md, padding: 4 },
  option: { flex: 1, minHeight: 48, borderRadius: 13, flexDirection: 'row', gap: space[2], alignItems: 'center', justifyContent: 'center' },
  optionSelected: { backgroundColor: colors.surface },
  month: { flexDirection: 'row', alignItems: 'center', marginTop: space[5] },
  monthBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
