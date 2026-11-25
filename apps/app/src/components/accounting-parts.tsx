import { ACCOUNTING_TEXT } from '@clarevo/core';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { ContextPill, SubHeader } from '@/components/header';
import { LoadingState } from '@/components/states';
import { Button, Card, Screen, Txt } from '@/components/ui';
import { colors, space } from '@/theme/tokens';

const A = ACCOUNTING_TEXT;

/** Volta: para a tela de antes ou, aberta direto pelo endereço, para Conta. */
export function leaveAccounting() {
  if (router.canGoBack()) router.back();
  else router.replace('/conta');
}

/**
 * A moldura das telas da Contabilidade (D-123): o cabeçalho com voltar, a pílula "Contabilidade" (a área, fora dos espaços; na
 * demonstração, "Demonstração · Contabilidade") e o conteúdo rolável. O estado neutro não tem pílula.
 */
export function AccountingShell({ title, pill = true, children }: { title: string; pill?: boolean; children: ReactNode }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SubHeader title={title} onBack={leaveAccounting} right={pill ? <ContextPill label={A.context} fixed /> : undefined} />
      <Screen contentStyle={{ padding: space[5], gap: space[4] }}>{children}</Screen>
    </View>
  );
}

/**
 * Enquanto a chave do Plus e a lista são lidas (a tela pode abrir pelo endereço com o Plus fechado): o quadro neutro, sem pílula e sem
 * nenhum texto da Contabilidade.
 */
export function AccountingPending() {
  return (
    <AccountingShell title={A.pendingTitle} pill={false}>
      <LoadingState label={A.pendingLabel} />
    </AccountingShell>
  );
}

/**
 * O estado vazio neutro das telas /contabilidade* (D-123): com o Plus fechado, ou sem negócio acompanhado, nada do Plus é dito; só a volta
 * para Conta.
 */
export function AccountingNeutral() {
  return (
    <AccountingShell title={A.neutralTitle} pill={false}>
      <Card style={{ gap: space[3] }}>
        <Txt color={colors.textSecondary}>{A.neutralBody}</Txt>
        <Button label={A.goBack} tone="soft" onPress={() => router.replace('/conta')} />
      </Card>
    </AccountingShell>
  );
}
