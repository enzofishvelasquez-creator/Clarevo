import { router } from 'expo-router';
import { Plus, Trash2 } from 'lucide-react-native';
import { Alert, Platform, Pressable, StyleSheet, View } from 'react-native';

import { ContextSwitch } from '@/components/header';
import { Card, EventRow, PrimaryButton, Screen, TopInset, Txt } from '@/components/ui';
import { monthLabel, useFinance } from '@/state/finance';
import { colors, radius, space } from '@/theme/tokens';

export default function MovimentosScreen() {
  const { events, activeContext, month, removeEvent } = useFinance();
  const list = events
    .filter((e) => e.contextId === activeContext.id && !e.deletedAt)
    .slice()
    .sort((a, b) => (b.settledOn ?? b.dueOn ?? '').localeCompare(a.settledOn ?? a.dueOn ?? ''));

  const confirmRemove = (id: string, name: string) => {
    const msg = `Excluir “${name}”? O resumo deixa de considerar este registro.`;
    if (Platform.OS === 'web') {
      if (globalThis.confirm?.(msg)) removeEvent(id);
      return;
    }
    Alert.alert('Excluir registro', msg, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Excluir', style: 'destructive', onPress: () => removeEvent(id) },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <TopInset color={colors.brand} />
      <Screen>
        <View style={styles.head}>
          <Txt variant="title" color={colors.textOnBrand} style={{ fontSize: 24, marginBottom: space[4] }}>
            Movimentos
          </Txt>
          <ContextSwitch />
        </View>
        <View style={{ padding: space[6], gap: space[4] }}>
          <Txt variant="label" color={colors.textSecondary}>{monthLabel(month)} · {activeContext.name}</Txt>
          <PrimaryButton label="Anotar gasto" icon={Plus} onPress={() => router.push('/anotar')} />
          <Card>
            {list.length === 0 ? (
              <Txt color={colors.textSecondary}>Nenhum registro neste contexto.</Txt>
            ) : (
              list.map((e) => (
                <View key={e.id} style={styles.item}>
                  <View style={{ flex: 1 }}>
                    <EventRow event={e} />
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Excluir ${e.description}`}
                    onPress={() => confirmRemove(e.id, e.description)}
                    hitSlop={8}
                    style={styles.trash}>
                    <Trash2 size={18} color={colors.textSecondary} />
                  </Pressable>
                </View>
              ))
            )}
          </Card>
        </View>
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  head: {
    backgroundColor: colors.brand,
    padding: space[6],
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
  },
  item: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  trash: { padding: space[2] },
});
