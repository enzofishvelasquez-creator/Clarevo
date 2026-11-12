import { BUDGET_CELEBRATION_LAST_DAY, BUDGET_CELEBRATION_TEXT, addMonths, budgetClosedWithin, monthOf } from '@clarevo/core';
import { router } from 'expo-router';
import { BadgeCheck } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated';

import { useNotice } from '@/components/notice-queue';
import { Button, Card, IconBlock, LinkButton, Txt } from '@/components/ui';
import { updatePrefs, useDevicePrefs } from '@/lib/device-prefs';
import { useMonthBudget } from '@/state/data';
import { useSession } from '@/state/session';
import { colors, fonts, space } from '@/theme/tokens';

const T = BUDGET_CELEBRATION_TEXT;

/**
 * "Setembro de 2026 fechou dentro do orçamento" (pedido do Enzo em 12/11/2026): no Resumo do Pessoal, nos primeiros dias do mês, quando
 * o mês anterior teve orçamento e todas as categorias ficaram no valor definido ou abaixo (`budgetClosedWithin`). Discreto, no mesmo
 * jeito do card de nível. "Fechar" guarda o mês só neste aparelho; o card não volta para aquele mês. Nunca um recado negativo: com
 * alguma categoria acima, nada aparece. Entra na fila de avisos do Resumo.
 */
export function BudgetCelebrationCard({ contextId, eligible }: { contextId: string | undefined; eligible: boolean }) {
  const { user, auth, today } = useSession();
  const prefs = useDevicePrefs(user?.id);
  const closed = addMonths(monthOf(today), -1);
  const inWindow = Number(today.slice(8, 10)) <= BUDGET_CELEBRATION_LAST_DAY;
  const on = eligible && inWindow && Boolean(user) && prefs != null && prefs.budgetCelebratedMonth !== closed;
  const budget = useMonthBudget(on ? contextId : undefined, closed);
  const within = on && budget.summary ? budgetClosedWithin(budget.summary) : null;
  const show = useNotice('orcamento', within !== null);
  if (!show || !within || !user) return null;
  const persist = auth.mode !== 'demo';
  const close = () => updatePrefs(user.id, { budgetCelebratedMonth: within.month }, persist);

  return (
    <Animated.View entering={FadeInDown.duration(320).reduceMotion(ReduceMotion.System)}>
      <Card style={{ gap: space[3] }}>
        <View style={styles.row}>
          <IconBlock icon={BadgeCheck} lime />
          <View style={{ flex: 1, gap: 2 }}>
            <Txt variant="caption" color={colors.brandText} style={{ fontFamily: fonts.bold }}>
              {T.eyebrow}
            </Txt>
            <Txt variant="title" accessibilityRole="header" aria-level={2}>
              {T.title(within.month)}
            </Txt>
          </View>
        </View>
        <Txt color={colors.textSecondary}>{T.body(within.categories)}</Txt>
        <View style={styles.actions}>
          <Button
            label={T.open(within.month)}
            tone="soft"
            onPress={() => {
              close();
              router.push({ pathname: '/orcamento', params: { mes: within.month } });
            }}
            style={{ flexGrow: 1 }}
          />
          <LinkButton label={T.dismiss} onPress={close} />
        </View>
      </Card>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  actions: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space[3] },
});
