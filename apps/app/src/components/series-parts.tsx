import { annualLastYearHint, formatMonthName, formatMonthYearBR, monthOf, type Cents, type IsoDate, type IsoMonth, type SeriesKind } from '@clarevo/core';
import { Check } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { spaceKeyPress, Txt } from '@/components/ui';
import { maskMoneyText, moneyA11y, moneyText, spokenText, useValuesHidden } from '@/lib/privacy';
import { yearA11y, yearA11yLabel } from '@/lib/years';
import { colors, fonts, radius, space } from '@/theme/tokens';

/** Nome da série sem artigo: "gasto fixo", "parcelamento", "conta do ano". */
export const SERIES_NOUN: Record<SeriesKind, string> = { mensal: 'gasto fixo', parcelada: 'parcelamento', anual: 'conta do ano' };

/** Com preposição e artigo: "do gasto fixo", "do parcelamento", "da conta do ano". */
export const ofSeries = (kind: SeriesKind) => (kind === 'anual' ? 'da conta do ano' : `do ${SERIES_NOUN[kind]}`);

/** "pelo gasto fixo", "pelo parcelamento", "pela conta do ano". */
export const bySeries = (kind: SeriesKind) => (kind === 'anual' ? 'pela conta do ano' : `pelo ${SERIES_NOUN[kind]}`);

/** Chips de mês da conta do ano: rótulo curto na tela e nome completo no leitor de tela. */
export const MONTH_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'] as const;
export const MONTH_FULL = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
] as const;

/** "2026/2027" lido como "2026 a 2027" (lib/years.ts, também usado pelos campos de texto de ui.tsx). */
export { yearA11y, yearA11yLabel };

/**
 * Dica do campo "Último ano (AAAA)" de uma conta do ano que atravessa dezembro (como novembro a fevereiro): o ano digitado
 * é o do começo do período, como nos rótulos "2026/2027". null quando o período cabe num ano só.
 * month: mês da 1ª parcela do ano (1 a 12); k: parcelas por ano; example: ano do exemplo.
 */
export function lastYearHint(month: number, k: number, example: number): string | null {
  // Mesmo texto que o core acrescenta ao erro fim_invalido do último ano.
  return annualLastYearHint(k, month, example);
}

/** "outubro" → "Outubro". */
export const cap = (text: string) => (text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : text);

