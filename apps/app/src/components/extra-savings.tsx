import { EXTRA_SAVINGS_TEXT, extraIncomeOfMonth, organizeGoals, type FinancialRecord, type IsoMonth } from '@clarevo/core';
import { router } from 'expo-router';
import { PiggyBank } from 'lucide-react-native';
import { View } from 'react-native';

import { MoneyTxt } from '@/components/money-text';
import { Button, Card, LinkButton, Txt } from '@/components/ui';
import { updatePrefs, useDevicePrefs } from '@/lib/device-prefs';
import { useCommittedSummary, useGoals } from '@/state/data';
import { useSession } from '@/state/session';
import { colors, space } from '@/theme/tokens';

/**
 * Lembrete de valor extra no Resumo (D-078 F): só para quem escolheu "Guardar quando entrar um valor extra" na reserva mínima (a
 * escolha fica neste aparelho), no Pessoal e no mês atual, quando o mês tem dinheiro a mais (`extraIncomeOfMonth`). "Guardar uma
 * parte" abre o aporte da reserva (ou a reserva mínima, se ainda não existe); "Agora não" esconde até o mês seguinte; "Parar de
 * lembrar" desliga. Não grava nada no servidor.
 */
export function ExtraSavingsCard({
  contextId,
  month,
  eligible,
  records,
  onNotice,
}: {
  contextId: string | undefined;
  month: IsoMonth;
  eligible: boolean;
  records: readonly FinancialRecord[] | undefined;
  onNotice: (text: string) => void;
}) {
  const { user, auth } = useSession();
  const prefs = useDevicePrefs(user?.id);
  const on = eligible && prefs?.extraSavingsReminder === true && prefs.extraSavingsDismissedMonth !== month;
  const committed = useCommittedSummary(on ? contextId : undefined, month);
  const goals = useGoals(on ? contextId : undefined);
  if (!on || !user || !records || committed.data === undefined) return null;
  const extra = extraIncomeOfMonth(records, month, committed.data?.referenceCents ?? null);
  if (extra === 0) return null;
  const reserve = goals.data ? organizeGoals(goals.data).reserve : null;
  const persist = auth.mode !== 'demo';

  return (
    <Card style={{ gap: space[3] }}>
      <View style={{ flexDirection: 'row', gap: space[2], alignItems: 'center' }}>
        <PiggyBank size={22} color={colors.brand} aria-hidden />
        <Txt variant="title" accessibilityRole="header" aria-level={2} style={{ flex: 1 }}>
          {EXTRA_SAVINGS_TEXT.title}
        </Txt>
      </View>
      <MoneyTxt>{EXTRA_SAVINGS_TEXT.body(extra)}</MoneyTxt>
      <Txt variant="caption" color={colors.textSecondary}>
        {EXTRA_SAVINGS_TEXT.basis}
      </Txt>
      <Button
        label={reserve ? EXTRA_SAVINGS_TEXT.save : EXTRA_SAVINGS_TEXT.createReserve}
        tone="soft"
        onPress={() =>
          reserve ? router.push({ pathname: '/meta/[id]/movimento', params: { id: reserve.id, tipo: 'aporte' } }) : router.push('/guardar/minima')
        }
      />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: space[4] }}>
        <LinkButton label={EXTRA_SAVINGS_TEXT.later} onPress={() => updatePrefs(user.id, { extraSavingsDismissedMonth: month }, persist)} />
        <LinkButton
          label={EXTRA_SAVINGS_TEXT.stop}
          onPress={() => {
            updatePrefs(user.id, { extraSavingsReminder: false }, persist);
            onNotice(EXTRA_SAVINGS_TEXT.stopped);
          }}
        />
      </View>
    </Card>
  );
}
