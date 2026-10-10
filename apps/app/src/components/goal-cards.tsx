import {
  GOALS_TEXT,
  GOAL_STATUS_LABEL,
  goalCardCaption,
  reserveCardTexts,
  type Goal,
  type GoalPlan,
} from '@clarevo/core';
import { router } from 'expo-router';
import { ChevronDown, ChevronRight, ChevronUp, PiggyBank, ShieldCheck, Target } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, ReduceMotion } from 'react-native-reanimated';

import { GoalProgress } from '@/components/goal-progress';
import { MoneyTxt, useMoneyLabelMask } from '@/components/money-text';
import { Button, Card, LinkButton, Txt, styles as ui } from '@/components/ui';
import { showsCoverage } from '@/lib/essentials';
import { colors, fonts, motion, radius, space, tabular } from '@/theme/tokens';

/**
 * Card azul da reserva para imprevistos (spec2 §4.6): sem reserva, o convite para calcular; com reserva, "R$ 3.500,00 de
 * R$ 22.500,00", a barra lima, o percentual, a cobertura em meses de gastos essenciais (quando é verdade), o plano por mês e
 * "Registrar aporte" e "Ver detalhes". Texto claro sobre o azul; o lima é só da barra e do selo.
 *
 * `planSlot`: o plano de guardar dentro do card (D-039), em vez de um segundo card sobre o mesmo valor. `planLink`: a linha
 * "Planejar quanto guardar" de quem respondeu "Agora não" (a pergunta só volta mais tarde, mas a porta fica aqui).
 */
export function ReserveCard({
  reserve,
  plan,
  planSlot,
  planLink,
}: {
  reserve: Goal | null;
  plan: GoalPlan | null;
  planSlot?: ReactNode;
  planLink?: boolean;
}) {
  const planAction = planLink ? (
    <LinkButton
      label="Planejar quanto guardar"
      icon={PiggyBank}
      color={colors.textOnBrand}
      style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }}
      onPress={() => router.push('/guardar')}
    />
  ) : null;
  if (reserve === null || plan === null) {
    // Sem reserva: o botão vem logo depois do título (à vista acima da barra em 360 × 640 e em 320 px), o texto curto depois dele.
    return (
      <View style={[styles.blue, styles.blueEmpty]}>
        <View style={styles.blueHead}>
          <ShieldCheck size={22} color={colors.textOnBrand} strokeWidth={2.25} aria-hidden />
          <Txt variant="title" color={colors.textOnBrand} accessibilityRole="header" aria-level={2}>
            {GOALS_TEXT.reserveTitle}
          </Txt>
        </View>
        <Button label={GOALS_TEXT.reserveCalculate} tone="soft" onPress={() => router.push('/reserva')} />
        <Txt color={colors.textOnBrand}>{GOALS_TEXT.reserveEmpty}</Txt>
        {/* Quem respondeu "consigo" e ainda não tem reserva também vê o plano aqui, depois do botão (que fica à vista). */}
        {planSlot}
        {planAction}
      </View>
    );
  }
  const t = reserveCardTexts(reserve);
  const coverage = showsCoverage(reserve) ? t.coverage : null;
  return (
    <View style={styles.blue}>
      <View style={styles.blueHead}>
        <ShieldCheck size={22} color={colors.textOnBrand} strokeWidth={2.25} aria-hidden />
        <Txt variant="title" color={colors.textOnBrand} style={{ flex: 1 }} accessibilityRole="header" aria-level={2}>
          {reserve.name}
        </Txt>
        {reserve.status !== 'ativa' ? (
          <View style={styles.pill}>
            <Txt variant="caption" color={colors.text} style={{ fontFamily: fonts.bold }}>
              {GOAL_STATUS_LABEL[reserve.status]}
            </Txt>
          </View>
        ) : null}
      </View>
      <MoneyTxt color={colors.textOnBrand} style={[tabular, styles.amounts]}>
        {t.amounts}
      </MoneyTxt>
      <GoalProgress percent={plan.progress.barPercent} tone="onBrand" label={t.a11yLabel} valueText={`${t.amounts}, ${t.percent}`} />
      <View style={styles.percentRow}>
        <Txt color={colors.textOnBrand} style={[tabular, { fontFamily: fonts.extrabold }]}>
          {t.percent}
        </Txt>
        {plan.progress.reached ? (
          <View style={styles.pill}>
            <Txt variant="caption" color={colors.text} style={{ fontFamily: fonts.bold }}>
              {GOALS_TEXT.reachedBadge}
            </Txt>
          </View>
        ) : null}
      </View>
      {coverage ? (
        <MoneyTxt variant="label" color={colors.textOnBrand}>
          {coverage}
        </MoneyTxt>
      ) : null}
      {t.planned ? (
        <MoneyTxt variant="label" color={colors.textOnBrandSoft}>
          {t.planned}
        </MoneyTxt>
      ) : null}
      {planSlot}
      <View style={styles.actions}>
        <Button
          label={GOALS_TEXT.addDeposit}
          tone="soft"
          style={styles.action}
          onPress={() => router.push({ pathname: '/meta/[id]/movimento', params: { id: reserve.id, tipo: 'aporte' } })}
        />
        <Button
          label={GOALS_TEXT.seeDetails}
          tone="onBrand"
          style={styles.action}
          onPress={() => router.push({ pathname: '/meta/[id]', params: { id: reserve.id } })}
        />
      </View>
      {planAction}
    </View>
  );
}

