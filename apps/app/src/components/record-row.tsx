import { CARDS_TEXT, formatDateBR, type FinancialRecord } from '@clarevo/core';
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react-native';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { Money, Txt } from '@/components/ui';
import { moneyA11y, useValuesHidden } from '@/lib/privacy';
import { colors, fonts, radius, space } from '@/theme/tokens';

export function kindLabel(r: Pick<FinancialRecord, 'kind'>) {
  return r.kind === 'despesa' ? 'Pago' : 'Recebido';
}

/**
 * Linha de registro. accountName (D-043): a conta de origem, só quando há mais de uma conta ativa ("Pago · 06/10/2026 · Carteira").
 */
export function RecordRow({
  record,
  onPress,
  last,
  accountName,
}: {
  record: FinancialRecord;
  onPress?: () => void;
  last?: boolean;
  accountName?: string | null;
}) {
  const { width, fontScale } = useWindowDimensions();
  const hidden = useValuesHidden();
  const stacked = width < 360 || fontScale > 1.3;
  const isIn = record.kind === 'receita';
  const Icon = isIn ? ArrowDownLeft : ArrowUpRight;
  // Gasto gerado ao marcar uma conta a pagar como paga: a origem aparece na legenda.
  // Pagamento de fatura de cartão: a origem é a fatura (D-037), não uma conta a pagar comum.
  const origin = record.invoice ? ` · ${CARDS_TEXT.paymentOrigin}` : record.commitmentId ? ' · conta a pagar' : '';
  const when = `${kindLabel(record)} · ${formatDateBR(record.occurredOn)}${origin}${accountName ? ` · ${accountName}` : ''}`;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${record.description}, ${when}, ${moneyA11y(record.amountCents, hidden)}`}
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
