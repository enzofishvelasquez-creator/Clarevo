import { SEU_MES_TEXT, type SeuMesAction, type SeuMesCard, type SeuMesRow } from '@clarevo/core';
import { ChevronRight, Timer } from 'lucide-react-native';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { MoneyTxt } from '@/components/money-text';
import { Card, LinkButton, Txt, styles as ui } from '@/components/ui';
import { colors, fonts, space, tabular } from '@/theme/tokens';

/**
 * Linha "Seu mês em 30 segundos" em Movimentos (D-052), logo abaixo de "Buscar": parece um campo, mas é um botão que abre a tela de
 * consulta `/seu-mes`. Nada é lido nem guardado aqui.
 */
export function SeuMesEntry({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={SEU_MES_TEXT.rowA11y}
      onPress={onPress}
      style={(s) => [ui.input, styles.entry, s.pressed && { opacity: 0.7 }, (s as { focused?: boolean }).focused && ui.focusRing]}>
      <Timer size={20} color={colors.textSecondary} aria-hidden />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant="label" style={{ fontFamily: fonts.bold, fontSize: 15 }}>
          {SEU_MES_TEXT.title}
        </Txt>
        <Txt variant="caption" color={colors.textSecondary}>
          {SEU_MES_TEXT.rowCaption}
        </Txt>
      </View>
      <ChevronRight size={20} color={colors.textSecondary} aria-hidden />
    </Pressable>
  );
}

/**
 * Uma linha de um cartão: o nome, os detalhes (percentual, comparação com o mês anterior, vencimento) e o valor. Em telas estreitas
 * ou com letra grande, o valor desce para baixo do nome. Os valores em reais respeitam "Ocultar valores" (R$ •••• e "valor oculto").
 */
function RowView({ row }: { row: SeuMesRow }) {
  const { width, fontScale } = useWindowDimensions();
  const stacked = width < 360 || fontScale > 1.3;
  const value = row.value ? (
    <MoneyTxt variant="label" style={[tabular, styles.value, row.strong && styles.valueStrong, stacked ? null : { flexShrink: 0 }]}>
      {row.value}
    </MoneyTxt>
  ) : null;
  return (
    <View style={styles.row}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant="label" style={{ fontFamily: fonts.bold, fontSize: 15 }}>
          {row.label}
        </Txt>
        {row.details.map((detail, n) => (
          <MoneyTxt key={`${n}-${detail}`} variant="caption" color={colors.textSecondary}>
            {detail}
          </MoneyTxt>
        ))}
        {stacked ? value : null}
      </View>
      {stacked ? null : value}
    </View>
  );
}

/** O cartão do mês: título (nível 2), uma frase, as linhas, as notas e o link para a tela de onde os números vêm. */
export function SeuMesCardView({ card, onAction }: { card: SeuMesCard; onAction: (action: SeuMesAction) => void }) {
  return (
    <Card style={{ gap: space[3] }}>
      <Txt variant="title" accessibilityRole="header" aria-level={2}>
        {card.title}
      </Txt>
      {card.intro ? (
        <Txt color={colors.textSecondary}>{card.intro}</Txt>
      ) : null}
      {card.rows.length > 0 ? (
        <View>
          {card.rows.map((row, i) => (
            <View key={`${row.label}-${i}`} style={i < card.rows.length - 1 ? styles.divider : undefined}>
              <RowView row={row} />
            </View>
          ))}
        </View>
      ) : null}
      {card.notes.map((note) => (
        <Txt key={note} variant="caption" color={colors.textSecondary}>
          {note}
        </Txt>
      ))}
      {card.action ? (
        <LinkButton label={card.action.label} trailing={ChevronRight} style={styles.link} onPress={() => onAction(card.action!)} />
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  entry: { gap: space[3], paddingVertical: space[2] },
  row: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', columnGap: space[3], paddingVertical: space[3] },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  value: { fontFamily: fonts.bold, fontSize: 16 },
  valueStrong: { fontFamily: fonts.extrabold, fontSize: 18 },
  link: { alignSelf: 'flex-start', paddingHorizontal: 0 },
});
