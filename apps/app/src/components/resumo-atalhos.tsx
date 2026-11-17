import { SUMMARY_SHORTCUTS_TEXT, analysesParams, calendarMonthParams, investmentsSummaryLine, type IsoMonth } from '@clarevo/core';
import { router } from 'expo-router';
import { CalendarDays, ChartPie, ChevronRight, TrendingUp, type LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card, Txt } from '@/components/ui';
import { maskMoneyLabel, maskMoneyText, useValuesHidden } from '@/lib/privacy';
import { useInvestments } from '@/state/data';
import { colors, fonts, radius, space } from '@/theme/tokens';

/**
 * Atalhos do Resumo (D-105): um cartão sem título, depois de "Pagamentos do mês", com as Análises do mês (retorno do teste de 17/11/2026:
 * "não estou mais achando as análises"), o Calendário do mês e, só no Pessoal e com algum
 * investimento ativo, "Investir" (o valor de hoje e a data das atualizações), que leva a Investir em um toque para ver e
 * atualizar valores. Não muda a ordem dos blocos aprovados nem os títulos da tela. Enquanto os investimentos carregam, ou se a leitura
 * falha, a linha de Investir não aparece (nunca um R$ 0,00). "Ocultar valores" vale para a linha.
 */
export function SummaryShortcuts({ contextId, month, currentMonth, personal }: { contextId: string | undefined; month: IsoMonth; currentMonth: IsoMonth; personal: boolean }) {
  const investments = useInvestments(personal ? contextId : undefined);
  const line = personal && investments.data ? investmentsSummaryLine(investments.data) : null;
  const T = SUMMARY_SHORTCUTS_TEXT;
  return (
    <Card style={styles.card}>
      <Row
        icon={ChartPie}
        title={T.analysesTitle}
        caption={T.analysesCaption}
        last={false}
        onPress={() => router.push({ pathname: '/analises', params: analysesParams(month, currentMonth) })}
      />
      <Row
        icon={CalendarDays}
        title={T.calendarTitle}
        caption={T.calendarCaption(month)}
        last={!line}
        onPress={() => router.push({ pathname: '/calendario', params: calendarMonthParams(month, currentMonth) })}
      />
      {line ? <Row icon={TrendingUp} title={T.investTitle} caption={line.caption} a11y={line.a11y} hint={T.investHint} last onPress={() => router.navigate('/investimentos')} /> : null}
    </Card>
  );
}

function Row({
  icon: Icon,
  title,
  caption,
  a11y,
  hint,
  last,
  onPress,
}: {
  icon: LucideIcon;
  title: string;
  caption: string;
  a11y?: string;
  hint?: string;
  last: boolean;
  onPress: () => void;
}) {
  const hidden = useValuesHidden();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={maskMoneyLabel(a11y ?? `${title}, ${caption}`, hidden)}
      accessibilityHint={hint}
      onPress={onPress}
      style={(st) => [styles.row, !last && styles.divider, st.pressed && { opacity: 0.7 }, (st as { focused?: boolean }).focused && styles.focusRing]}>
      <View style={styles.icon}>
        <Icon size={20} color={colors.brandText} strokeWidth={2.25} aria-hidden />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant="label" style={{ fontFamily: fonts.bold, fontSize: 15 }}>
          {title}
        </Txt>
        <Txt variant="caption" color={colors.textSecondary}>
          {maskMoneyText(caption, hidden)}
        </Txt>
      </View>
      <ChevronRight size={20} color={colors.textSecondary} aria-hidden />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { paddingVertical: space[2] },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: 10, minHeight: 56 },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  icon: { width: 36, height: 36, borderRadius: radius.sm, backgroundColor: colors.brandTint, alignItems: 'center', justifyContent: 'center' },
  focusRing: { outlineWidth: 3, outlineColor: colors.brandText, outlineStyle: 'solid', outlineOffset: 2 } as object,
});
