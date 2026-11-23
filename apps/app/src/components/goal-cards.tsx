import {
  GOALS_TEXT,
  GOAL_STATUS_LABEL,
  SAVINGS_TEXT,
  goalCardCaption,
  goalPace,
  reserveCardTexts,
  type Goal,
  type GoalImage,
  type GoalPlan,
} from '@clarevo/core';
import { router } from 'expo-router';
import { ChevronDown, ChevronRight, ChevronUp, PiggyBank, ShieldCheck, Target } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, ReduceMotion } from 'react-native-reanimated';

import { GoalImageView } from '@/components/goal-image';
import { GoalProgress } from '@/components/goal-progress';
import { UncountedLinkedLine, useUncountedLinkedInvestments } from '@/components/linked-investments';
import { MoneyTxt, useMoneyLabelMask } from '@/components/money-text';
import { Button, Card, LinkButton, Txt, styles as ui } from '@/components/ui';
import { showsCoverage } from '@/lib/essentials';
import { useSession } from '@/state/session';
import { colors, fonts, motion, radius, space, tabular } from '@/theme/tokens';

/**
 * Card azul da reserva para imprevistos (spec2 §4.6): sem reserva, o convite para calcular; com reserva, "R$ 3.500,00 de
 * R$ 22.500,00", a barra lima, o percentual, a cobertura em meses de gastos essenciais (quando é verdade), o plano por mês e
 * "Registrar aporte" e "Ver detalhes". Texto claro sobre o azul; o lima é só da barra e do selo.
 *
 * `planSlot`: o plano de guardar dentro do card (D-039), em vez de um segundo card sobre o mesmo valor. `planLink`: a linha
 * "Planejar quanto guardar" de quem respondeu "Agora não" (a pergunta só volta mais tarde, mas a porta fica aqui).
 *
 * `compact` (D-093): com a reserva criada e o plano de guardar já feito, o card fica curto: valor, barra, percentual, cobertura,
 * ritmo, o plano em uma linha com "Ver o plano" (o `planSlot` compacto) e as ações, sem a linha "Planejado". Assim "Suas metas"
 * sobe para a primeira tela do celular.
 *
 * O conteúdo vem em grupos (revisão visual de 23/11/2026: oito textos em quatro tamanhos, todos com o mesmo vão): o valor com a barra e
 * o percentual; os fatos (cobertura, a nota do arredondamento logo abaixo dela, o ritmo e os investimentos ligados), mais juntos; o
 * plano; as ações.
 *
 * `light` (computador, com a reserva criada): um cartão branco como os de baixo, em duas colunas (os números à esquerda, o plano e as
 * ações à direita), em vez de um segundo bloco azul logo abaixo da faixa azul da aba (revisão visual de 23/11/2026). O plano de guardar
 * vem de `planMonthlyCents`, com as cores do cartão branco (o `planSlot` é desenhado para o azul).
 */
