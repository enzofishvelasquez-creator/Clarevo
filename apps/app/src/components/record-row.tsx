import { BUSINESS_WORDS, CARDS_TEXT, NEXT_MONTH_TEXT, RECORD_LINK_TEXT, formatDateBR, isStackedLayout, recordMonth, type FinancialRecord } from '@clarevo/core';
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react-native';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { Money, Txt, clampLines } from '@/components/ui';
import { moneyA11y, useValuesHidden } from '@/lib/privacy';
import { useBusiness } from '@/state/business';
import { colors, fonts, radius, space } from '@/theme/tokens';

/** "Pago" ou "Recebido"; no espaço Negócio, "Saída" ou "Entrada" (auditoria de 18/11/2026: um vocabulário por espaço). */
export function kindLabel(r: Pick<FinancialRecord, 'kind'>, business = false) {
  if (business) return r.kind === 'despesa' ? BUSINESS_WORDS.outRow : BUSINESS_WORDS.inRow;
  return r.kind === 'despesa' ? 'Pago' : 'Recebido';
}

/** O lançamento é do espaço Negócio da pessoa (para o vocabulário de entradas e saídas). */
export function useIsBusinessRecord(r: Pick<FinancialRecord, 'contextId'>): boolean {
  const business = useBusiness();
  return Boolean(business.data && business.data.id === r.contextId);
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
  const stacked = isStackedLayout(width, fontScale);
  const isIn = record.kind === 'receita';
  const Icon = isIn ? ArrowDownLeft : ArrowUpRight;
  // Gasto gerado ao marcar uma conta a pagar como paga: a origem aparece na legenda.
  // Pagamento de fatura de cartão: a origem é a fatura (D-037), não uma conta a pagar comum.
  const origin = record.invoice ? ` · ${CARDS_TEXT.paymentOrigin}` : record.commitmentId ? ' · conta a pagar' : '';
  // Recebimento marcado do mês seguinte (D-089 A): a data fica, e a legenda diz em que mês conta ("conta em novembro").
  const counted = record.nextMonth ? ` · ${NEXT_MONTH_TEXT.rowNote(recordMonth(record))}` : '';
  // Subcategoria (D-107) e rendimento de investimento: na legenda, depois da data.
  const sub = record.subcategory ? ` · ${record.subcategory}` : '';
  const income = record.investmentId ? ` · ${RECORD_LINK_TEXT.rowIncome}` : '';
  const inBusiness = useIsBusinessRecord(record);
  const when = `${kindLabel(record, inBusiness)} · ${formatDateBR(record.occurredOn)}${counted}${sub}${income}${origin}${accountName ? ` · ${accountName}` : ''}`;
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
        (s as { focused?: boolean }).focused && { outlineWidth: 3, outlineColor: colors.brandText, outlineStyle: 'solid' },
      ]}>
      <View style={[styles.icon, isIn && { backgroundColor: colors.successTint }]}>
        <Icon size={18} color={isIn ? colors.success : colors.brandText} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant="label" style={{ fontFamily: fonts.bold, fontSize: 15 }} numberOfLines={clampLines(2)}>
          {record.description}
        </Txt>
        {/* A legenda quebra em mais de uma linha em vez de terminar em "…": a origem e a conta de origem não ficam escondidas. */}
        <Txt variant="caption" color={colors.textSecondary}>
          {when}
        </Txt>
        {stacked ? (
          <Money cents={record.amountCents} variant="label" style={styles.amount} color={colors.text} />
        ) : null}
      </View>
      {stacked ? null : (
        <Money cents={record.amountCents} variant="label" style={[styles.amount, { flexShrink: 0 }]} color={colors.text} />
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