/**
 * Cartão de uma meta ativa: ícone em disco lima (só enfeite), nome, "R$ 1.200,00 de R$ 6.000,00", barra, percentual e a
 * legenda do prazo ou do plano. O cartão inteiro abre o detalhe e carrega a frase completa; a barra é só desenho.
 */
export function GoalCard({ goal, plan }: { goal: Goal; plan: GoalPlan }) {
  const maskLabel = useMoneyLabelMask();
  const caption = goalCardCaption(plan);
  const amounts = GOALS_TEXT.savedOfTarget(goal.savedCents, goal.targetCents);
  const percent = GOALS_TEXT.percent(plan.progress.percent);
  const label = maskLabel(`${GOALS_TEXT.progressA11y(goal.name, plan.progress.percent, goal.savedCents, goal.targetCents)}${caption ? ` ${caption}.` : ''}`);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Abre a meta"
      onPress={() => router.push({ pathname: '/meta/[id]', params: { id: goal.id } })}
      style={(st) => [ui.card, styles.goal, st.pressed && { opacity: 0.85 }, (st as { focused?: boolean }).focused && ui.focusRing]}>
      <View style={styles.goalHead}>
        <View style={styles.disc}>
          <Target size={18} color={colors.text} strokeWidth={2.25} aria-hidden />
        </View>
        <Txt variant="label" style={{ flex: 1, fontFamily: fonts.bold, fontSize: 16 }}>
          {goal.name}
        </Txt>
        <ChevronRight size={20} color={colors.textSecondary} aria-hidden />
      </View>
      <View style={styles.goalAmounts}>
        <MoneyTxt variant="label" style={[tabular, { flex: 1 }]}>
          {amounts}
        </MoneyTxt>
        <Txt variant="label" style={[tabular, { fontFamily: fonts.extrabold }]}>
          {percent}
        </Txt>
      </View>
      <GoalProgress percent={plan.progress.barPercent} tone="light" decorative />
      {caption ? (
        <MoneyTxt variant="caption" color={colors.textSecondary}>
          {caption}
        </MoneyTxt>
      ) : null}
    </Pressable>
  );
}

/** "Concluídas e arquivadas" (recolhida): só aparece com alguma meta nesses estados. */
export function ClosedGoals({ goals }: { goals: readonly Goal[] }) {
  const [open, setOpen] = useState(false);
  const maskLabel = useMoneyLabelMask();
  if (goals.length === 0) return null;
  return (
    <Card style={{ gap: space[1], paddingVertical: space[3] }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${GOALS_TEXT.closedTitle}, ${goals.length}`}
        accessibilityState={{ expanded: open }}
        aria-expanded={open}
        onPress={() => setOpen((o) => !o)}
        style={(st) => [styles.toggle, st.pressed && { opacity: 0.7 }, (st as { focused?: boolean }).focused && ui.focusRing]}>
        <Txt variant="title" style={{ flex: 1 }} accessibilityRole="header" aria-level={2}>
          {GOALS_TEXT.closedTitle}
        </Txt>
        <Txt variant="label" color={colors.textSecondary}>
          {goals.length}
        </Txt>
        {open ? <ChevronUp size={20} color={colors.textSecondary} aria-hidden /> : <ChevronDown size={20} color={colors.textSecondary} aria-hidden />}
      </Pressable>
      {open ? (
        <Animated.View entering={FadeIn.duration(motion.context).reduceMotion(ReduceMotion.System)}>
          {goals.map((g, i) => {
            const amounts = GOALS_TEXT.savedOfTarget(g.savedCents, g.targetCents);
            return (
              <Pressable
                key={g.id}
                accessibilityRole="button"
                accessibilityLabel={maskLabel(`${g.name}, ${GOAL_STATUS_LABEL[g.status].toLowerCase()}, ${amounts}`)}
                onPress={() => router.push({ pathname: '/meta/[id]', params: { id: g.id } })}
                style={(st) => [
                  styles.closedRow,
                  i < goals.length - 1 && styles.divider,
                  st.pressed && { opacity: 0.7 },
                  (st as { focused?: boolean }).focused && ui.focusRing,
                ]}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Txt variant="label" style={{ fontFamily: fonts.bold, fontSize: 15 }}>
                    {g.name}
                  </Txt>
                  <MoneyTxt variant="caption" color={colors.textSecondary} style={tabular}>
                    {`${GOAL_STATUS_LABEL[g.status]} · ${amounts}`}
                  </MoneyTxt>
                </View>
                <ChevronRight size={20} color={colors.textSecondary} aria-hidden />
              </Pressable>
            );
          })}
        </Animated.View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  blue: { backgroundColor: colors.brand, borderRadius: radius.lg, padding: space[5], gap: space[3] },
  blueEmpty: { padding: space[4], gap: space[2] },
  blueHead: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  amounts: { fontFamily: fonts.extrabold, fontSize: 20, lineHeight: 28 },
  percentRow: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  pill: { backgroundColor: colors.accent, borderRadius: radius.pill, paddingHorizontal: space[3], paddingVertical: 2 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  action: { alignSelf: 'auto', flexGrow: 1, flexBasis: 140 },
  goal: { gap: space[2] },
  goalHead: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  goalAmounts: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  disc: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 48 },
  closedRow: { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 56, paddingVertical: space[2] },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.border },
});
