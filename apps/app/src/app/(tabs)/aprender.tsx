import { router } from 'expo-router';
import { ArrowUpRight } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { Screen, TopInset, Txt } from '@/components/ui';
import { colors, fonts, radius, space } from '@/theme/tokens';

const ITEMS = [
  { title: 'Fatura sem contar duas vezes', subtitle: 'Uma explicação de 30 segundos', href: '/fatura' as const, bg: colors.accent, fg: colors.text },
  { title: 'Renda variável', subtitle: 'Em breve', bg: colors.brand, fg: colors.textOnBrand },
  { title: 'Reserva para imprevistos', subtitle: 'Em breve', bg: colors.surface, fg: colors.text },
];

export default function AprenderScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <TopInset color={colors.background} />
      <Screen contentStyle={{ padding: space[6], gap: space[4] }}>
        <Txt variant="title" style={{ fontSize: 24 }}>Aprender</Txt>
        <Txt color={colors.textSecondary}>Explicações curtas e opcionais, ligadas ao que você está fazendo.</Txt>
        {ITEMS.map((it) => (
          <Pressable
            key={it.title}
            disabled={!it.href}
            accessibilityRole="button"
            accessibilityState={{ disabled: !it.href }}
            onPress={() => it.href && router.push(it.href)}
            style={[styles.item, { backgroundColor: it.bg }]}>
            <View style={{ flex: 1 }}>
              <Txt variant="label" color={it.fg} style={{ fontFamily: fonts.extrabold, fontSize: 17 }}>{it.title}</Txt>
              <Txt variant="caption" color={it.fg}>{it.subtitle}</Txt>
            </View>
            {it.href ? <ArrowUpRight size={20} color={it.fg} /> : null}
          </Pressable>
        ))}
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  item: { borderRadius: radius.lg, padding: space[6], flexDirection: 'row', alignItems: 'center', gap: space[3], borderWidth: 1, borderColor: colors.border },
});
