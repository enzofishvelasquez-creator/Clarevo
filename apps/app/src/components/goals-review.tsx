import { GOALS_REVIEW_TEXT, deviceTimeZone, goalsReviewDue, goalsReviewNextOn, type Goal } from '@clarevo/core';
import { router } from 'expo-router';
import { ListChecks } from 'lucide-react-native';
import { View } from 'react-native';

import { Button, Card, LinkButton, Txt } from '@/components/ui';
import { updatePrefs, useDevicePrefs } from '@/lib/device-prefs';
import { useSession } from '@/state/session';
import { colors, space } from '@/theme/tokens';

const T = GOALS_REVIEW_TEXT;

/** Guarda a data do próximo convite (hoje + 3 meses), só neste aparelho. Na demonstração, só em memória. */
export function useGoalsReviewDone() {
  const { user, auth, today } = useSession();
  return () => {
    if (user) updatePrefs(user.id, { goalsReviewNextOn: goalsReviewNextOn(today) }, auth.mode !== 'demo');
  };
}

/**
 * Convite para rever as metas (D-105): a cada três meses, só se a pessoa quiser. Aparece em Metas, depois das metas, com alguma meta ativa
 * e quando chega a data (`goalsReviewDue`). "Rever metas" abre a lista de revisão; "Agora não" esconde o convite por três meses. As duas
 * respostas guardam a data só neste aparelho. Sem cor de alerta e sem contagem: é um convite.
 */
export function GoalsReviewInvite({ goals, canWrite, onNotice }: { goals: readonly Goal[]; canWrite: boolean; onNotice: (text: string) => void }) {
  const { user, today } = useSession();
  const prefs = useDevicePrefs(user?.id);
  const done = useGoalsReviewDone();
  if (!canWrite || !prefs || !goalsReviewDue(goals, today, prefs.goalsReviewNextOn, deviceTimeZone())) return null;
  return (
    <Card style={{ gap: space[3] }}>
      <View style={{ flexDirection: 'row', gap: space[2], alignItems: 'center' }}>
        <ListChecks size={22} color={colors.brandText} aria-hidden />
        <Txt variant="title" accessibilityRole="header" aria-level={2} style={{ flex: 1 }}>
          {T.cardTitle}
        </Txt>
      </View>
      <Txt>{T.cardBody}</Txt>
      <Button
        label={T.review}
        tone="soft"
        onPress={() => {
          done();
          router.push('/meta/rever');
        }}
      />
      <LinkButton
        label={T.later}
        accessibilityLabel={T.laterA11y}
        style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }}
        onPress={() => {
          done();
          onNotice(T.laterNotice);
        }}
      />
      <Txt variant="caption" color={colors.textSecondary}>
        {T.deviceOnly}
      </Txt>
    </Card>
  );
}