export function ReserveCard({
  reserve,
  plan,
  planSlot,
  planLink,
  compact,
  light,
  planMonthlyCents,
}: {
  reserve: Goal | null;
  plan: GoalPlan | null;
  planSlot?: ReactNode;
  planLink?: boolean;
  compact?: boolean;
  light?: boolean;
  planMonthlyCents?: number | null;
}) {
  const { today } = useSession();
  const uncounted = useUncountedLinkedInvestments(reserve);
  const onCard = Boolean(light) && reserve !== null && plan !== null;
  const fg = onCard ? colors.text : colors.textOnBrand;
  const soft = onCard ? colors.textSecondary : colors.textOnBrandSoft;
  const planAction = planLink ? (
    <LinkButton
      label="Planejar quanto guardar"
      icon={PiggyBank}
      color={onCard ? colors.brandText : colors.textOnBrand}
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
        <Button label={GOALS_TEXT.reserveCalculate} tone="onBrandSoft" onPress={() => router.push('/reserva')} />
        <Txt color={colors.textOnBrand}>{GOALS_TEXT.reserveEmpty}</Txt>
        {/* Quem respondeu "consigo" e ainda não tem reserva também vê o plano aqui, depois do botão (que fica à vista). */}
        {planSlot}
        {planAction}
      </View>
    );
  }
  const t = reserveCardTexts(reserve);
  const coverage = showsCoverage(reserve) ? t.coverage : null;
  const pace = goalPace(reserve, today);
  const head = (
    <View style={styles.blueHead}>
      {onCard ? (
        <View style={styles.headIcon}>
          <ShieldCheck size={20} color={colors.brandText} strokeWidth={2.25} aria-hidden />
        </View>
      ) : (
        <ShieldCheck size={22} color={colors.textOnBrand} strokeWidth={2.25} aria-hidden />
      )}
      <Txt variant="title" color={fg} style={{ flex: 1 }} accessibilityRole="header" aria-level={2}>
        {reserve.name}
      </Txt>
      {reserve.status !== 'ativa' ? (
        <View style={styles.pill}>
          <Txt variant="caption" color={colors.textOnAccent} style={{ fontFamily: fonts.bold }}>
            {GOAL_STATUS_LABEL[reserve.status]}
          </Txt>
        </View>
      ) : null}
    </View>
  );
  const value = (
    <View style={styles.group}>
      <MoneyTxt color={fg} style={[tabular, styles.amounts]}>
        {t.amounts}
      </MoneyTxt>
      <GoalProgress percent={plan.progress.barPercent} tone={onCard ? 'light' : 'onBrand'} label={t.a11yLabel} valueText={`${t.amounts}, ${t.percent}`} />
      <View style={styles.percentRow}>
        <Txt color={fg} style={[tabular, { fontFamily: fonts.extrabold }]}>
          {t.percent}
        </Txt>
        {plan.progress.reached ? (
          <View style={styles.pill}>
            <Txt variant="caption" color={colors.textOnAccent} style={{ fontFamily: fonts.bold }}>
              {GOALS_TEXT.reachedBadge}
            </Txt>
          </View>
        ) : null}
      </View>
    </View>
  );
  // A nota do arredondamento fica no card (CL-09), logo abaixo do que ela explica: o percentual e os meses cobertos.
  const facts = (
    <View style={styles.facts}>
      {coverage ? (
        <MoneyTxt variant="label" color={fg}>
          {coverage}
        </MoneyTxt>
      ) : null}
      <Txt variant="caption" color={soft}>
        {t.rounding}
      </Txt>
      {pace ? (
        <MoneyTxt variant="label" color={fg} style={{ fontFamily: fonts.bold, marginTop: space[1] }}>
          {GOALS_TEXT.pace.line(pace)}
        </MoneyTxt>
      ) : null}
      {uncounted ? <UncountedLinkedLine summary={uncounted} onBrand={!onCard} onSee={() => openLinked(reserve.id)} /> : null}
      {!compact && t.planned ? (
        <MoneyTxt variant="label" color={soft}>
          {t.planned}
        </MoneyTxt>
      ) : null}
    </View>
  );
  const deposit = () => router.push({ pathname: '/meta/[id]/movimento', params: { id: reserve.id, tipo: 'aporte' } });
  const details = () => router.push({ pathname: '/meta/[id]', params: { id: reserve.id } });
  if (onCard) {
    return (
      <Card style={styles.light}>
        {head}
        <View style={styles.lightRow}>
          <View style={styles.lightMain}>
            {value}
            {facts}
          </View>
          <View style={styles.lightSide}>
            {planMonthlyCents != null ? (
              <View style={styles.lightPlan}>
                <Txt variant="label" style={{ fontFamily: fonts.extrabold }} accessibilityRole="header" aria-level={3}>
                  {SAVINGS_TEXT.planTitle}
                </Txt>
                <MoneyTxt variant="label">{SAVINGS_TEXT.planMonthly(planMonthlyCents)}</MoneyTxt>
                <View style={styles.lightLinks}>
                  <LinkButton label="Ver o plano" style={styles.inlineLink} onPress={() => router.push('/guardar')} />
                  <LinkButton label={SAVINGS_TEXT.changeValue} style={styles.inlineLink} onPress={() => router.push({ pathname: '/guardar', params: { editar: '1' } })} />
                </View>
              </View>
            ) : null}
            <View style={styles.lightActions}>
              <Button label={GOALS_TEXT.addDeposit} tone="soft" compact onPress={deposit} />
              <Button label={GOALS_TEXT.seeDetails} tone="ghost" compact onPress={details} />
            </View>
            {planAction}
          </View>
        </View>
      </Card>
    );
  }
  return (
    <View style={styles.blue}>
      {head}
      {value}
      {facts}
      {planSlot}
      <View style={styles.actions}>
        <Button label={GOALS_TEXT.addDeposit} tone="onBrandSoft" onPress={deposit} />
        <Button label={GOALS_TEXT.seeDetails} tone="onBrand" onPress={details} />
      </View>
      {planAction}
    </View>
  );
}

/**
 * Cartão de uma meta ativa: ícone em disco lima (só enfeite), nome, "R$ 1.200,00 de R$ 6.000,00", barra, percentual e a
 * legenda do prazo ou do plano. O cartão inteiro abre o detalhe e carrega a frase completa; a barra é só desenho.
 */
