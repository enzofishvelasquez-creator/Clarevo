import {
  BENEFIT_PLAN_LABEL,
  BENEFIT_TEXT,
  accessUntilDay,
  dayOf,
  deviceTimeZone,
  formatDateBR,
  licenseCodeFromText,
  type Benefit,
} from '@clarevo/core';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useIsSeededDemo } from '@/components/family-parts';
import { Button, Card, TextField, Txt } from '@/components/ui';
import { useMyBenefit } from '@/state/company';
import { useSession } from '@/state/session';
import { colors, fonts, space } from '@/theme/tokens';

const T = BENEFIT_TEXT;

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space[3] }} accessible accessibilityLabel={`${label}: ${value}`}>
      <Txt variant="label" color={colors.textSecondary}>
        {label}
      </Txt>
      <Txt variant="label" style={{ fontFamily: fonts.bold, flexShrink: 1, textAlign: 'right' }}>
        {value}
      </Txt>
    </View>
  );
}

/**
 * "Benefício pela empresa" em Conta (D-056): a organização, o plano, desde quando e, se encerrado, até quando vale o acesso pleno
 * (30 dias depois do fim, M-4). Sem benefício, "Tenho um convite da empresa" para colar o link, como "Tenho um convite" da Família.
 * A empresa não vê nada da pessoa além disso; a conta, o histórico e a Família continuam com ela quando o benefício acaba.
 */
export function BenefitCard() {
  const benefit = useMyBenefit();
  const { today } = useSession();
  const demo = useIsSeededDemo();
  const [pasted, setPasted] = useState('');
  const [pasteError, setPasteError] = useState<string | undefined>();

  function seeInvite() {
    const code = licenseCodeFromText(pasted);
    if (!code) {
      setPasteError(T.pasteInvalid);
      return;
    }
    setPasteError(undefined);
    setPasted('');
    router.push({ pathname: '/beneficio/[codigo]', params: { codigo: code } });
  }

  // Carregando ou com falha de leitura: o card não afirma nada (nem "sem benefício").
  if (!benefit.data && !benefit.isSuccess) return null;
  const data: Benefit | null = benefit.data ?? null;
  const tz = deviceTimeZone();

  return (
    <Card style={{ gap: space[3] }}>
      <Txt variant="title" accessibilityRole="header" aria-level={2}>
        {T.accountTitle}
      </Txt>
      {data ? (
        <>
          <Row label={T.organization} value={data.organizationName} />
          <Row label={T.plan} value={BENEFIT_PLAN_LABEL[data.plan]} />
          <Row label={T.since} value={formatDateBR(dayOf(data.activatedAt, tz))} />
          {data.status === 'ativa' ? (
            <>
              <Row label={T.situation} value={T.active} />
              {data.contractEndsOn ? <Txt variant="caption" color={colors.textSecondary}>{T.contractUntil(data.contractEndsOn)}</Txt> : null}
            </>
          ) : (
            <>
              <Row label={T.situation} value={T.endedLine(dayOf(data.endedAt!, tz))} />
              {data.accessUntil ? <EndedAccess accessUntil={data.accessUntil} today={today} /> : null}
              <Txt variant="caption" color={colors.textSecondary}>
                {T.keepsData}
              </Txt>
            </>
          )}
        </>
      ) : (
        <>
          <Txt variant="caption" color={colors.textSecondary}>
            {demo ? T.demoOnly : T.accountNone}
          </Txt>
          {demo ? null : (
            <>
              <Txt variant="label" style={{ fontFamily: fonts.bold }} accessibilityRole="header" aria-level={3}>
                {T.haveInvite}
              </Txt>
              <TextField
                label={T.pasteLabel}
                hint={T.pasteHint}
                value={pasted}
                onChangeText={(t) => {
                  setPasted(t);
                  setPasteError(undefined);
                }}
                error={pasteError}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="go"
                onSubmitEditing={seeInvite}
              />
              <Button label={T.pasteSubmit} tone="soft" disabled={pasted.trim() === ''} onPress={seeInvite} />
            </>
          )}
        </>
      )}
    </Card>
  );
}

/** Depois do fim: até quando vale o acesso pleno e, passada essa data, o plano gratuito com leitura do histórico. */
function EndedAccess({ accessUntil, today }: { accessUntil: string; today: string }) {
  const day = accessUntilDay(accessUntil, deviceTimeZone())!;
  return (
    <Txt variant="label" style={{ fontFamily: fonts.bold }}>
      {day >= today ? T.fullAccessUntil(day) : T.freePlan(day)}
    </Txt>
  );
}
