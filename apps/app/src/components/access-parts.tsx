import {
  ACCESS_TEXT,
  PLAN_NAME,
  SUBSCRIBE_OPEN,
  WEB_SUBSCRIPTION_TEXT,
  accessBanner,
  accessView,
  deviceTimeZone,
  planPrice,
  type Access,
  type PlanKind,
} from '@clarevo/core';
import { router } from 'expo-router';
import { AlertCircle, CreditCard, Hourglass, LockKeyhole } from 'lucide-react-native';
import { useState } from 'react';
import { Platform, View } from 'react-native';

import { Banner, Button, Card, LinkButton, Txt } from '@/components/ui';
import { useAccess } from '@/state/access';
import { useSpace } from '@/state/data';
import { useRepo } from '@/state/session';
import { colors, fonts, space } from '@/theme/tokens';

const T = ACCESS_TEXT;
const W = WEB_SUBSCRIPTION_TEXT;

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

/**
 * Os botões de assinar na web (D-084): a função do servidor cria o Checkout do Asaas e a página de pagamento abre nesta mesma aba; o
 * Asaas devolve a pessoa a /conta/assinatura?pagamento=... No app das lojas nada disto aparece (lá a assinatura é pela loja). Só para
 * quem pode assinar: no teste, em só leitura ou coberta pelo Plano Família de outra pessoa.
 */
function WebSubscribeButtons({ access, webTest }: { access: Access; webTest: boolean }) {
  const repo = useRepo();
  const [busy, setBusy] = useState<PlanKind | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  // No teste do sandbox (antes do início da cobrança, todo mundo está em pre_lancamento), os botões aparecem também nessa situação.
  if (access.status !== 'teste' && access.status !== 'leitura' && access.status !== 'familia' && !(webTest && access.status === 'pre_lancamento')) return null;
  const subscribe = async (plan: PlanKind) => {
    if (busy) return;
    setMsg(null);
    setBusy(plan);
    try {
      const r = await repo.startWebSubscription(plan);
      if (r.result === 'checkout') {
        // A página de pagamento abre no lugar do app; o botão fica ocupado até a troca.
        window.location.assign(r.url);
        return;
      }
      setMsg(W.errors[r.result]);
    } catch {
      setMsg(W.errors.tente_de_novo);
    }
    setBusy(null);
  };
  return (
    <View style={{ gap: space[3] }}>
      <Txt variant="caption" color={colors.textSecondary}>
        {W.howItWorks}
      </Txt>
      {T.plans.map((p) => (
        <Button
          key={p.plan}
          label={W.subscribe(p.plan)}
          icon={CreditCard}
          tone={p.plan === 'individual' ? 'brand' : 'soft'}
          busy={busy === p.plan}
          busyLabel={W.subscribeBusy}
          disabled={busy !== null && busy !== p.plan}
          onPress={() => void subscribe(p.plan)}
        />
      ))}
      <Txt variant="caption" color={colors.textSecondary}>
        {W.afterPayment}
      </Txt>
      {msg ? (
        <Banner tone="erro" icon={AlertCircle}>
          <Txt variant="label" color={colors.error}>
            {msg}
          </Txt>
        </Banner>
      ) : null}
    </View>
  );
}

/**
 * Os planos e os preços, para quem ainda não paga nem tem quem pague. Na web, com a compra aberta (SUBSCRIBE_OPEN), os botões de assinar.
 * `webTest`: o teste da equipe no sandbox do Asaas antes de abrir (`/conta/assinatura?assinar=teste`, docs/39): mostra os botões com a
 * compra fechada. Só faz diferença enquanto a função do servidor tem a chave do sandbox, que não cobra ninguém. `subscribeHidden`: a
 * pessoa acabou de pagar (`?pagamento=sucesso`) e o aviso do Asaas ainda não chegou: sem botões, para não abrir um segundo Checkout.
 */
export function PlansCard({ access, webTest = false, subscribeHidden = false }: { access: Access; webTest?: boolean; subscribeHidden?: boolean }) {
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
        {Platform.OS === 'web' ? T.howToPay : T.howToPayStore}
      </Txt>
      {(SUBSCRIBE_OPEN || webTest) && Platform.OS === 'web' && !subscribeHidden ? <WebSubscribeButtons access={access} webTest={webTest} /> : null}
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
