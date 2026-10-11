import { SEARCH_TEXT, type CardEntry } from '@clarevo/core';
import { ChevronRight, CreditCard, Search } from 'lucide-react-native';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { Money, Txt, styles as ui } from '@/components/ui';
import { moneyA11y, useValuesHidden } from '@/lib/privacy';
import { colors, fonts, radius, space } from '@/theme/tokens';

/**
 * Entrada da busca em Movimentações (D-045): parece um campo "Buscar" com a lupa, mas é um botão que abre a tela de consulta
 * (`/movimentacoes/buscar`). Nada é digitado nem guardado aqui.
 */
export function SearchEntry({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={SEARCH_TEXT.entryA11y}
      onPress={onPress}
      style={(s) => [ui.input, styles.entry, s.pressed && { opacity: 0.7 }, (s as { focused?: boolean }).focused && ui.focusRing]}>
      <Search size={20} color={colors.textSecondary} aria-hidden />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant="label" style={{ fontFamily: fonts.bold, fontSize: 15 }}>
          {SEARCH_TEXT.entry}
        </Txt>
        <Txt variant="caption" color={colors.textSecondary}>
          {SEARCH_TEXT.entryHint}
        </Txt>
      </View>
      <ChevronRight size={20} color={colors.textSecondary} aria-hidden />
    </Pressable>
  );
}

/**
 * Compra no cartão achada pela busca: descrição, "Compra · 05/10/2026 · Cartão · em 3 vezes" e o valor total da compra (não a
 * parcela de cada mês). Abre a fatura da primeira parcela. Não é gasto: nunca entra em Pago.
 */
export function PurchaseRow({ entry, cardName, last, onPress }: { entry: CardEntry; cardName: string | null; last?: boolean; onPress: () => void }) {
  const { width, fontScale } = useWindowDimensions();
  const hidden = useValuesHidden();
  const stacked = width < 360 || fontScale > 1.3;
  const caption = SEARCH_TEXT.purchaseCaption(entry.purchasedOn ?? '', cardName, entry.installments);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={SEARCH_TEXT.purchaseA11y(entry.description ?? '', caption, moneyA11y(entry.amountCents, hidden))}
      style={(s) => [
        styles.row,
        !last && styles.divider,
        s.pressed && { opacity: 0.7 },
        (s as { focused?: boolean }).focused && { outlineWidth: 3, outlineColor: colors.brand, outlineStyle: 'solid' },
      ]}>
      <View style={styles.icon}>
        <CreditCard size={18} color={colors.brand} aria-hidden />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant="label" style={{ fontFamily: fonts.bold, fontSize: 15 }} numberOfLines={2}>
          {entry.description}
        </Txt>
        <Txt variant="caption" color={colors.textSecondary} numberOfLines={2}>
          {caption}
        </Txt>
        {stacked ? <Money cents={entry.amountCents} variant="label" style={styles.amount} /> : null}
      </View>
      {stacked ? null : <Money cents={entry.amountCents} variant="label" style={[styles.amount, { flexShrink: 0 }]} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  entry: { gap: space[3], paddingVertical: space[2] },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: space[3], minHeight: 56 },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  amount: { fontFamily: fonts.bold, fontSize: 15 },
  icon: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: colors.brandTint, alignItems: 'center', justifyContent: 'center' },
});
