import { BUDGET_TEXT, formatBRL, goalProgress, organizeGoals, type IsoMonth } from '@clarevo/core';
import { router } from 'expo-router';
import { ChevronRight, Flag, PieChart } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { GoalProgress } from '@/components/goal-progress';
import { MoneyTxt } from '@/components/money-text';
import { Card, IconBlock, LinkButton, Skeleton, Txt } from '@/components/ui';
import { useGoals, useMonthBudget } from '@/state/data';
import { colors, space } from '@/theme/tokens';

/**
 * Os cartões da coluna da direita do Resumo na versão para computador (pedido do Enzo em 12/11/2026): as metas, com o caminho de cada
 * uma, e o orçamento do mês, com a categoria mais perto do limite. Só leem o que o app já guarda; os valores seguem "ocultar valores".
 */

/** Até três metas (a reserva primeiro), com a barra do caminho e o atalho para a aba Metas. */
export function GoalsPanel({ contextId }: { contextId: string | undefined }) {
  const goals = useGoals(contextId);
  const list = goals.data ? organizeGoals(goals.data) : null;
  const shown = list ? [...(list.reserve ? [list.reserve] : []), ...list.active].slice(0, 3) : [];
  return (
    <Card style={{ gap: space[3] }}>
      <View style={styles.head}>
        <IconBlock icon={Flag} lime size={36} />
        <Txt variant="title" accessibilityRole="header" aria-level={2} style={{ flex: 1 }}>
          Metas
        </Txt>
      </View>
      {goals.isPending ? (
        <Skeleton width="100%" height={56} />
      ) : shown.length === 0 ? (
        <Txt color={colors.textSecondary}>Nenhuma meta ainda. Crie uma para acompanhar o quanto já guardou.</Txt>
      ) : (
        shown.map((g) => {
          const p = goalProgress(g.savedCents, g.targetCents);
          const amounts = `${formatBRL(g.savedCents)} de ${formatBRL(g.targetCents)}`;
          return (
            <View key={g.id} style={{ gap: space[1] }}>
              <View style={styles.row}>
                <Txt variant="label" style={{ flex: 1 }} numberOfLines={1}>
                  {g.name}
                </Txt>
                <Txt variant="label" color={colors.textSecondary}>
                  {`${p.percent}%`}
                </Txt>
              </View>
              <GoalProgress percent={p.barPercent} label={`${g.name}: ${p.percent}% da meta, ${amounts}.`} valueText={`${amounts}, ${p.percent}%`} />
              <MoneyTxt variant="caption" color={colors.textSecondary}>
                {amounts}
              </MoneyTxt>
            </View>
          );
        })
      )}
      <LinkButton label={shown.length === 0 ? 'Criar uma meta' : 'Ver metas'} trailing={ChevronRight} onPress={() => router.navigate(shown.length === 0 ? '/meta/nova' : '/metas')} style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }} />
    </Card>
  );
}

/** O orçamento do mês: o total e a categoria mais perto do limite, com o atalho para a tela do orçamento. */
export function BudgetPanel({ contextId, month }: { contextId: string | undefined; month: IsoMonth }) {
  const budget = useMonthBudget(contextId, month);
  const s = budget.summary;
  return (
    <Card style={{ gap: space[3] }}>
      <View style={styles.head}>
        <IconBlock icon={PieChart} size={36} />
        <Txt variant="title" accessibilityRole="header" aria-level={2} style={{ flex: 1 }}>
          {BUDGET_TEXT.title}
        </Txt>
      </View>
      {budget.isPending ? (
        <Skeleton width="100%" height={56} />
      ) : !s || !s.hasAny ? (
        <Txt color={colors.textSecondary}>{BUDGET_TEXT.noneYet}</Txt>
      ) : (
        <>
          {s.totalLine ? <MoneyTxt variant="label">{s.totalLine}</MoneyTxt> : null}
          {s.nearest ? (
            <View style={{ gap: space[1] }}>
              <View style={styles.row}>
                <Txt variant="label" style={{ flex: 1 }} numberOfLines={1}>
                  {s.nearest.category}
                </Txt>
                <Txt variant="label" color={colors.textSecondary}>
                  {s.nearest.percentText}
                </Txt>
              </View>
              <GoalProgress percent={Math.min(100, s.nearest.barTenths / 10)} label={s.nearest.a11yLabel} valueText={s.nearest.percentText} />
              <MoneyTxt variant="caption" color={colors.textSecondary}>
                {s.nearest.balanceLine}
              </MoneyTxt>
            </View>
          ) : null}
        </>
      )}
      <LinkButton label="Ver o orçamento" trailing={ChevronRight} onPress={() => router.push('/orcamento')} style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }} />
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
});
