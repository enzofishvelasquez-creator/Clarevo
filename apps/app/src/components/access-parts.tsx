import {
  ACCESS_TEXT,
  PLAN_NAME,
  SUBSCRIBE_OPEN,
  accessBanner,
  accessView,
  deviceTimeZone,
  planPrice,
  type Access,
} from '@clarevo/core';
import { router } from 'expo-router';
import { CreditCard, Hourglass, LockKeyhole } from 'lucide-react-native';
import { View } from 'react-native';

import { Banner, Button, Card, LinkButton, Txt } from '@/components/ui';
import { useAccess } from '@/state/access';
import { useSpace } from '@/state/data';
import { colors, fonts, space } from '@/theme/tokens';

const T = ACCESS_TEXT;

/** O fuso da pessoa (o do espaço; sem ele, o do aparelho), para as datas do teste e da renovação. */
export function useAccessTimeZone(): string {
  return useSpace().data?.timeZone ?? deviceTimeZone();
}

/** Linha "Situação: Teste grátis", lida inteira pelo leitor de tela. */
export function AccessSituation({ situation }: { situation: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space[3] }} accessible accessibilityLabel={`${T.situation}: ${situation}`}>
      <Txt variant="label" color={colors.textSecondary}>
        {T.situation}
      </Txt>
      <Txt variant="label" style={{ fontFamily: fonts.bold, flexShrink: 1, textAlign: 'right' }}>
        {situation}
      </Txt>
    </View>
  );
}

/**
 * Aviso da assinatura no Resumo (D-083): nos últimos dias do teste grátis e em só ver e exportar, com o atalho para os planos. Nas
 * outras situações (e enquanto carrega ou se a leitura falhar), nada aparece.
 */
export function AccessBanner() {
  const access = useAccess().data;
  const timeZone = useAccessTimeZone();
  const banner = access ? accessBanner(access, new Date(), timeZone) : null;
  if (!banner) return null;
  return (
    <Banner tone="info" icon={access?.status === 'leitura' ? LockKeyhole : Hourglass} live={false}>
      <Txt variant="label">{banner.text}</Txt>
      <LinkButton label={T.bannerAction} onPress={() => router.push('/conta/assinatura')} style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }} />
    </Banner>
  );
}

/** Card "Assinatura" em Conta: a situação, a explicação curta e o botão da tela Assinatura. */
export function AccessCard() {
  const access = useAccess();
  const timeZone = useAccessTimeZone();
  const view = access.data ? accessView(access.data, new Date(), timeZone) : null;
  return (
    <Card style={{ gap: space[3] }}>
      <Txt variant="title" accessibilityRole="header" aria-level={2}>
        {T.cardTitle}
      </Txt>
      {view ? (
        <>
          <AccessSituation situation={view.situation} />
          <Txt variant="caption" color={colors.textSecondary}>
            {view.body}
          </Txt>
        </>
      ) : access.isError ? (
        <Txt variant="caption" color={colors.textSecondary}>
          {T.loadFailed}
        </Txt>
      ) : null}
      <Button label={T.cardOpen} icon={CreditCard} tone="soft" onPress={() => router.push('/conta/assinatura')} />
    </Card>
  );
}

/** Os planos e os preços, para quem ainda não paga nem tem quem pague. Sem botão de assinar até a compra abrir (SUBSCRIBE_OPEN). */
export function PlansCard({ access }: { access: Access }) {
  return (
    <Card style={{ gap: space[3] }}>
      <Txt variant="title" accessibilityRole="header" aria-level={2}>
        {T.plansTitle}
      </Txt>
      {T.plans.map((p) => (
        <View key={p.plan} style={{ gap: space[1] }} accessible accessibilityLabel={`Plano ${PLAN_NAME[p.plan]}, ${planPrice(p.plan)}. ${p.who}`}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space[3] }}>
            <Txt variant="label" style={{ fontFamily: fonts.bold }}>
              {PLAN_NAME[p.plan]}
            </Txt>
            <Txt variant="label" style={{ fontFamily: fonts.bold, flexShrink: 1, textAlign: 'right' }}>
              {planPrice(p.plan)}
            </Txt>
          </View>
          <Txt variant="caption" color={colors.textSecondary}>
            {p.who}
          </Txt>
        </View>
      ))}
      <Txt variant="caption" color={colors.textSecondary}>
        {T.plansNote}
      </Txt>
      <Txt variant="caption" color={colors.textSecondary}>
        {T.howToPay}
      </Txt>
      {SUBSCRIBE_OPEN ? null : (
        <Txt variant="caption" style={{ fontFamily: fonts.bold }}>
          {T.notOpenYet}
        </Txt>
      )}
      {access.status === 'teste' || access.status === 'leitura' ? (
        <Txt variant="caption" color={colors.textSecondary}>
          {T.readOnlyWhat}
        </Txt>
      ) : null}
    </Card>
  );
}