export function GoalCard({ goal, plan, image }: { goal: Goal; plan: GoalPlan; image?: GoalImage | null }) {
  const maskLabel = useMoneyLabelMask();
  const { today } = useSession();
  const uncounted = useUncountedLinkedInvestments(goal);
  const caption = goalCardCaption(plan);
  const pace = goalPace(goal, today);
  const paceLine = pace ? GOALS_TEXT.pace.line(pace) : null;
  const amounts = GOALS_TEXT.savedOfTarget(goal.savedCents, goal.targetCents);
  const percent = GOALS_TEXT.percent(plan.progress.percent);
  const label = maskLabel(`${GOALS_TEXT.progressA11y(goal.name, plan.progress.percent, goal.savedCents, goal.targetCents)}${caption ? ` ${caption}.` : ''}${paceLine ? ` ${paceLine}.` : ''}`);
  const content = (
    <>
      {/* Imagem da meta (D-077): decorativa aqui, o cartão já diz o nome. */}
      <GoalImageView goal={goal} image={image} height={104} decorative />
      <View style={styles.goalHead}>
        <View style={styles.disc}>
          <Target size={18} color={colors.textOnAccent} strokeWidth={2.25} aria-hidden />
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
      {paceLine ? (
        <MoneyTxt variant="caption" color={pace!.onTrack ? colors.textSecondary : colors.text} style={{ fontFamily: fonts.bold }}>
          {paceLine}
        </MoneyTxt>
      ) : null}
    </>
  );
  const open = () => router.push({ pathname: '/meta/[id]', params: { id: goal.id } });
  // Com investimentos ligados fora do guardado, a linha com "Ver" fica no cartão, mas fora da área que abre a meta (nada de botão dentro
  // de botão): o cartão vira uma caixa com a área tocável e a linha embaixo.
  if (uncounted) {
    return (
      <View style={[ui.card, styles.goal]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityHint="Abre a meta"
          onPress={open}
          style={(st) => [styles.goal, st.pressed && { opacity: 0.85 }, (st as { focused?: boolean }).focused && ui.focusRing]}>
          {content}
        </Pressable>
        <UncountedLinkedLine summary={uncounted} onSee={() => openLinked(goal.id)} />
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Abre a meta"
      onPress={open}
      style={(st) => [ui.card, styles.goal, st.pressed && { opacity: 0.85 }, (st as { focused?: boolean }).focused && ui.focusRing]}>
      {content}
    </Pressable>
  );
}

/** "Ver" dos investimentos ligados: o detalhe da meta, já no card "Investimentos ligados". */
const openLinked = (id: string) => router.push({ pathname: '/meta/[id]', params: { id, secao: 'investimentos' } });

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
  // Entre os grupos (título, valor, fatos, plano e ações), 16 px; dentro de um grupo, menos.
  blue: { backgroundColor: colors.brand, borderRadius: radius.lg, padding: space[5], gap: space[4] },
  blueEmpty: { padding: space[4], gap: space[2] },
  blueHead: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  group: { gap: space[2] },
  facts: { gap: space[1] },
  headIcon: { width: 36, height: 36, borderRadius: radius.sm, backgroundColor: colors.brandTint, alignItems: 'center', justifyContent: 'center' },
  // Computador: o cartão branco em duas colunas; a da direita com o plano num bloco claro e as duas ações, uma embaixo da outra (lado a
  // lado, em 280 px, "Registrar aporte" quebrava em duas linhas).
  light: { gap: space[4] },
  lightRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space[6] },
  lightMain: { flex: 1, minWidth: 0, gap: space[4] },
  lightSide: { width: 280, gap: space[3] },
  lightPlan: { backgroundColor: colors.background, borderRadius: radius.md, paddingHorizontal: space[4], paddingTop: space[3], paddingBottom: space[1], gap: space[1] },
  lightLinks: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space[5] },
  inlineLink: { alignSelf: 'flex-start', paddingHorizontal: 0 },
  lightActions: { gap: space[1] },
  amounts: { fontFamily: fonts.extrabold, fontSize: 20, lineHeight: 28 },
  percentRow: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  pill: { backgroundColor: colors.accent, borderRadius: radius.pill, paddingHorizontal: space[3], paddingVertical: 2 },
  // Um botão por linha, na largura toda (revisão das telas, 16/11/2026): lado a lado, "Registrar aporte" quebrava em duas linhas.
  actions: { gap: space[2] },
  goal: { gap: space[2] },
  goalHead: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  goalAmounts: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  disc: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 48 },
  closedRow: { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 56, paddingVertical: space[2] },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.border },
});
