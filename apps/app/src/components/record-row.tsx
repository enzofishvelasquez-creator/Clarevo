import { formatBRL, formatDateBR, type FinancialRecord } from '@clarevo/core';
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react-native';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { Money, Txt } from '@/components/ui';
import { colors, fonts, radius, space } from '@/theme/tokens';

export function kindLabel(r: Pick<FinancialRecord, 'kind'>) {
  return r.kind === 'despesa' ? 'Pago' : 'Recebido';
}

export function RecordRow({ record, onPress, last }: { record: FinancialRecord; onPress?: () => void; last?: boolean }) {
  const { width, fontScale } = useWindowDimensions();
  const stacked = width < 360 || fontScale > 1.3;
  const isIn = record.kind === 'receita';
  const Icon = isIn ? ArrowDownLeft : ArrowUpRight;
  const when = `${kindLabel(record)} · ${formatDateBR(record.occurredOn)}`;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${record.description}, ${when}, ${formatBRL(record.amountCents)}`}
      style={(s) => [
        styles.row,
        !last && styles.divider,
        s.pressed && { opacity: 0.7 },
        (s as { focused?: boolean }).focused && { outlineWidth: 3, outlineColor: colors.brand, outlineStyle: 'solid' },
      ]}>
      <View style={[styles.icon, isIn && { backgroundColor: colors.successTint }]}>
        <Icon size={18} color={isIn ? colors.success : colors.brand} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant="label" style={{ fontFamily: fonts.bold, fontSize: 15 }} numberOfLines={2}>
          {record.description}
        </Txt>
        <Txt variant="caption" color={colors.textSecondary} numberOfLines={1}>
          {when}
        </Txt>
        {stacked ? (
          <Money cents={record.amountCents} variant="label" style={styles.amount} color={isIn ? colors.success : colors.text} />
        ) : null}
      </View>
      {stacked ? null : (
        <Money cents={record.amountCents} variant="label" style={[styles.amount, { flexShrink: 0 }]} color={isIn ? colors.success : colors.text} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: space[3], minHeight: 56 },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  amount: { fontFamily: fonts.bold, fontSize: 15 },
  icon: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: colors.brandTint, alignItems: 'center', justifyContent: 'center' },
});
