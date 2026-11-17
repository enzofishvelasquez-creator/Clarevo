import { EXTRA_INCOME_ASK_TEXT, extraIncomeOfRecord, organizeGoals, recordMonth, type FinancialRecord } from '@clarevo/core';
import { router } from 'expo-router';
import { PiggyBank, Plus } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { Button, Card, LinkButton, Txt } from '@/components/ui';
import { updatePrefs } from '@/lib/device-prefs';
import { useCommittedSummary, useGoals, useMonthRecords } from '@/state/data';
import { useSession } from '@/state/session';
import { colors, space } from '@/theme/tokens';

/** Quantas metas a pergunta mostra (a reserva primeiro, depois as metas na ordem escolhida). */
const MAX_GOALS = 5;

/**
 * "Separar parte para uma meta?" (D-105), no detalhe do recebimento logo depois de salvar, quando ele não é o de sempre
 * (`extraIncomeOfRecord`: a mesma regra do lembrete de valor extra, D-078 F). Estende o lembrete, sem duplicar: sem valor sugerido e sem
 * meta marcada, cada meta é um botão que abre o aporte com o valor vazio; sem meta, "Criar uma meta". Escolher uma meta ou "Agora não"
 * esconde também o lembrete de valor extra do Resumo até o mês seguinte (a mesma pergunta não aparece duas vezes no mês). Nada é gravado
 * no servidor por esta pergunta. Enquanto os dados carregam, ou se a leitura falha, a pergunta não aparece.
 */
export function ExtraIncomeAsk({ record, canWrite }: { record: FinancialRecord; canWrite: boolean }) {
  const { user, auth } = useSession();
  const [answered, setAnswered] = useState(false);
  const month = recordMonth(record);
  const on = canWrite && record.kind === 'receita' && !answered;
  const records = useMonthRecords(on ? record.contextId : undefined, month);
  const committed = useCommittedSummary(on ? record.contextId : undefined, month);
  const goals = useGoals(on ? record.contextId : undefined);
  if (!on || !records.data || committed.data === undefined || !goals.data) return null;
  const share = extraIncomeOfRecord(record, records.data, committed.data?.referenceCents ?? null);
  if (share === 0) return null;
  const { reserve, active } = organizeGoals(goals.data);
  const list = [...(reserve && reserve.status === 'ativa' ? [reserve] : []), ...active].slice(0, MAX_GOALS);
  const T = EXTRA_INCOME_ASK_TEXT;
  const answer = () => {
    setAnswered(true);
    if (user) updatePrefs(user.id, { extraSavingsDismissedMonth: month }, auth.mode !== 'demo');
  };

  return (
    <Card style={{ gap: space[3] }}>
      <View style={{ flexDirection: 'row', gap: space[2], alignItems: 'center' }}>
        <PiggyBank size={22} color={colors.brandText} aria-hidden />
        <Txt variant="title" accessibilityRole="header" aria-level={2} style={{ flex: 1 }}>
          {T.title}
        </Txt>
      </View>
      <Txt>{T.body}</Txt>
      <Txt variant="caption" color={colors.textSecondary}>
        {T.basis}
      </Txt>
      {list.length > 0 ? (
        list.map((g) => (
          <Button
            key={g.id}
            label={g.name}
            accessibilityLabel={T.goalA11y(g.name)}
            tone="soft"
            onPress={() => {
              answer();
              router.push({ pathname: '/meta/[id]/movimento', params: { id: g.id, tipo: 'aporte', origem: 'valor-extra' } });
            }}
          />
        ))
      ) : (
        <Button
          label={T.noGoal}
          icon={Plus}
          tone="soft"
          onPress={() => {
            answer();
            router.push('/meta/nova');
          }}
        />
      )}
      <LinkButton label={T.later} accessibilityLabel={T.laterA11y} style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }} onPress={answer} />
    </Card>
  );
}
