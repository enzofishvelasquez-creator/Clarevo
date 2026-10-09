import { CALC_UI_TEXT, COMMITTED_TEXT, ERROR_TEXT, GOALS_TEXT, goalsMonthTexts, monthOf, type Goal } from '@clarevo/core';
import { router } from 'expo-router';
import { Calculator, ChartLine, PiggyBank, Plus, ShieldCheck } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { CalcNavRow } from '@/components/calc/parts';
import { FlashBanner, useFlash } from '@/components/flash';
import { ClosedGoals, GoalCard, ReserveCard } from '@/components/goal-cards';
import { AppHeader } from '@/components/header';
import { MoneyTxt } from '@/components/money-text';
import { SavingsCard } from '@/components/savings-card';
import { EmptyState, ErrorState } from '@/components/states';
import { TopicRow } from '@/components/topic-link';
import { Body, Button, Card, LinkButton, Screen, Skeleton, Txt } from '@/components/ui';
import { explanationHref, isTopicPublished, topicBySlug } from '@/lib/learn';
import { useCommittedSummary, useGoalsOverview, useSavingsCard, useSpace, type GoalsOverview } from '@/state/data';
import { useSession } from '@/state/session';
import { colors, fonts, radius, space } from '@/theme/tokens';

/**
 * Metas (Ciclo C, spec2 §4.6 e spec7). De cima para baixo: a pergunta "Você consegue guardar algum valor por mês?" (enquanto
 * não respondida ou quando chega a hora de perguntar de novo; depois, o resumo do plano), Seu mês, a reserva para
 * imprevistos, as metas, Simular e Calculadoras, Aprender, as concluídas e arquivadas (recolhidas), "Quem vê estes dados?" e o
 * rodapé. Metas são só do contexto Pessoal. Nada aqui grava sem o servidor confirmar; falha de carga é ErrorState, nunca
 * R$ 0,00 nem 0%.
 */
export default function MetasScreen() {
  const { today } = useSession();
  const personal = useSpace();
  const contextId = personal.data?.personalContextId;
  const overview = useGoalsOverview(contextId);
  const committed = useCommittedSummary(contextId, monthOf(today));
  const savings = useSavingsCard(contextId);
  const [notice, setNotice] = useFlash();
  const data = overview.data;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Screen wide>
        <AppHeader title={GOALS_TEXT.tabTitle} />
        <Body>
          <FlashBanner message={notice} />
          <SavingsCard contextId={contextId} card={savings} onNotice={setNotice} />

          {personal.isError || overview.isError ? (
            <Card>
              <ErrorState
                message={ERROR_TEXT.carregar_falhou}
                onRetry={() => {
                  personal.refetch();
                  overview.refetch();
                }}
              />
            </Card>
          ) : data ? (
            <>
              <MonthCard overview={data} committed={committed} planLink={savings.data?.state.kind === 'oculto'} />
              <ReserveCard reserve={data.reserve} plan={data.reserve ? data.plans[data.reserve.id]! : null} />
              <GoalsSection active={data.active} plans={data.plans} />
            </>
          ) : (
            <View style={{ gap: space[4] }} accessibilityRole="progressbar" accessibilityLabel="Carregando as metas">
              <Card style={{ gap: space[3] }}>
                <Skeleton width="40%" height={22} />
                <Skeleton width="85%" height={16} />
                <Skeleton width="70%" height={16} />
              </Card>
              <Skeleton width="100%" height={180} style={{ borderRadius: radius.lg }} />
            </View>
          )}

          <Card style={{ paddingVertical: space[2] }}>
            <CalcNavRow icon={ChartLine} title={GOALS_TEXT.simulateTitle} caption={GOALS_TEXT.simulateBody} onPress={() => router.push('/simular')} />
            <CalcNavRow
              icon={Calculator}
              title={GOALS_TEXT.calculators}
              caption={CALC_UI_TEXT.shortcutCaption}
              onPress={() => router.push('/calcular')}
              last
            />
          </Card>

          <LearnCard />
          {data ? <ClosedGoals goals={data.closed} /> : null}

          <Pressable accessibilityRole="button" onPress={() => router.push('/quem-ve')} style={styles.privacy} hitSlop={8}>
            <ShieldCheck size={18} color={colors.textSecondary} />
            <Txt variant="label" color={colors.textSecondary}>
              {GOALS_TEXT.whoSees}
            </Txt>
          </Pressable>
          <Txt variant="caption" color={colors.textSecondary} style={{ textAlign: 'center' }}>
            {GOALS_TEXT.footer}
          </Txt>
        </Body>
      </Screen>
    </View>
  );
}

