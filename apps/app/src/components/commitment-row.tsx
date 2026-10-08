import { commitmentSituation, dueText, formatBRL, formatMonthBR, monthOf, type Commitment, type IsoDate } from '@clarevo/core';
import { AlertCircle, CalendarClock, Check } from 'lucide-react-native';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { Money, Txt } from '@/components/ui';
import { colors, fonts, radius, space } from '@/theme/tokens';

/** Ícone e cores de cada situação. O texto da situação sempre acompanha o ícone (nunca só a cor). */
export const SITUATION_LOOK = {
  a_vencer: { Icon: CalendarClock, fg: colors.brand, bg: colors.brandTint, label: 'A vencer' },
  vence_hoje: { Icon: CalendarClock, fg: colors.brand, bg: colors.brandTint, label: 'Vence hoje' },
  vencida: { Icon: AlertCircle, fg: colors.error, bg: colors.errorTint, label: 'Vencida' },
  paga: { Icon: Check, fg: colors.successText, bg: colors.successTint, label: 'Paga' },
} as const;

/** Linha de conta a pagar: abre o detalhe; nenhuma ação aninhada. */
export function CommitmentRow({ commitment: c, today, onPress, last }: { commitment: Commitment; today: IsoDate; onPress: () => void; last?: boolean }) {
  const { width, fontScale } = useWindowDimensions();
  const stacked = width < 360 || fontScale > 1.3;
  const situation = commitmentSituation(c, today);
  const look = SITUATION_LOOK[situation];
  const due = dueText(c, today);
  const paid = situation === 'paga' ? c.payment : null;
  const cents = paid ? paid.amountCents : c.amountCents;
  // Paga em outro mês: o gasto conta em Pago do mês da data do pagamento, não do vencimento.
  const paidMonth = paid && monthOf(paid.paidOn) !== monthOf(c.dueOn) ? formatMonthBR(monthOf(paid.paidOn)).toLowerCase() : null;
  const caption = paidMonth ? `${due} · conta em Pago de ${paidMonth}` : due;
  const previsto = paid && paid.amountCents !== c.amountCents ? `Previsto ${formatBRL(c.amountCents)}` : null;
  const label =
    `${c.description}, ${due.charAt(0).toLowerCase()}${due.slice(1)}, ${formatBRL(cents)}` +
    (paidMonth ? `, conta em Pago de ${paidMonth}` : '') +
    (previsto ? `, ${previsto.toLowerCase()}` : '');

  const amount = (
    <View style={stacked ? undefined : styles.amountCol}>
      <Money cents={cents} variant="label" style={styles.amount} />
      {previsto ? (
        <Txt variant="caption" color={colors.textSecondary}>
          {previsto}
        </Txt>
      ) : null}
    </View>
  );

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Abre a conta a pagar"
      style={(s) => [
        styles.row,
        !last && styles.divider,
        s.pressed && { opacity: 0.7 },
        (s as { focused?: boolean }).focused && { outlineWidth: 3, outlineColor: colors.brand, outlineStyle: 'solid' },
      ]}>
      <View style={[styles.icon, { backgroundColor: look.bg }]}>
        <look.Icon size={18} color={situation === 'paga' ? colors.success : look.fg} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant="label" style={{ fontFamily: fonts.bold, fontSize: 15 }} numberOfLines={2}>
          {c.description}
        </Txt>
        <Txt
          variant="caption"
          color={situation === 'vencida' ? colors.error : colors.textSecondary}
          style={situation === 'vence_hoje' ? { fontFamily: fonts.bold } : undefined}>
          {caption}
        </Txt>
        {stacked ? amount : null}
      </View>
      {stacked ? null : amount}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: space[3], minHeight: 56 },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  amountCol: { flexShrink: 0, alignItems: 'flex-end' },
  amount: { fontFamily: fonts.bold, fontSize: 15 },
  icon: { width: 40, height: 40, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
});
