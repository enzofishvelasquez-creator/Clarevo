import { Users } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { Logo, Txt } from '@/components/ui';
import { useFinance } from '@/state/finance';
import { colors, fonts, radius, space } from '@/theme/tokens';

/** Cabeçalho azul com logo, avatar e seletor de contexto sempre visível (CL-V002). */
export function BrandHeader({ initials = 'MA' }: { initials?: string }) {
  return (
    <View style={styles.top}>
      <Logo />
      <View style={styles.avatar} accessibilityLabel="Conta">
        <Txt variant="label" color={colors.brand} style={{ fontFamily: fonts.extrabold }}>
          {initials}
        </Txt>
      </View>
    </View>
  );
}

export function ContextSwitch() {
  const { contexts, activeContext, setActiveContext } = useFinance();
  return (
    <View style={styles.track} accessibilityRole="tablist" accessibilityLabel="Contexto financeiro">
      {contexts.map((c) => {
        const selected = c.id === activeContext.id;
        return (
          <Pressable
            key={c.id}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={`Ver dados de ${c.name}`}
            onPress={() => setActiveContext(c.id)}
            style={[styles.option, selected && styles.optionSelected]}>
            {c.kind === 'familia' ? <Users size={18} color={selected ? colors.brand : colors.textOnBrand} /> : null}
            <Txt variant="label" color={selected ? colors.brand : colors.textOnBrand} style={{ fontFamily: fonts.bold, fontSize: 16 }}>
              {c.name}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space[5] },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  track: { flexDirection: 'row', backgroundColor: colors.brandDeep, borderRadius: radius.md, padding: 4 },
  option: {
    flex: 1,
    minHeight: 52,
    borderRadius: 13,
    flexDirection: 'row',
    gap: space[2],
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionSelected: { backgroundColor: colors.surface },
});