/**
 * "Seu mês": fora dos compromissos e o percentual da renda de referência (renda comprometida, Ciclo B) e o guardado no mês
 * (aportes menos resgates). O cálculo da renda comprometida carrega à parte: se falhar, o resto continua e a falha tem
 * "Tentar novamente"; nunca um valor ou um percentual de mentira.
 */
function MonthCard({
  overview,
  committed,
  planLink,
}: {
  overview: GoalsOverview;
  committed: ReturnType<typeof useCommittedSummary>;
  planLink: boolean;
}) {
  const summary = committed.data ?? null;
  const texts = goalsMonthTexts(summary, overview.savedInMonthCents, overview.month);
  const noReference = summary !== null && summary.referenceCents === null;
  return (
    <Card style={{ gap: space[2], paddingVertical: space[5] }}>
      <Txt variant="title" accessibilityRole="header" aria-level={2}>
        {GOALS_TEXT.monthTitle}
      </Txt>
      {committed.isPending ? (
        <View style={{ gap: space[2] }} accessibilityRole="progressbar" accessibilityLabel="Calculando a renda comprometida">
          <Skeleton width="85%" height={18} />
          <Skeleton width="70%" height={18} />
        </View>
      ) : committed.isError ? (
        <ErrorState message={COMMITTED_TEXT.loadError} onRetry={() => committed.refetch()} />
      ) : (
        <>
          {texts.outside ? <MoneyTxt style={{ fontFamily: fonts.bold }}>{texts.outside}</MoneyTxt> : null}
          {texts.committed ? <MoneyTxt color={colors.textSecondary}>{texts.committed}</MoneyTxt> : null}
        </>
      )}
      <MoneyTxt style={{ fontFamily: fonts.bold }}>{texts.saved}</MoneyTxt>
      {noReference ? (
        <LinkButton label={COMMITTED_TEXT.noReferenceButton} style={styles.link} onPress={() => router.push('/renda-comprometida/referencia')} />
      ) : null}
      <LinkButton label={GOALS_TEXT.seeCommitted} style={styles.link} onPress={() => router.push('/renda-comprometida')} />
      {planLink ? <LinkButton label="Planejar quanto guardar" icon={PiggyBank} style={styles.link} onPress={() => router.push('/guardar')} /> : null}
    </Card>
  );
}

function GoalsSection({ active, plans }: { active: readonly Goal[]; plans: GoalsOverview['plans'] }) {
  return (
    <View style={{ gap: space[3] }}>
      <Txt variant="title" accessibilityRole="header" aria-level={2}>
        {GOALS_TEXT.goalsTitle}
      </Txt>
      {active.length === 0 ? (
        <Card>
          <EmptyState title={GOALS_TEXT.emptyTitle} art="metas">
            {GOALS_TEXT.emptyBody}
          </EmptyState>
        </Card>
      ) : (
        active.map((g) => <GoalCard key={g.id} goal={g} plan={plans[g.id]!} />)
      )}
      <Button label={GOALS_TEXT.newGoal} icon={Plus} tone="soft" onPress={() => router.push('/meta/nova')} />
    </View>
  );
}

/** Card lima de Aprender (texto escuro), como o card de educação do Resumo: reserva e aporte. */
function LearnCard() {
  const rows = [
    { slug: 'reserva-imprevistos', title: GOALS_TEXT.learnReserves },
    { slug: 'aporte', title: GOALS_TEXT.learnDeposit },
  ] as const;
  const shown = rows.flatMap((r) => {
    const topic = topicBySlug(r.slug);
    return topic && isTopicPublished(r.slug) ? [{ topic: { ...topic, title: r.title }, slug: r.slug }] : [];
  });
  if (shown.length === 0) return null;
  return (
    <View style={styles.learn}>
      <Txt variant="title" style={{ fontFamily: fonts.extrabold }} accessibilityRole="header" aria-level={2}>
        Aprender
      </Txt>
      {shown.map((r, i) => (
        <TopicRow key={r.slug} topic={r.topic} caption={null} onAccent last={i === shown.length - 1} onPress={() => router.push(explanationHref(r.slug))} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  link: { alignSelf: 'flex-start', paddingHorizontal: 0 },
  learn: { backgroundColor: colors.accent, borderRadius: radius.lg, paddingTop: space[5], paddingBottom: space[2], paddingHorizontal: space[6], gap: space[1] },
  privacy: { flexDirection: 'row', alignSelf: 'center', alignItems: 'center', gap: space[2], minHeight: 44 },
});
