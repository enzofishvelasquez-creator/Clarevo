import {
  ACCESS_TEXT,
  PLAN_NAME,
  STORE_SUBSCRIPTION_TEXT,
  SUBSCRIBE_OPEN,
  WEB_SUBSCRIPTION_TEXT,
  accessBanner,
  accessView,
  canSubscribeInStore,
  deviceTimeZone,
  isStoreSubscription,
  planPrice,
  type Access,
  type PlanKind,
  type StorePurchaseResult,
} from '@clarevo/core';
import { router } from 'expo-router';
import { AlertCircle, CheckCircle2, CreditCard, ExternalLink, Hourglass, Info, LockKeyhole, RefreshCw } from 'lucide-react-native';
import { useState } from 'react';
import { Platform, View } from 'react-native';

import { Banner, Button, Card, LinkButton, Txt } from '@/components/ui';
import { SITE_URL, openSitePage } from '@/lib/site';
import { DEVICE_STORE, STORE_PURCHASES_READY, STORE_TEST, buyPlan, openStoreSubscriptions, restorePurchases } from '@/lib/store-purchases';
import { useAccess, useReloadAccess } from '@/state/access';
import { useSpace } from '@/state/data';
import { useRepo, useSession } from '@/state/session';
import { colors, fonts, space } from '@/theme/tokens';

const T = ACCESS_TEXT;
const W = WEB_SUBSCRIPTION_TEXT;
const S = STORE_SUBSCRIPTION_TEXT;

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

type StoreMsg = { tone: 'erro' | 'sucesso' | 'info'; text: string; refresh: boolean } | null;

/** O aviso depois de tocar na compra: nada quando a pessoa cancelou na loja. */
function purchaseMessage(r: StorePurchaseResult, changing: boolean): StoreMsg {
  if (r === 'cancelado') return null;
  if (r === 'comprado') return { tone: 'sucesso', text: changing ? S.changed : S.purchased, refresh: true };
  if (r === 'pendente') return { tone: 'info', text: S.pending, refresh: true };
  return { tone: 'erro', text: S.errors[r], refresh: false };
}

/**
 * Depois de uma compra ou de "Restaurar compras": a função do servidor consulta o RevenueCat e atualiza o direito, e a tela recarrega
 * a situação. Se a função falhar, o aviso do RevenueCat chega logo depois, e "Atualizar" mostra.
 */
function useStoreFollowUp() {
  const repo = useRepo();
  const reload = useReloadAccess();
  return async () => {
    await repo.syncStoreSubscription().catch(() => 'tente_de_novo' as const);
    await reload();
  };
}

function StoreMessage({ msg }: { msg: StoreMsg }) {
  const reload = useReloadAccess();
  if (!msg) return null;
  const icon = msg.tone === 'erro' ? AlertCircle : msg.tone === 'sucesso' ? CheckCircle2 : Info;
  return (
    <Banner tone={msg.tone} icon={icon}>
      <Txt variant="label" color={msg.tone === 'erro' ? colors.error : colors.text}>
        {msg.text}
      </Txt>
      {msg.refresh ? <LinkButton label={S.refresh} onPress={() => void reload()} style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }} /> : null}
    </Banner>
  );
}

/** Os Termos de uso e a Política de privacidade junto da compra, como as lojas pedem (só com o endereço do site configurado). */
function StoreLegalLinks() {
  const [failed, setFailed] = useState(false);
  if (!SITE_URL) return null;
  const open = async (page: 'termos' | 'privacidade') => setFailed(!(await openSitePage(page)));
  return (
    <View style={{ gap: space[1] }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: space[4] }}>
        <LinkButton label={S.terms} onPress={() => void open('termos')} style={{ paddingHorizontal: 0 }} />
        <LinkButton label={S.privacy} onPress={() => void open('privacidade')} style={{ paddingHorizontal: 0 }} />
      </View>
      {failed ? (
        <Txt variant="caption" color={colors.error}>
          {S.legalOpenFailed}
        </Txt>
      ) : null}
    </View>
  );
}

/**
 * Os botões de assinar pela loja (D-090), no iPhone e no Android: a compra abre a folha da App Store ou do Google Play, e depois a
 * função do servidor sincroniza. Antes, o preço, a renovação mensal automática e como cancelar, com os Termos e a Política; depois,
 * "Restaurar compras". Só para quem pode assinar (antes do início da cobrança, no teste, em só leitura ou coberta pelo Plano Família de
 * outra pessoa), com a chave do RevenueCat e o endereço do site no build. Na web nada disto aparece.
 */
