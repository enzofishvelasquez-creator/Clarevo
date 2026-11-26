import {
  ACCESS_TEXT,
  PLAN_NAME,
  PLAN_PERIOD_TEXT,
  STORE_SUBSCRIPTION_TEXT,
  SUBSCRIBE_OPEN,
  WEB_SUBSCRIPTION_TEXT,
  accessBanner,
  accessPeriod,
  accessView,
  canSubscribeInStore,
  demoInstant,
  deviceTimeZone,
  formatDateBR,
  hasLiveWebEntitlement,
  isStoreSubscription,
  paidStartDay,
  pendingFirstCharge,
  periodSuffix,
  pixCanPayNext,
  pixNextPaymentFrom,
  planPeriodPriceAmount,
  storeChangeDone,
  todayIn,
  trialDaysLeft,
  trialEndRelation,
  TRIAL_WARNING_DAYS,
  type Access,
  type BillingPeriod,
  type PlanKind,
  type StorePurchaseResult,
  type WebSubscriptionStart,
} from '@clarevo/core';
import { router } from 'expo-router';
import { AlertCircle, Check, CheckCircle2, CreditCard, ExternalLink, Hourglass, Info, LockKeyhole, QrCode, RefreshCw, User, Users } from 'lucide-react-native';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { Banner, Button, Card, LinkButton, Txt, spaceKeyPress, styles as ui } from '@/components/ui';
import { PURCHASE_PREVIEW, PURCHASE_PREVIEW_SITE } from '@/lib/capture';
import { SITE_URL, openSitePage } from '@/lib/site';
import { DEVICE_STORE, STORE_PURCHASES_READY, STORE_TEST, buyPlan, openStoreSubscriptions, restorePurchases, type StoreChoice } from '@/lib/store-purchases';
import { useAccess, useOwnWebEntitlements, useReloadAccess, useWebSubscriptionStatus } from '@/state/access';
import { useSpace } from '@/state/data';
import { useRepo, useSession } from '@/state/session';
import { colors, fonts, radius, space } from '@/theme/tokens';

const T = ACCESS_TEXT;
const W = WEB_SUBSCRIPTION_TEXT;
const S = STORE_SUBSCRIPTION_TEXT;

/** O fuso da pessoa (o do espaço; sem ele, o do aparelho), para as datas do teste e da renovação. */
export function useAccessTimeZone(): string {
  return useSpace().data?.timeZone ?? deviceTimeZone();
}

/**
 * O "agora" da situação do acesso: na demonstração, o dia fixo dela (o mesmo do teste grátis, `demoTrialAccess`); numa conta real, o
 * relógio do aparelho.
 */
export function useAccessNow(): Date {
  const { auth, today } = useSession();
  return auth.mode === 'demo' ? demoInstant(today) : new Date();
}

/** Linha "Situação: Teste grátis", lida inteira pelo leitor de tela. */
export function AccessSituation({ situation }: { situation: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space[3] }} accessible accessibilityLabel={`${T.situation}: ${situation}`}>
      <Txt variant="label" color={colors.textSecondary}>
        {T.situation}
      </Txt>
      {/* A situação num selo lima, como no alto da tela Assinatura (12/11/2026). */}
      <View style={{ flexShrink: 1, backgroundColor: colors.accent, borderRadius: 999, paddingHorizontal: space[3], paddingVertical: space[1] }}>
        <Txt variant="label" color={colors.textOnAccent} style={{ fontFamily: fonts.bold, textAlign: 'right' }}>
          {situation}
        </Txt>
      </View>
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
  const now = useAccessNow();
  // Quem assinou no cartão durante o teste (D-129): nos últimos dias do teste, o aviso diz o dia da primeira cobrança. Só o próprio direito,
  // no banco, e só quando o aviso do teste apareceria (nada do Asaas no Resumo).
  const trialEnding = access?.status === 'teste' && (trialDaysLeft(access, now, timeZone) ?? Infinity) <= TRIAL_WARNING_DAYS;
  const ents = useOwnWebEntitlements(trialEnding);
  const firstCharge = trialEnding && ents.data ? pendingFirstCharge(ents.data, now) : null;
  const banner = access ? accessBanner(access, now, timeZone, { web: Platform.OS === 'web', firstCharge }) : null;
  if (!banner) return null;
  return (
    <Banner tone="info" icon={access?.status === 'leitura' ? LockKeyhole : Hourglass} live={false}>
      <Txt variant="label">{banner.text}</Txt>
      <LinkButton label={banner.action ?? T.bannerAction} onPress={() => router.push('/conta/assinatura')} style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }} />
    </Banner>
  );
}

