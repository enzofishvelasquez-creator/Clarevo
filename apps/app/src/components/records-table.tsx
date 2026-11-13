import { CARDS_TEXT, NEXT_MONTH_TEXT, formatDateBR, recordMonth, type FinancialRecord } from '@clarevo/core';
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { kindLabel } from '@/components/record-row';
import { Money, Txt } from '@/components/ui';
import { moneyA11y, useValuesHidden } from '@/lib/privacy';
import { colors, fonts, radius, space } from '@/theme/tokens';

/**
 * A lista do mês em tabela, na versão para computador (pedido do Enzo em 12/11/2026): data, descrição, categoria, conta (com 2 ou mais
 * contas ativas) e valor, uma linha por lançamento, do mais recente para o mais antigo. Cada linha é um botão com o mesmo nome acessível
 * da linha do celular (`RecordRow`); o cabeçalho da tabela é só visual. Os valores seguem "ocultar valores".
 */
export function RecordsTable({
  records,
  accountName,
  onOpen,
}: {
  records: readonly FinancialRecord[];
  /** A conta de origem do lançamento, ou null (com uma conta só, a coluna não aparece). */
  accountName: ((r: FinancialRecord) => string | null) | null;
  onOpen: (r: FinancialRecord) => void;
}) {
  const hidden = useValuesHidden();
  const showAccount = accountName !== null;
  return (
    <View>
      <View style={[styles.row, styles.head]} aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Txt variant="caption" color={colors.textSecondary} style={[styles.date, styles.headText]}>
          Data
        </Txt>
        <Txt variant="caption" color={colors.textSecondary} style={[styles.desc, styles.headText]}>
          Descrição
        </Txt>
        <Txt variant="caption" color={colors.textSecondary} style={[styles.cat, styles.headText]} numberOfLines={1}>
          Categoria
        </Txt>
        {showAccount ? (
          <Txt variant="caption" color={colors.textSecondary} style={[styles.acc, styles.headText]} numberOfLines={1}>
            Conta
          </Txt>
        ) : null}
        <Txt variant="caption" color={colors.textSecondary} style={[styles.value, styles.headText, { textAlign: 'right' }]}>
          Valor
        </Txt>
      </View>
      {records.map((r, i) => {
        const isIn = r.kind === 'receita';
        const Icon = isIn ? ArrowDownLeft : ArrowUpRight;
        const origin = r.invoice ? CARDS_TEXT.paymentOrigin : r.commitmentId ? 'conta a pagar' : null;
        const counted = r.nextMonth ? NEXT_MONTH_TEXT.rowNote(recordMonth(r)) : null;
        const account = accountName ? accountName(r) : null;
        const note = [kindLabel(r), counted, origin].filter(Boolean).join(' · ');
        const when = `${kindLabel(r)} · ${formatDateBR(r.occurredOn)}${counted ? ` · ${counted}` : ''}${origin ? ` · ${origin}` : ''}${account ? ` · ${account}` : ''}`;
        return (
          <Pressable
            key={r.id}
            accessibilityRole="button"
            accessibilityLabel={`${r.description}, ${when}, ${r.category ?? 'sem categoria'}, ${moneyA11y(r.amountCents, hidden)}`}
            onPress={() => onOpen(r)}
            style={(s) => [
              styles.row,
              i < records.length - 1 && styles.divider,
              (s as { hovered?: boolean }).hovered && { backgroundColor: colors.background },
              s.pressed && { opacity: 0.7 },
              (s as { focused?: boolean }).focused && styles.focusRing,
            ]}>
            <Txt variant="label" color={colors.textSecondary} style={styles.date}>
              {formatDateBR(r.occurredOn).slice(0, 5)}
            </Txt>
            <View style={[styles.desc, styles.descCell]}>
              <View style={[styles.icon, isIn && { backgroundColor: colors.successTint }]}>
                <Icon size={16} color={isIn ? colors.success : colors.brandText} aria-hidden />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                {/* Como na linha do celular: a descrição e a legenda quebram em vez de terminar em "…". */}
                <Txt variant="label" style={{ fontFamily: fonts.bold }}>
                  {r.description}
                </Txt>
                <Txt variant="caption" color={colors.textSecondary}>
                  {note}
                </Txt>
              </View>
            </View>
            <Txt variant="label" color={r.category ? colors.text : colors.textSecondary} style={styles.cat} numberOfLines={1}>
              {r.category ?? 'Sem categoria'}
            </Txt>
            {showAccount ? (
              <Txt variant="label" color={colors.textSecondary} style={styles.acc} numberOfLines={1}>
                {account ?? ''}
              </Txt>
            ) : null}
            <View style={styles.value}>
              <Money cents={r.amountCents} variant="label" style={{ fontFamily: fonts.bold, textAlign: 'right' }} color={isIn ? colors.success : colors.text} />
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space[4], minHeight: 56, paddingVertical: space[2], paddingHorizontal: space[2], borderRadius: radius.sm },
  head: { minHeight: 36, paddingVertical: 0, borderBottomWidth: 1, borderBottomColor: colors.border, borderRadius: 0 },
  headText: { fontFamily: fonts.bold, textTransform: 'uppercase', letterSpacing: 0.2 },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.border, borderRadius: 0 },
  date: { width: 52 },
  desc: { flex: 2, minWidth: 0 },
  descCell: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  cat: { flex: 1.2, minWidth: 96 },
  acc: { flex: 1.2, minWidth: 96 },
  value: { width: 124, alignItems: 'flex-end' },
  icon: { width: 32, height: 32, borderRadius: radius.sm, backgroundColor: colors.brandTint, alignItems: 'center', justifyContent: 'center' },
  focusRing: { outlineWidth: 3, outlineColor: colors.brandText, outlineStyle: 'solid', outlineOffset: -3 } as object,
});
