import { ERROR_TEXT, GOALS_REVIEW_TEXT, goalReviewLines, organizeGoals } from '@clarevo/core';
import { router } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { useGoalsReviewDone } from '@/components/goals-review';
import { ContextPill, SubHeader } from '@/components/header';
import { MoneyTxt } from '@/components/money-text';
import { ErrorState, LoadingState } from '@/components/states';
import { Button, Card, Screen, Txt } from '@/components/ui';
import { flash } from '@/lib/flash';
import { maskMoneyLabel, useValuesHidden } from '@/lib/privacy';
import { useGoals, useWork } from '@/state/data';
import { colors, fonts, radius, space } from '@/theme/tokens';

const T = GOALS_REVIEW_TEXT;

/**
 * Rever metas (D-105): a lista das metas ativas (a reserva primeiro), cada uma com o guardado, o prazo e o plano por mês, e as três
 * perguntas da revisão. Só leitura: cada meta abre o próprio detalhe, onde fica "Editar meta". "Concluir revisão" guarda a data do
 * próximo convite (hoje + 3 meses), só neste aparelho, e volta para Metas.
 */
export default function ReverMetasScreen() {
  const work = useWork();
  const contextId = work.data?.contextId;
  const goals = useGoals(contextId);
  const hidden = useValuesHidden();
  const done = useGoalsReviewDone();
  const finish = () => {
    done();
    flash.set(T.doneNotice);
    if (router.canGoBack()) router.back();
    else router.replace('/metas');
  };

  if (work.isError || goals.isError) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <SubHeader title={T.screenTitle} right={<ContextPill label="Pessoal" />} />
        <Screen contentStyle={{ padding: space[5] }}>
          <ErrorState message={ERROR_TEXT.carregar_falhou} onRetry={() => goals.refetch()} />
        </Screen>
      </View>
    );
  }
  if (!contextId || !goals.data) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <SubHeader title={T.screenTitle} right={<ContextPill label="Pessoal" />} />
        <LoadingState />
      </View>
    );
  }
  const { reserve, active } = organizeGoals(goals.data);
  const lines = goalReviewLines([...(reserve && reserve.status === 'ativa' ? [reserve] : []), ...active]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SubHeader title={T.screenTitle} right={<ContextPill label="Pessoal" />} />
      <Screen contentStyle={{ padding: space[5], gap: space[4] }}>
        <Txt color={colors.textSecondary}>{T.screenIntro}</Txt>
        <Card style={{ gap: space[2] }}>
          <Txt variant="title" accessibilityRole="header" aria-level={2}>
            {T.questionsTitle}
          </Txt>
          {T.questions.map((q) => (
            <View key={q} style={styles.bullet}>
              <Txt color={colors.textSecondary} aria-hidden accessibilityElementsHidden importantForAccessibility="no">
                •
              </Txt>
              <Txt style={{ flex: 1 }}>{q}</Txt>
            </View>
          ))}
        </Card>
        {lines.length === 0 ? (
          <Card>
            <Txt>{T.empty}</Txt>
          </Card>
        ) : (
          <Card style={{ paddingVertical: space[2] }}>
            {lines.map((l, i) => (
              <Pressable
                key={l.id}
                accessibilityRole="button"
                accessibilityLabel={maskMoneyLabel(`${T.open(l.name)}. ${l.saved}. ${l.deadline}. ${l.plan}.`, hidden)}
                onPress={() => router.push({ pathname: '/meta/[id]', params: { id: l.id } })}
                style={(st) => [styles.row, i < lines.length - 1 && styles.divider, st.pressed && { opacity: 0.7 }, (st as { focused?: boolean }).focused && styles.focusRing]}>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Txt variant="label" style={{ fontFamily: fonts.bold, fontSize: 16 }}>
                    {l.name}
                  </Txt>
                  <MoneyTxt variant="caption" color={colors.textSecondary}>
                    {l.saved}
                  </MoneyTxt>
                  <Txt variant="caption" color={colors.textSecondary}>
                    {l.deadline}
                  </Txt>
                  <MoneyTxt variant="caption" color={colors.textSecondary}>
                    {l.plan}
                  </MoneyTxt>
                </View>
                <ChevronRight size={20} color={colors.textSecondary} aria-hidden />
              </Pressable>
            ))}
          </Card>
        )}
        <Button label={T.done} onPress={finish} />
        <Txt variant="caption" color={colors.textSecondary} style={{ textAlign: 'center' }}>
          {T.deviceOnly}
        </Txt>
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  bullet: { flexDirection: 'row', gap: space[2] },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: space[3], minHeight: 56, borderRadius: radius.sm },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  focusRing: { outlineWidth: 3, outlineColor: colors.brandText, outlineStyle: 'solid', outlineOffset: 2 } as object,
});