/** Quem pode ter assinatura no cartão da web: no teste grátis (pode ter assinado no teste, D-129) e quem assina pela web. */
function mayHaveWebSubscription(access: Access | undefined): boolean {
  return access?.status === 'teste' || (access?.status === 'assinatura' && access.provider === 'web');
}

/**
 * A assinatura no cartão da web de quem pode ter uma (D-129): primeiro o próprio direito, no banco (`useOwnWebEntitlements`, sem gastar a
 * cota do Asaas); a situação no Asaas (`situacao`) só na web e só com um direito pela web que vale (ou quem o banco já diz assinar pela web).
 * `firstCharge`: o dia da primeira cobrança ainda não paga de quem assinou no teste (antes do dia e no próprio dia, até a confirmação do
 * cartão); cancelada no Asaas, nenhum.
 */
export function useWebSubscriptionState(access: Access | undefined, now: Date) {
  const may = mayHaveWebSubscription(access);
  const entitlements = useOwnWebEntitlements(may);
  const live = entitlements.data ? hasLiveWebEntitlement(entitlements.data, now) : false;
  const reads = Platform.OS === 'web' && may && (live || (access?.status === 'assinatura' && access.provider === 'web'));
  const status = useWebSubscriptionStatus(reads);
  const firstCharge = may && entitlements.data ? pendingFirstCharge(entitlements.data, now, status.data?.active === false) : null;
  return { entitlements, live, reads, status, firstCharge };
}

