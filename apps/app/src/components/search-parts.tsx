import { SEARCH_TEXT, isStackedLayout, type CardEntry } from '@clarevo/core';
import { CreditCard, Search } from 'lucide-react-native';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { Money, Txt, clampLines, styles as ui } from '@/components/ui';
import { moneyA11y, useValuesHidden } from '@/lib/privacy';
import { colors, fonts, radius, space } from '@/theme/tokens';

/**
 * Entrada da busca em Movimentos (D-045): a lupa, num botão redondo do tamanho dos filtros, ao lado deles e logo acima da lista do mês
 * (revisão das telas, 16/11/2026: antes era um campo no topo da tela). Abre a tela de consulta (`/movimentacoes/buscar`); nada é
 * digitado nem guardado aqui. O nome acessível diz "Buscar" e que a busca é em todos os meses.
 */
export function SearchEntry({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={SEARCH_TEXT.entryA11y}
      onPress={onPress}
      style={(s) => [styles.entry, s.pressed && { opacity: 0.7 }, (s as { focused?: boolean }).focused && ui.focusRing]}>
      <Search size={20} color={colors.text} strokeWidth={2.25} aria-hidden />
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
  const stacked = isStackedLayout(width, fontScale);
  const caption = SEARCH_TEXT.purchaseCaption(entry.purchasedOn ?? '', cardName, entry.installments, entry.installmentOffset ?? 0);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={SEARCH_TEXT.purchaseA11y(entry.description ?? '', caption, moneyA11y(entry.amountCents, hidden))}
      style={(s) => [
        styles.row,
        !last && styles.divider,
        s.pressed && { opacity: 0.7 },
        (s as { focused?: boolean }).focused && { outlineWidth: 3, outlineColor: colors.brandText, outlineStyle: 'solid' },
      ]}>
      <View style={styles.icon}>
        <CreditCard size={18} color={colors.brandText} aria-hidden />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant="label" style={{ fontFamily: fonts.bold, fontSize: 15 }} numberOfLines={clampLines(2)}>
          {entry.description}
        </Txt>
        <Txt variant="caption" color={colors.textSecondary}>
          {caption}
        </Txt>
        {stacked ? <Money cents={entry.amountCents} variant="label" style={styles.amount} /> : null}
      </View>
      {stacked ? null : <Money cents={entry.amountCents} variant="label" style={[styles.amount, { flexShrink: 0 }]} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  entry: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: space[3], minHeight: 56 },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  amount: { fontFamily: fonts.bold, fontSize: 15 },
  icon: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: colors.brandTint, alignItems: 'center', justifyContent: 'center' },
});