/** "a", "a e b", "a, b e c". */
export function joinList(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`;
}

/** "Novembro" no ano de hoje; "Janeiro de 2027" em outro ano. */
export function monthChipLabel(month: IsoMonth, today: IsoDate): string {
  return month.slice(0, 4) === today.slice(0, 4) ? cap(formatMonthName(month)) : cap(formatMonthYearBR(month));
}

/**
 * Valor estimado com o sinal "≈" na tela e "cerca de" no leitor de tela (nunca só o símbolo). Com valores ocultos
 * (hidden, de useValuesHidden), "R$ ••••" na tela e "valor oculto" no leitor de tela.
 */
export function estimateText(cents: Cents, estimate: boolean, hidden = false): { text: string; a11y: string } {
  const money = moneyText(cents, hidden);
  const spoken = moneyA11y(cents, hidden);
  return estimate ? { text: `≈ ${money}`, a11y: `cerca de ${spoken}` } : { text: money, a11y: spoken };
}

/** Mês de uma conta, para listas do detalhe: "Outubro" ou "Janeiro de 2027". */
export function occurrenceMonthLabel(dueOn: IsoDate, today: IsoDate): string {
  return monthChipLabel(monthOf(dueOn), today);
}

/**
 * Grupo de escolha (chips como rádio) com rótulo, dica e erro ligados ao grupo.
 * O erro é anunciado ao aparecer, como nos campos de texto.
 */
export function ChoiceGroup({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <View style={{ gap: space[2] }}>
      <Txt variant="label" style={{ fontFamily: fonts.bold }}>
        {label}
      </Txt>
      {hint ? (
        <Txt variant="caption" color={colors.textSecondary}>
          {hint}
        </Txt>
      ) : null}
      <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel={yearA11y(label)}>
        {children}
      </View>
      {error ? (
        <Txt variant="label" color={colors.error} accessibilityLiveRegion="polite" accessibilityRole="alert">
          {error}
        </Txt>
      ) : null}
    </View>
  );
}

/**
 * Opção que se marca e desmarca (caixa de seleção), com texto de apoio. Alvo de 44 px e foco visível. O rótulo e o
 * apoio podem trazer valores em reais ("Venceu em 12/02/2027 · R$ 180,00"): com "Ocultar valores" (lib/privacy.ts),
 * aparecem como "R$ ••••" e o leitor de tela diz "valor oculto".
 */
export function CheckOption({ label, hint, checked, onPress }: { label: string; hint?: string; checked: boolean; onPress: () => void }) {
  const hidden = useValuesHidden();
  const spokenLabel = spokenText(label, hidden);
  const spokenHint = hint === undefined ? undefined : spokenText(hint, hidden);
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      aria-checked={checked}
      accessibilityLabel={spokenLabel}
      accessibilityHint={hint === undefined ? undefined : yearA11y(spokenHint ?? hint)}
      onPress={onPress}
      {...spaceKeyPress(onPress)}
      style={(st) => [styles.check, (st as { focused?: boolean }).focused && styles.focusRing]}>
      <View style={[styles.box, checked && styles.boxChecked]}>{checked ? <Check size={16} color={colors.textOnBrand} strokeWidth={3} /> : null}</View>
      {/* Na web, o nome da caixa vem do texto (rótulo e dica): cada parte com "2026/2027" leva o nome falado. */}
      <View style={{ flex: 1, gap: 2 }}>
        <Txt variant="label" style={{ fontFamily: fonts.bold }} accessibilityLabel={spokenLabel}>
          {maskMoneyText(label, hidden)}
        </Txt>
        {hint ? (
          <Txt variant="caption" color={colors.textSecondary} accessibilityLabel={spokenHint}>
            {maskMoneyText(hint, hidden)}
          </Txt>
        ) : null}
      </View>
    </Pressable>
  );
}

/**
 * Barra "12 de 48 pagas": preenchimento azul sobre o trilho claro contornado (4.2). Um único rótulo com a frase
 * completa; o desenho fica oculto para leitores de tela.
 */
export function InstallmentBar({ paid, total }: { paid: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.max(0, (paid / total) * 100)) : 0;
  const text = `${paid} de ${total} pagas`;
  return (
    <View
      style={{ gap: space[1] }}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={text}
      accessibilityValue={{ min: 0, max: total, now: paid, text }}>
      <View style={styles.track} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <View style={[styles.fill, { width: `${pct}%` }]} />
      </View>
      <Txt variant="caption" color={colors.textSecondary}>
        {text}
      </Txt>
    </View>
  );
}

export const seriesStyles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  /** Grade de meses: 4 por linha; abaixo de cerca de 300 px de largura útil, 3 por linha (nenhum rótulo cortado). */
  monthChip: { flexBasis: '22%', flexGrow: 1, minWidth: 64 },
  inlineLink: { alignSelf: 'flex-start', paddingHorizontal: 0 },
  footer: { backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space[3], paddingHorizontal: space[5] },
  footerInner: { width: '100%', maxWidth: 560, alignSelf: 'center', gap: space[3] },
  footerRow: { flexDirection: 'row', gap: space[3], alignItems: 'center' },
  cancel: { alignSelf: 'auto', flexGrow: 0 },
  save: { alignSelf: 'auto', flex: 1 },
});

const styles = StyleSheet.create({
  chips: seriesStyles.chips,
  track: { height: 8, borderRadius: 4, backgroundColor: colors.brandTint, borderWidth: 1, borderColor: colors.borderStrong, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.brand, borderRadius: radius.sm },
  check: { flexDirection: 'row', alignItems: 'flex-start', gap: space[3], minHeight: 44, paddingVertical: space[2], borderRadius: radius.sm },
  box: {
    width: 24,
    height: 24,
    marginTop: 2,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxChecked: { backgroundColor: colors.brand, borderColor: colors.brand },
  focusRing: { outlineWidth: 3, outlineStyle: 'solid', outlineColor: colors.brand, outlineOffset: 2 },
});
