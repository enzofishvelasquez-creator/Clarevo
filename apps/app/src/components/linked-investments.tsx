import { INVESTMENT_GOAL_TEXT, formatBRL, linkedInvestmentsSummary, type Goal } from '@clarevo/core';
import { router } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { MoneyTxt, useMoneyLabelMask } from '@/components/money-text';
import { Card, Txt, styles as ui } from '@/components/ui';
import { useInvestments, useSpace } from '@/state/data';
import { useSession } from '@/state/session';
import { colors, fonts, space, tabular } from '@/theme/tokens';

const T = INVESTMENT_GOAL_TEXT;

/**
 * Investimentos ligados à reserva ou à meta (D-099, item 13, fase 1): o valor de hoje dos ativos ligados e, na reserva, quanto tem resgate
 * em até 1 dia pela ficha. Só informação: o valor guardado da meta continua o que a pessoa registra nela. Some sem nenhum ligado e fora
 * do Pessoal (investimentos só existem no Pessoal).
 */
export function LinkedInvestmentsCard({ goal }: { goal: Goal }) {
  const { today } = useSession();
  const space_ = useSpace();
  const personal = space_.data?.personalContextId === goal.contextId;
  const list = useInvestments(personal ? goal.contextId : undefined);
  const maskLabel = useMoneyLabelMask();
  const summary = list.data ? linkedInvestmentsSummary(goal.id, list.data, today) : null;
  if (!summary) return null;
  const reserve = goal.goalType === 'emergencia';
  return (
    <Card style={{ gap: space[2] }}>
      <Txt variant="title" accessibilityRole="header" aria-level={2}>
        {reserve ? T.reserveTitle : T.goalTitle}
      </Txt>
      <MoneyTxt>{T.totalLine(summary.valueCents, summary.items.length)}</MoneyTxt>
      {reserve ? <MoneyTxt>{T.quickLine(summary.quickCents)}</MoneyTxt> : null}
      {reserve && summary.unknownLiquidity > 0 ? (
        <Txt variant="caption" color={colors.textSecondary}>
          {T.unknownLine(summary.unknownLiquidity)}
        </Txt>
      ) : null}
      <View>
        {summary.items.map((i, n) => (
          <Pressable
            key={i.id}
            accessibilityRole="link"
            accessibilityLabel={maskLabel(`${i.name}, ${formatBRL(i.valueCents)}`)}
            accessibilityHint="Abre o investimento"
            onPress={() => router.push({ pathname: '/investimento/[id]', params: { id: i.id } })}
            style={(st) => [styles.row, n > 0 && styles.divider, st.pressed && { opacity: 0.7 }, (st as { focused?: boolean }).focused && ui.focusRing]}>
            <Txt variant="label" style={{ flex: 1, fontFamily: fonts.bold }} numberOfLines={2}>
              {i.name}
            </Txt>
            <MoneyTxt variant="label" style={tabular}>
              {formatBRL(i.valueCents)}
            </MoneyTxt>
            <ChevronRight size={18} color={colors.textSecondary} aria-hidden />
          </Pressable>
        ))}
      </View>
      <Txt variant="caption" color={colors.textSecondary}>
        {T.note}
      </Txt>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: 48, paddingVertical: space[2] },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});
