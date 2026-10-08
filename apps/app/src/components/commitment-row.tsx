import {
  commitmentSituation,
  dueText,
  formatBRL,
  formatMonthBR,
  monthOf,
  occurrenceLabel,
  type AnnualGroup,
  type Commitment,
  type IsoDate,
} from '@clarevo/core';
import { AlertCircle, CalendarClock, CalendarRange, Check } from 'lucide-react-native';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { Txt } from '@/components/ui';
import { colors, fonts, radius, space, tabular } from '@/theme/tokens';

/** Ícone e cores de cada situação. O texto da situação sempre acompanha o ícone (nunca só a cor). */
export const SITUATION_LOOK = {
  a_vencer: { Icon: CalendarClock, fg: colors.brand, bg: colors.brandTint, label: 'A vencer' },
  vence_hoje: { Icon: CalendarClock, fg: colors.brand, bg: colors.brandTint, label: 'Vence hoje' },
  vencida: { Icon: AlertCircle, fg: colors.error, bg: colors.errorTint, label: 'Vencida' },
  paga: { Icon: Check, fg: colors.successText, bg: colors.successTint, label: 'Paga' },
} as const;

/**
 * Linha de conta a pagar: abre o detalhe; nenhuma ação aninhada. Conta de gasto fixo leva o rótulo em texto
 * ("Todo mês", "Parcela 13 de 48") e, com valor estimado, "≈" no valor e "estimado" na legenda (nunca só a cor).
 */
export function CommitmentRow({ commitment: c, today, onPress, last }: { commitment: Commitment; today: IsoDate; onPress: () => void; last?: boolean }) {
  const { width, fontScale } = useWindowDimensions();
  const stacked = width < 360 || fontScale > 1.3;
  const situation = commitmentSituation(c, today);
  const look = SITUATION_LOOK[situation];
  const due = dueText(c, today);
  const paid = situation === 'paga' ? c.payment : null;
  const cents = paid ? paid.amountCents : c.amountCents;
  // O valor pago é sempre o real; só a conta em aberto pode estar estimada.
  const estimate = !paid && c.amountIsEstimate;
  // Paga em outro mês: o gasto conta em Pago do mês da data do pagamento, não do vencimento.
  const paidMonth = paid && monthOf(paid.paidOn) !== monthOf(c.dueOn) ? formatMonthBR(monthOf(paid.paidOn)).toLowerCase() : null;
  const seriesLabel = occurrenceLabel(c);
  const caption = [due, paidMonth ? `conta em Pago de ${paidMonth}` : null, seriesLabel, estimate ? 'estimado' : null].filter(Boolean).join(' · ');
  const previsto = paid && paid.amountCents !== c.amountCents ? `Previsto ${formatBRL(c.amountCents)}` : null;
  // A descrição e o vencimento abrem o nome acessível (as buscas por linha dependem desse começo).
  const label =
    `${c.description}, ${due.charAt(0).toLowerCase()}${due.slice(1)}, ` +
    (estimate ? `cerca de ${formatBRL(cents)}, valor estimado` : formatBRL(cents)) +
    (paidMonth ? `, conta em Pago de ${paidMonth}` : '') +
    (previsto ? `, ${previsto.toLowerCase()}` : '') +
    (c.series ? seriesA11y(c.series.kind, seriesLabel!) : '');

  const amount = (
    <View style={stacked ? undefined : styles.amountCol}>
      <Txt variant="label" style={[styles.amount, tabular]}>
        {estimate ? `≈ ${formatBRL(cents)}` : formatBRL(cents)}
      </Txt>
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

/** Fim do nome acessível: ", parcela 13 de 48", ", gasto fixo", ", conta do ano de 2027" ou ", parcela 3 de 10 de 2027, conta do ano". */
function seriesA11y(kind: NonNullable<Commitment['series']>['kind'], label: string): string {
  const lower = `${label.charAt(0).toLowerCase()}${label.slice(1)}`.replace(/(\d{4})\/(\d{4})/, '$1 a $2');
  if (kind === 'parcelada') return `, ${lower}`;
  if (kind === 'anual') return lower.startsWith('conta do ano') ? `, ${lower}` : `, ${lower}, conta do ano`;
  return ', gasto fixo';
}

/**
 * Parcelas da mesma conta do ano e do mesmo ano, numa linha só ("IPTU de 2027 · 10 parcelas, de 10/02 a 10/11/2027 ·
 * estimado · ≈ R$ 1.800,00"). O toque abre a conta do ano; um único nome acessível descreve o grupo.
 */
export function AnnualGroupRow({ group: g, onPress, last }: { group: AnnualGroup; onPress: () => void; last?: boolean }) {
  const { width, fontScale } = useWindowDimensions();
  const stacked = width < 360 || fontScale > 1.3;
  const amount = (
    <View style={stacked ? undefined : styles.amountCol}>
      <Txt variant="label" style={[styles.amount, tabular]}>
        {g.approximate ? `≈ ${formatBRL(g.totalCents)}` : formatBRL(g.totalCents)}
      </Txt>
    </View>
  );
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={g.a11yLabel}
      accessibilityHint="Abre a conta do ano"
      style={(s) => [
        styles.row,
        !last && styles.divider,
        s.pressed && { opacity: 0.7 },
        (s as { focused?: boolean }).focused && { outlineWidth: 3, outlineColor: colors.brand, outlineStyle: 'solid' },
      ]}>
      <View style={[styles.icon, { backgroundColor: colors.brandTint }]}>
        <CalendarRange size={18} color={colors.brand} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant="label" style={{ fontFamily: fonts.bold, fontSize: 15 }} numberOfLines={2}>
          {g.title}
        </Txt>
        <Txt variant="caption" color={colors.textSecondary}>
          {g.caption}
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
