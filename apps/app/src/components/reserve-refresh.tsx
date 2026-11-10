import { GOALS_TEXT, reserveRefreshSuggestion, type Goal } from '@clarevo/core';
import { router } from 'expo-router';
import { RefreshCw } from 'lucide-react-native';
import { View } from 'react-native';

import { Banner, Button, LinkButton, Txt } from '@/components/ui';
import { updatePrefs, useDevicePrefs } from '@/lib/device-prefs';
import { maskMoneyText, useValuesHidden } from '@/lib/privacy';
import { useEssentialEstimate } from '@/state/data';
import { useSession } from '@/state/session';
import { colors, fonts, space } from '@/theme/tokens';

const R = GOALS_TEXT.reserve;

/**
 * Atualizar a reserva com os registros (D-091 F), na aba Metas, logo abaixo do card da reserva: quando a média dos gastos essenciais
 * anotados nos últimos 3 meses fica 15% ou mais longe da base que a reserva usa (reserveRefreshSuggestion), sugere atualizar. O
 * botão abre a reserva já com a base e os meses novos; a pessoa confere e salva. "Agora não" esconde até a média mudar.
 */
export function ReserveRefresh({ contextId, reserve, canWrite }: { contextId: string | undefined; reserve: Goal | null; canWrite: boolean }) {
  const { user, auth } = useSession();
  const prefs = useDevicePrefs(user?.id);
  const hidden = useValuesHidden();
  const eligible = canWrite && reserve !== null && reserve.status === 'ativa' && reserve.essentialBaseCents !== null;
  const estimate = useEssentialEstimate(eligible ? contextId : undefined);
  const s = eligible ? reserveRefreshSuggestion(reserve, estimate.data) : null;
  if (!s || !prefs || prefs.reserveRefreshDismissed === s.newBaseCents) return null;
  const later = () => {
    if (user) updatePrefs(user.id, { reserveRefreshDismissed: s.newBaseCents }, auth.mode !== 'demo');
  };
  return (
    <Banner tone="info" icon={RefreshCw}>
      <View style={{ gap: space[2] }}>
        <Txt variant="label" style={{ fontFamily: fonts.bold }}>
          {R.refreshTitle}
        </Txt>
        <Txt variant="label">{maskMoneyText(R.refreshBody(s.averageMonths, s.newBaseCents, s.currentBaseCents), hidden)}</Txt>
        <Txt variant="caption" color={colors.textSecondary}>
          {R.refreshNote}
        </Txt>
        <Button
          label={R.refreshAction}
          tone="soft"
          onPress={() => router.push({ pathname: '/reserva', params: { essenciais: String(s.newBaseCents), meses: String(s.months) } })}
        />
        <LinkButton label={R.refreshLater} onPress={later} style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }} />
      </View>
    </Banner>
  );
}
