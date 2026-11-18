import {
  ERROR_TEXT,
  INVESTMENT_REMINDER_TEXT,
  dueItems,
  isInvestmentReminderKind,
  monthOf,
  valueUpdateDue,
  type Investment,
  type InvestmentReminderKind,
} from '@clarevo/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { FlashBanner } from '@/components/flash';
import { ContextPill, SubHeader } from '@/components/header';
import { MoneyTxt } from '@/components/money-text';
import { ErrorState, LoadingState } from '@/components/states';
import { Body, Button, Card, Screen, Txt } from '@/components/ui';
import { useDevicePrefs } from '@/lib/device-prefs';
import { useInvestmentReminderHolds } from '@/lib/investment-reminder-holds';
import { useContextInvestmentMovements, useInvestmentPlan, useInvestments, useSpace } from '@/state/data';
import { useSession } from '@/state/session';
import { colors, space } from '@/theme/tokens';

const T = INVESTMENT_REMINDER_TEXT;

/**
 * Lembrete dos investimentos (D-104, item 6): /investimento/lembrete?tipo=aporte_investimentos|vencimentos|atualizar, aberto pelo toque no
 * aviso do celular. O fato com os valores (só dentro do app, com "Ocultar valores" valendo), os atalhos para registrar em cada investimento
 * e, sem cobrança, "Lembrar de novo em 3 dias", "Pausar este lembrete por 30 dias" e "Retomar este lembrete". Só no Pessoal.
 */
export default function LembreteInvestimentoScreen() {
  const { tipo } = useLocalSearchParams<{ tipo?: string }>();
  const kind: InvestmentReminderKind = isInvestmentReminderKind(tipo) ? tipo : 'atualizar';
  const space_ = useSpace();
  const contextId = space_.data?.personalContextId;
  const list = useInvestments(contextId);
  const plan = useInvestmentPlan(kind === 'aporte_investimentos' ? contextId : undefined);
  const movements = useContextInvestmentMovements(kind === 'aporte_investimentos' ? contextId : undefined);
  const failed = space_.isError || list.isError || plan.isError || movements.isError;
  const ready = list.isSuccess && (kind !== 'aporte_investimentos' || (plan.isSuccess && movements.isSuccess));
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SubHeader title={T.screenTitle} onBack={() => (router.canGoBack() ? router.back() : router.replace('/investimentos'))} right={<ContextPill label="Pessoal" fixed />} />
      <Screen>
        <Body>
          {failed ? (
            <ErrorState
              message={ERROR_TEXT.carregar_falhou}
              onRetry={() => {
                space_.refetch();
                list.refetch();
                plan.refetch();
                movements.refetch();
              }}
            />
          ) : !ready ? (
            <LoadingState />
          ) : (
            <Content kind={kind} investments={list.data ?? []} plannedCents={plan.data?.plannedMonthlyCents ?? null} monthDeposits={(movements.data ?? []).filter((m) => m.kind === 'aporte')} />
          )}
        </Body>
      </Screen>
    </View>
  );
}