/** Card "Assinatura" em Conta: a situação, a explicação curta e o botão da tela Assinatura. */
export function AccessCard() {
  const access = useAccess();
  const timeZone = useAccessTimeZone();
  const now = useAccessNow();
  const web = useWebSubscriptionState(access.data, now);
  const view = access.data
    ? accessView(access.data, now, timeZone, { web: Platform.OS === 'web', webSubscription: web.reads ? web.status.data : null, firstCharge: web.firstCharge })
    : null;
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
 * Quem pode assinar na web (D-084): no teste, em só leitura ou coberta pelo Plano Família de outra pessoa; no teste do sandbox (antes do
 * início da cobrança, todo mundo está em pre_lancamento), também nessa situação.
 */
function canSubscribeOnWeb(access: Access, webTest: boolean): boolean {
  return access.status === 'teste' || access.status === 'leitura' || access.status === 'familia' || (webTest && access.status === 'pre_lancamento');
}

/**
 * Os botões de assinar na web (D-084): a função do servidor cria o Checkout do Asaas e a página de pagamento abre nesta mesma aba; o
 * Asaas devolve a pessoa a /conta/assinatura?pagamento=... No app das lojas nada disto aparece (lá a assinatura é pela loja). Só para
 * quem pode assinar (`canSubscribeOnWeb`). Antes dos botões do cartão, como na tela das lojas (análise geral de 26/11/2026, D-129): a
 * cobrança do período escolhido, a renovação automática, como cancelar e quem guarda os dados do cartão; antes dos do Pix, que ele não
 * renova nem cobra sozinho; no teste grátis, o dia em que a primeira cobrança no cartão e o período pago com Pix começam, o fim do teste
 * (`paidStartDay`, com o `until` de `my_access`, do servidor; a função do servidor usa a mesma conta); e, antes de "Depois de pagar", os
 * Termos de uso e a Política de privacidade.
 */
function WebSubscribeButtons({ access, webTest, period }: { access: Access; webTest: boolean; period: BillingPeriod }) {
  const now = useAccessNow();
  const timeZone = useAccessTimeZone();
  const repo = useRepo();
  const [busy, setBusy] = useState<PlanKind | `pix-${PlanKind}` | 'cancelar' | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  // Assinatura no cartão ainda ativa no Asaas sem pagar (cobrança recusada): oferece cancelá-la para escolher de novo.
  const [cardActive, setCardActive] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const show = (result: Exclude<WebSubscriptionStart['result'], 'checkout'>) => {
    // A assinatura no cartão ativa (com a cobrança em aberto ou marcada para o fim do teste, D-129): o botão de cancelar para escolher de novo.
    setCardActive(result === 'cartao_ativo' || result === 'assinatura_marcada');
    setMsg(W.errors[result]);
  };
  const cancelCard = async () => {
    if (busy) return;
    setBusy('cancelar');
    try {
      const r = await repo.cancelWebSubscription();
      if (r === 'cancelada' || r === 'sem_assinatura') {
        setCardActive(false);
        setMsg(null);
        setDone(W.cancelCardDone);
      } else setMsg(W.errors[r]);
    } catch {
      setMsg(W.errors.tente_de_novo);
    }
    setBusy(null);
  };
  if (!canSubscribeOnWeb(access, webTest)) return null;
  // No teste grátis, o dia do fim do teste (em Brasília, como o vencimento do Asaas e o banco): a primeira cobrança e o período pago com Pix.
  const startDay = paidStartDay(access.status, access.until, now);
  const startDate = startDay ? formatDateBR(startDay) : null;
  // O dia da cobrança é o de Brasília; o do fim do teste, o da pessoa: a frase diz quando os dois diferem (D-129).
  const rel = startDay ? trialEndRelation(startDay, access.until, timeZone) : 'mesmo-dia';
  const subscribe = async (plan: PlanKind) => {
    if (busy) return;
    setMsg(null);
    setDone(null);
    setBusy(plan);
    try {
      const r = await repo.startWebSubscription(plan, period);
      if (r.result === 'checkout') {
        // A página de pagamento abre no lugar do app; o botão fica ocupado até a troca.
        window.location.assign(r.url);
        return;
      }
      show(r.result);
    } catch {
      setMsg(W.errors.tente_de_novo);
    }
    setBusy(null);
  };
  // Um mês (ou, no anual, um ano) com Pix (D-093, caminho B; D-127): o Checkout do Asaas com Pix avulso; cada pagamento libera o período.
  const payPix = async (plan: PlanKind) => {
    if (busy) return;
    setMsg(null);
    setDone(null);
    setBusy(`pix-${plan}`);
    try {
      const r = await repo.startPixPayment(plan, period);
      if (r.result === 'checkout') {
        window.location.assign(r.url);
        return;
      }
      show(r.result);
    } catch {
      setMsg(W.errors.tente_de_novo);
    }
    setBusy(null);
  };
  return (
    <View style={{ gap: space[3] }}>
      {startDate ? (
        <Txt variant="caption" style={{ fontFamily: fonts.bold }}>
          {W.firstChargeOn(startDate, rel)}
        </Txt>
      ) : null}
      <Txt variant="caption" color={colors.textSecondary}>
        {W.howItWorks(period)}
      </Txt>
      {T.plans.map((p) => (
        <Button
          key={p.plan}
          label={W.subscribe(p.plan, period)}
          icon={CreditCard}
          tone={p.plan === 'individual' ? 'brand' : 'soft'}
          busy={busy === p.plan}
          busyLabel={W.subscribeBusy}
          disabled={busy !== null && busy !== p.plan}
          onPress={() => void subscribe(p.plan)}
        />
      ))}
      <Txt variant="label" style={{ fontFamily: fonts.bold, marginTop: space[2] }}>
        {period === 'anual' ? W.pixTitleAnnual : W.pixTitle}
      </Txt>
      <Txt variant="caption" color={colors.textSecondary}>
        {period === 'anual' ? W.pixHowItWorksAnnual : W.pixHowItWorks}
      </Txt>
      {startDate ? (
        <Txt variant="caption" style={{ fontFamily: fonts.bold }}>
          {W.pixStartsOn(startDate, rel)}
        </Txt>
      ) : null}
      {T.plans.map((p) => (
        <Button
          key={`pix-${p.plan}`}
          label={W.payPix(p.plan, period)}
          icon={QrCode}
          tone="soft"
          busy={busy === `pix-${p.plan}`}
          busyLabel={W.pixBusy}
          disabled={busy !== null && busy !== `pix-${p.plan}`}
          onPress={() => void payPix(p.plan)}
        />
      ))}
      <LegalLinks />
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
      {cardActive ? <Button label={W.cancelCard} tone="soft" busy={busy === 'cancelar'} busyLabel={W.cancelBusy} onPress={() => void cancelCard()} /> : null}
      {done ? (
        <Banner tone="sucesso" icon={CheckCircle2}>
          <Txt variant="label">{done}</Txt>
        </Banner>
      ) : null}
    </View>
  );
}

/**
 * Quem paga com Pix (D-093, caminho B; só na web): "Pagar mais um mês com Pix (R$ 29,90)" (ou, no anual, "mais um ano", D-127, com o preço
 * do ano) nos últimos dias do período pago (PIX_PAY_AHEAD_DAYS_BY_PERIOD: 10 no mensal, 30 no anual), e o outro período como segunda
 * opção, também com o preço (o plano continua o mesmo); antes disso, a partir de quando dá. O mesmo Checkout do Asaas, do plano em vigor. A volta da página do Asaas esconde os botões
 * (`hidden`) até o aviso do Asaas chegar.
 */
export function PixRenewCard({ access, hidden = false }: { access: Access; hidden?: boolean }) {
  const repo = useRepo();
  const timeZone = useAccessTimeZone();
  const [busy, setBusy] = useState<BillingPeriod | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const plan: PlanKind = access.plan ?? 'individual';
  const period = accessPeriod(access);
  const other: BillingPeriod = period === 'anual' ? 'mensal' : 'anual';
  const now = useAccessNow();
  const ready = pixCanPayNext(access.until, now, period);
  const from = pixNextPaymentFrom(access.until, period);
  const pay = async (chosen: BillingPeriod) => {
    if (busy) return;
    setMsg(null);
    setBusy(chosen);
    try {
      const r = await repo.startPixPayment(plan, chosen);
      if (r.result === 'checkout') {
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
    <Card style={{ gap: space[3] }}>
      {hidden ? null : ready ? (
        <>
          <Button
            label={W.payNextPix(plan, period)}
            icon={QrCode}
            busy={busy === period}
            busyLabel={W.pixBusy}
            disabled={busy !== null && busy !== period}
            onPress={() => void pay(period)}
          />
          <Button
            label={W.payOtherPix(other, plan)}
            icon={QrCode}
            tone="soft"
            busy={busy === other}
            busyLabel={W.pixBusy}
            disabled={busy !== null && busy !== other}
            onPress={() => void pay(other)}
          />
        </>
      ) : from ? (
        <Txt variant="label">{W.pixNextFrom(formatDateBR(todayIn(timeZone, from)), period)}</Txt>
      ) : null}
      <Txt variant="caption" color={colors.textSecondary}>
        {W.pixChangePlan}
      </Txt>
      {msg ? (
        <Banner tone="erro" icon={AlertCircle}>
          <Txt variant="label" color={colors.error}>
            {msg}
          </Txt>
        </Banner>
      ) : null}
    </Card>
  );
}

type StoreMsg = { tone: 'erro' | 'sucesso' | 'info'; text: string; refresh: boolean } | null;

/**
 * O aviso depois de tocar na compra: nada quando a pessoa cancelou na loja. Na troca (`change`, D-127), o texto segue o que a loja faz: a
 * troca para o Família vale na hora; as outras ficam pedidas para a próxima renovação, sem "Atualizar" (a situação só muda lá).
 */
function purchaseMessage(r: StorePurchaseResult, change: { from: StoreChoice; to: StoreChoice } | null = null): StoreMsg {
  if (r === 'cancelado') return null;
  if (r === 'comprado' && change) {
    const done = storeChangeDone(change.from, change.to);
    return { tone: 'sucesso', text: done.text, refresh: done.immediate };
  }
  if (r === 'comprado') return { tone: 'sucesso', text: S.purchased, refresh: true };
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

/**
 * Os Termos de uso e a Política de privacidade junto da compra, nas lojas (que pedem) e na web (D-129), só com o endereço do site
 * configurado (no roteiro de telas, o do roteiro, `PURCHASE_PREVIEW_SITE`).
 */
function LegalLinks() {
  const [failed, setFailed] = useState(false);
  const site = SITE_URL ?? PURCHASE_PREVIEW_SITE;
  if (!site) return null;
  const open = async (page: 'termos' | 'privacidade') => setFailed(!(await openSitePage(page, site)));
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
function StoreSubscribeButtons({ access, period }: { access: Access; period: BillingPeriod }) {
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
    const r = await buyPlan(user.id, { plan, period });
    if (r === 'comprado' || r === 'pendente') await followUp();
    setMsg(purchaseMessage(r));
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
          label={S.subscribe(p.plan, period)}
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
      <LegalLinks />
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
 * Para quem assina por esta loja (D-090): os ajustes de assinatura da loja (cancelar é lá), a troca de plano (no mesmo período) e a troca
 * entre mensal e anual (no mesmo plano, D-127), que abrem a folha da loja. A assinatura feita na outra loja ou na web se gerencia onde
 * foi feita (o texto da situação já diz).
 */
export function StoreManageCard({ access }: { access: Access }) {
  const { user } = useSession();
  const followUp = useStoreFollowUp();
  const [busy, setBusy] = useState<'plano' | 'periodo' | null>(null);
  const [msg, setMsg] = useState<StoreMsg>(null);
  if (!DEVICE_STORE || !isStoreSubscription(access.status, access.provider, DEVICE_STORE)) return null;
  const store = DEVICE_STORE;
  const plan = access.plan;
  const period = accessPeriod(access);
  const current = plan ? { plan, period } : null;
  const otherPlan: PlanKind | null = plan === 'individual' ? 'familiar' : plan === 'familiar' ? 'individual' : null;
  const otherPeriod: BillingPeriod = period === 'anual' ? 'mensal' : 'anual';
  const manage = async () => {
    setMsg(null);
    if (!(await openStoreSubscriptions())) setMsg({ tone: 'erro', text: S.manageFailed, refresh: false });
  };
  const change = async (what: 'plano' | 'periodo') => {
    if (busy || !user || !current || !otherPlan) return;
    setMsg(null);
    setBusy(what);
    const target: StoreChoice = what === 'plano' ? { plan: otherPlan, period } : { plan: current.plan, period: otherPeriod };
    const r = await buyPlan(user.id, target, current);
    if (r === 'comprado' || r === 'pendente') await followUp();
    setMsg(purchaseMessage(r, { from: current, to: target }));
    setBusy(null);
  };
  return (
    <Card style={{ gap: space[3] }}>
      <Txt variant="caption" color={colors.textSecondary}>
        {S.manageHint(store)}
      </Txt>
      <Button label={S.manage(store)} icon={ExternalLink} tone="soft" onPress={() => void manage()} />
      {otherPlan && STORE_PURCHASES_READY && user ? (
        <>
          <Button
            label={S.changePlan(otherPlan)}
            tone="soft"
            busy={busy === 'plano'}
            busyLabel={S.changeBusy}
            disabled={busy !== null && busy !== 'plano'}
            onPress={() => void change('plano')}
          />
          <Button
            label={S.changePeriod(otherPeriod)}
            tone="soft"
            busy={busy === 'periodo'}
            busyLabel={S.changeBusy}
            disabled={busy !== null && busy !== 'periodo'}
            onPress={() => void change('periodo')}
          />
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
 * A escolha entre o anual e o mensal (D-127): um grupo de dois rádios em forma de segmento, o anual primeiro, cada opção com o nome e "Uma
 * cobrança por ano" ou "por mês". Sem prazo, sem alarme e sem cor de alerta: muda só o preço em destaque e os botões de assinar.
 */
function PeriodChoice({ value, onChange }: { value: BillingPeriod; onChange: (period: BillingPeriod) => void }) {
  const options: readonly BillingPeriod[] = ['anual', 'mensal'];
  return (
    <View style={styles.track} accessibilityRole="radiogroup" accessibilityLabel={PLAN_PERIOD_TEXT.choiceLabel}>
      {options.map((period) => {
        const selected = period === value;
        return (
          <Pressable
            key={period}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            aria-checked={selected}
            accessibilityLabel={`${PLAN_PERIOD_TEXT.option[period]}, ${PLAN_PERIOD_TEXT.optionHint[period].toLowerCase()}`}
            onPress={() => onChange(period)}
            {...spaceKeyPress(() => onChange(period))}
            style={(s) => [styles.option, selected && styles.optionSelected, (s as { focused?: boolean }).focused && ui.focusRing]}>
            <View style={styles.optionHead}>
              {selected ? <Check size={16} color={colors.brandText} strokeWidth={2.5} aria-hidden /> : null}
              <Txt variant="label" color={selected ? colors.brandText : colors.text} style={{ fontFamily: fonts.bold, fontSize: 15 }}>
                {PLAN_PERIOD_TEXT.option[period]}
              </Txt>
            </View>
            <Txt variant="caption" color={colors.textSecondary} style={{ textAlign: 'center' }}>
              {PLAN_PERIOD_TEXT.optionHint[period]}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Os planos e os preços, para quem ainda não paga nem tem quem pague. Desde a D-127, com a escolha entre o anual (primeiro) e o mensal: o
 * preço do período escolhido em destaque, no anual o equivalente por mês (dito como equivalente: o anual é uma cobrança só) e a diferença
 * exata para 12 mensalidades, e o preço do outro período sempre à vista, em letra menor. Com a compra aberta (SUBSCRIBE_OPEN), os botões de
 * assinar do período escolhido: na web, pelo Asaas (D-084), com cartão ou Pix; no iPhone e no Android, pela loja (D-090; também no build
 * de teste da equipe, STORE_TEST).
 * `webTest`: o teste da equipe no sandbox do Asaas antes de abrir (`/conta/assinatura?assinar=teste`, docs/39): mostra os botões com a
 * compra fechada. Só faz diferença enquanto a função do servidor tem a chave do sandbox, que não cobra ninguém. `subscribeHidden`: a
 * pessoa acabou de pagar (`?pagamento=sucesso`) e o aviso do Asaas ainda não chegou: sem botões, para não abrir um segundo Checkout.
 * Na demonstração (revisão de 26/11/2026, diretriz 3.1.1 da App Store), nunca há botão de assinar nem de pagar, nem o texto de como
 * pagar na web: o app das lojas abre a demonstração da web ("Ver a demonstração"), e ela não pode levar a um pagamento fora da loja. Fica
 * a nota neutra `ACCESS_TEXT.demoNote`; a escolha do período continua, porque só muda o preço mostrado.
 */
export function PlansCard({ access, webTest = false, subscribeHidden = false }: { access: Access; webTest?: boolean; subscribeHidden?: boolean }) {
  const { auth, user } = useSession();
  // O roteiro de telas (`PURCHASE_PREVIEW`, só com a marca dele na página) vê o que uma conta de verdade vê na web.
  const demo = auth.mode === 'demo' && !PURCHASE_PREVIEW;
  const [period, setPeriod] = useState<BillingPeriod>('anual');
  const web = Platform.OS === 'web';
  const webButtons = !demo && (SUBSCRIBE_OPEN || webTest) && web && !subscribeHidden && canSubscribeOnWeb(access, webTest);
  const storeButtons =
    !demo && (SUBSCRIBE_OPEN || STORE_TEST) && !web && Boolean(DEVICE_STORE && STORE_PURCHASES_READY && SITE_URL && user && canSubscribeInStore(access.status));
  // A frase da compra fechada só quando os botões não aparecem (D-129: com `?assinar=teste`, os botões e a frase apareciam juntos), e a de
  // acesso completo só para quem o tem (em só ver e exportar, a curta).
  const closedNote = SUBSCRIBE_OPEN || demo || webButtons || storeButtons ? null : access.canWrite ? T.notOpenYet : T.notOpenYetShort;
  return (
    <Card style={{ gap: space[3] }}>
      <Txt variant="title" accessibilityRole="header" aria-level={2}>
        {T.plansTitle}
      </Txt>
      <PeriodChoice value={period} onChange={setPeriod} />
      {T.plans.map((p) => {
        // Cada plano num cartão com a cor da marca (pedido do Enzo, 12/11/2026): Individual no azul claro, Família no lima claro.
        const family = p.plan === 'familiar';
        const PlanIcon = family ? Users : User;
        return (
          <View
            key={p.plan}
            style={{ gap: space[2], padding: space[4], borderRadius: 16, backgroundColor: family ? colors.accentTint : colors.brandTint }}
            accessible
            accessibilityLabel={PLAN_PERIOD_TEXT.planLabel(p.plan, period, p.who)}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
              <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: family ? colors.accent : colors.brand }}>
                <PlanIcon size={20} color={family ? colors.textOnAccent : colors.textOnBrand} aria-hidden />
              </View>
              <Txt variant="title" style={{ flex: 1 }}>
                {PLAN_NAME[p.plan]}
              </Txt>
            </View>
            <Txt variant="amount" color={family ? colors.text : colors.brandTextDeep}>
              {planPeriodPriceAmount(p.plan, period)}
              <Txt variant="label" color={colors.textSecondary}>
                {periodSuffix(period)}
              </Txt>
            </Txt>
            {period === 'anual' ? (
              <View style={{ gap: 2 }}>
                <Txt variant="label">{PLAN_PERIOD_TEXT.equivalent(p.plan)}</Txt>
                <Txt variant="caption" color={colors.textSecondary}>
                  {PLAN_PERIOD_TEXT.saving(p.plan)}
                </Txt>
              </View>
            ) : null}
            <Txt variant="caption" color={colors.textSecondary}>
              {PLAN_PERIOD_TEXT.other(p.plan, period)}
            </Txt>
            <Txt variant="caption" color={colors.textSecondary}>
              {p.who}
            </Txt>
          </View>
        );
      })}
      <Txt variant="caption" color={colors.textSecondary}>
        {T.plansNote}
      </Txt>
      {/* A nota do anual por canal (D-129): na web, o cartão renova e o Pix não; nas lojas, sem Pix nem web; na demonstração, a neutra. */}
      <Txt variant="caption" color={colors.textSecondary}>
        {demo ? PLAN_PERIOD_TEXT.note.neutral : web ? PLAN_PERIOD_TEXT.note.web : PLAN_PERIOD_TEXT.note.store}
      </Txt>
      <Txt variant="caption" color={colors.textSecondary}>
        {demo ? T.demoNote : web ? T.howToPay : T.howToPayStore}
      </Txt>
      {webButtons ? <WebSubscribeButtons access={access} webTest={webTest} period={period} /> : null}
      {!demo && (SUBSCRIBE_OPEN || STORE_TEST) && !web ? <StoreSubscribeButtons access={access} period={period} /> : null}
      {closedNote ? (
        <Txt variant="caption" style={{ fontFamily: fonts.bold }}>
          {closedNote}
        </Txt>
      ) : null}
      {access.status === 'teste' || access.status === 'leitura' ? (
        <Txt variant="caption" color={colors.textSecondary}>
          {T.readOnlyWhat}
        </Txt>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  // O segmento dos períodos, como o de Barras e Bolhas em Análises: alvos de 56 px, o sinal de marcado e o fundo da superfície no escolhido.
  track: { flexDirection: 'row', backgroundColor: colors.muted, borderRadius: radius.md, padding: 4, gap: 4 },
  option: { flex: 1, minHeight: 56, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space[2], paddingVertical: space[2], gap: 2 },
  optionSelected: { backgroundColor: colors.surface },
  optionHead: { flexDirection: 'row', alignItems: 'center', gap: space[1] },
});