function StoreSubscribeButtons({ access }: { access: Access }) {
  const { user } = useSession();
  const followUp = useStoreFollowUp();
  const [busy, setBusy] = useState<PlanKind | 'restaurar' | null>(null);
  const [msg, setMsg] = useState<StoreMsg>(null);
  // Sem o endereço do site não há os links dos Termos e da Política, que as lojas pedem junto da compra: sem eles, sem os botões.
  if (!DEVICE_STORE || !STORE_PURCHASES_READY || !SITE_URL || !user || !canSubscribeInStore(access.status)) return null;
  const store = DEVICE_STORE;
  const subscribe = async (plan: PlanKind) => {
    if (busy) return;
    setMsg(null);
    setBusy(plan);
    const r = await buyPlan(user.id, plan);
    if (r === 'comprado' || r === 'pendente') await followUp();
    setMsg(purchaseMessage(r, false));
    setBusy(null);
  };
  const restore = async () => {
    if (busy) return;
    setMsg(null);
    setBusy('restaurar');
    const r = await restorePurchases(user.id);
    if (r === 'restaurado') {
      await followUp();
      setMsg({ tone: 'sucesso', text: S.restored, refresh: true });
    } else if (r === 'nada') {
      setMsg({ tone: 'info', text: S.restoreNone, refresh: false });
    } else {
      setMsg({ tone: 'erro', text: S.errors[r], refresh: false });
    }
    setBusy(null);
  };
  return (
    <View style={{ gap: space[3] }}>
      <Txt variant="caption" color={colors.textSecondary}>
        {S.howItWorks(store)}
      </Txt>
      {T.plans.map((p) => (
        <Button
          key={p.plan}
          label={S.subscribe(p.plan)}
          icon={CreditCard}
          tone={p.plan === 'individual' ? 'brand' : 'soft'}
          busy={busy === p.plan}
          busyLabel={S.subscribeBusy}
          disabled={busy !== null && busy !== p.plan}
          onPress={() => void subscribe(p.plan)}
        />
      ))}
      <Txt variant="caption" color={colors.textSecondary}>
        {S.autoRenew}
      </Txt>
      <StoreLegalLinks />
      <Txt variant="caption" color={colors.textSecondary}>
        {S.restoreHint}
      </Txt>
      <Button
        label={S.restore}
        icon={RefreshCw}
        tone="soft"
        busy={busy === 'restaurar'}
        busyLabel={S.restoreBusy}
        disabled={busy !== null && busy !== 'restaurar'}
        onPress={() => void restore()}
      />
      <StoreMessage msg={msg} />
    </View>
  );
}

/**
 * Para quem assina por esta loja (D-090): os ajustes de assinatura da loja (cancelar é lá) e a troca de plano, que abre a folha da
 * loja. A assinatura feita na outra loja ou na web se gerencia onde foi feita (o texto da situação já diz).
 */
export function StoreManageCard({ access }: { access: Access }) {
  const { user } = useSession();
  const followUp = useStoreFollowUp();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<StoreMsg>(null);
  if (!DEVICE_STORE || !isStoreSubscription(access.status, access.provider, DEVICE_STORE)) return null;
  const store = DEVICE_STORE;
  const current = access.plan;
  const other: PlanKind | null = current === 'individual' ? 'familiar' : current === 'familiar' ? 'individual' : null;
  const manage = async () => {
    setMsg(null);
    if (!(await openStoreSubscriptions())) setMsg({ tone: 'erro', text: S.manageFailed, refresh: false });
  };
  const change = async (plan: PlanKind) => {
    if (busy || !user) return;
    setMsg(null);
    setBusy(true);
    const r = await buyPlan(user.id, plan, current);
    if (r === 'comprado' || r === 'pendente') await followUp();
    setMsg(purchaseMessage(r, true));
    setBusy(false);
  };
  return (
    <Card style={{ gap: space[3] }}>
      <Txt variant="caption" color={colors.textSecondary}>
        {S.manageHint(store)}
      </Txt>
      <Button label={S.manage(store)} icon={ExternalLink} tone="soft" onPress={() => void manage()} />
      {other && STORE_PURCHASES_READY && user ? (
        <>
          <Button label={S.changePlan(other)} tone="soft" busy={busy} busyLabel={S.changeBusy} onPress={() => void change(other)} />
          <Txt variant="caption" color={colors.textSecondary}>
            {S.changeNote}
          </Txt>
        </>
      ) : null}
      <StoreMessage msg={msg} />
    </Card>
  );
}

/**
 * Os planos e os preços, para quem ainda não paga nem tem quem pague. Com a compra aberta (SUBSCRIBE_OPEN), os botões de assinar: na web,
 * pelo Asaas (D-084); no iPhone e no Android, pela loja (D-090; também no build de teste da equipe, STORE_TEST).
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
      {(SUBSCRIBE_OPEN || STORE_TEST) && Platform.OS !== 'web' ? <StoreSubscribeButtons access={access} /> : null}
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