function Content({
  kind,
  investments,
  plannedCents,
  monthDeposits,
}: {
  kind: InvestmentReminderKind;
  investments: readonly Investment[];
  plannedCents: number | null;
  monthDeposits: readonly { amountCents: number; occurredOn: string }[];
}) {
  const { today, user } = useSession();
  const prefs = useDevicePrefs(user?.id);
  const holds = useInvestmentReminderHolds();
  const [notice, setNotice] = useState<string | null>(null);
  const active = investments.filter((i) => i.status === 'ativo');
  const go = (id: string, tipo: 'aporte' | 'valor' | 'resgate') => router.push({ pathname: '/investimento/[id]/movimento', params: { id, tipo } });
  const state = holds.state(kind);
  const stateLine = T.stateLine(state);

  let body: React.ReactNode;
  if (kind === 'aporte_investimentos') {
    const month = monthOf(today);
    const sum = monthDeposits.filter((m) => monthOf(m.occurredOn) === month).reduce((a, m) => a + m.amountCents, 0);
    const day = prefs?.depositReminderDay ?? 5;
    body = (
      <>
        {plannedCents === null ? (
          <Txt>{T.aporte.noPlan}</Txt>
        ) : (
          <MoneyTxt variant="label">{Number(today.slice(8, 10)) === day ? T.aporte.today(plannedCents) : T.aporte.otherDay(plannedCents, day)}</MoneyTxt>
        )}
        <MoneyTxt color={colors.textSecondary}>{T.aporte.monthSoFar(month, sum)}</MoneyTxt>
        {active.length === 0 ? (
          <Txt color={colors.textSecondary}>{T.aporte.noActive}</Txt>
        ) : (
          <View style={{ gap: space[2] }}>
            <Txt variant="label" accessibilityRole="header" aria-level={3}>
              {T.aporte.pick}
            </Txt>
            {active.map((i) => (
              <Button key={i.id} label={T.aporte.register(i.name)} tone="soft" onPress={() => go(i.id, 'aporte')} />
            ))}
          </View>
        )}
      </>
    );
  } else if (kind === 'atualizar') {
    const due = active.filter((i) => valueUpdateDue(i, today));
    body =
      due.length === 0 ? (
        <Txt color={colors.textSecondary}>{T.atualizar.none}</Txt>
      ) : (
        <>
          <Txt>{T.atualizar.intro}</Txt>
          {due.map((i) => (
            <View key={i.id} style={{ gap: space[1] }}>
              <Txt variant="label">{T.atualizar.line(i.name, i.lastValueOn, i.lastValueOn ?? i.firstMovementOn!)}</Txt>
              <Button label={T.atualizar.action(i.name)} tone="soft" onPress={() => go(i.id, 'valor')} />
            </View>
          ))}
        </>
      );
  } else {
    const due = dueItems(active, today);
    body =
      due.length === 0 ? (
        <Txt color={colors.textSecondary}>{T.vencimentos.none}</Txt>
      ) : (
        <>
          <Txt>{T.vencimentos.intro}</Txt>
          {due.map((d) => (
            <View key={`${d.investment.id}-${d.on}-${d.release}`} style={{ gap: space[1] }}>
              <Txt variant="label">{T.vencimentos.line(d)}</Txt>
              {d.days <= 0 && !d.release ? <Button label={T.vencimentos.resgate(d.investment.name)} tone="soft" onPress={() => go(d.investment.id, 'resgate')} /> : null}
              <Button
                label={T.vencimentos.open(d.investment.name)}
                tone="ghost"
                onPress={() => router.push({ pathname: '/investimento/[id]', params: { id: d.investment.id } })}
              />
            </View>
          ))}
        </>
      );
  }

  return (
    <>
      <FlashBanner message={notice} />
      <Card style={{ gap: space[3] }}>
        <Txt variant="title" accessibilityRole="header" aria-level={2}>
          {T.kindTitle[kind]}
        </Txt>
        {body}
      </Card>
      <Card style={{ gap: space[3] }}>
        <Txt variant="title" accessibilityRole="header" aria-level={2}>
          {T.holdTitle}
        </Txt>
        {stateLine ? <Txt variant="label">{stateLine}</Txt> : null}
        {state.state === 'ativo' ? (
          <>
            <Button label={T.snooze} tone="soft" onPress={() => setNotice(holds.snooze(kind))} />
            <Button label={T.pause} tone="ghost" onPress={() => setNotice(holds.pause(kind))} />
          </>
        ) : (
          <Button label={T.resume} tone="soft" onPress={() => setNotice(holds.resume(kind))} />
        )}
        <Txt variant="caption" color={colors.textSecondary}>
          {T.note}
        </Txt>
        <Txt variant="caption" color={colors.textSecondary}>
          {T.settingsNote}
        </Txt>
      </Card>
    </>
  );
}
