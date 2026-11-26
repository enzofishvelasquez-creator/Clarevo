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
  isStoreSubscription,
  periodSuffix,
  pixCanPayNext,
  pixNextPaymentFrom,
  planPeriodPriceAmount,
  todayIn,
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
import { SITE_URL, openSitePage } from '@/lib/site';
import { DEVICE_STORE, STORE_PURCHASES_READY, STORE_TEST, buyPlan, openStoreSubscriptions, restorePurchases } from '@/lib/store-purchases';
import { useAccess, useReloadAccess, useWebSubscriptionStatus } from '@/state/access';
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
  const banner = access ? accessBanner(access, now, timeZone, { web: Platform.OS === 'web' }) : null;
  if (!banner) return null;
  return (
    <Banner tone="info" icon={access?.status === 'leitura' ? LockKeyhole : Hourglass} live={false}>
      <Txt variant="label">{banner.text}</Txt>
      <LinkButton label={banner.action ?? T.bannerAction} onPress={() => router.push('/conta/assinatura')} style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }} />
    </Banner>
  );
}

/** Card "Assinatura" em Conta: a situação, a explicação curta e o botão da tela Assinatura. */
export function AccessCard() {
  const access = useAccess();
  const timeZone = useAccessTimeZone();
  const webCard = Platform.OS === 'web' && access.data?.status === 'assinatura' && access.data.provider === 'web';
  const webStatus = useWebSubscriptionStatus(webCard);
  const now = useAccessNow();
  const view = access.data ? accessView(access.data, now, timeZone, { web: Platform.OS === 'web', webSubscription: webCard ? webStatus.data : null }) : null;
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
function WebSubscribeButtons({ access, webTest, period }: { access: Access; webTest: boolean; period: BillingPeriod }) {
  const repo = useRepo();
  const [busy, setBusy] = useState<PlanKind | `pix-${PlanKind}` | 'cancelar' | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  // Assinatura no cartão ainda ativa no Asaas sem pagar (cobrança recusada): oferece cancelá-la para escolher de novo.
  const [cardActive, setCardActive] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const show = (result: Exclude<WebSubscriptionStart['result'], 'checkout'>) => {
    setCardActive(result === 'cartao_ativo');
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
  // No teste do sandbox (antes do início da cobrança, todo mundo está em pre_lancamento), os botões aparecem também nessa situação.
  if (access.status !== 'teste' && access.status !== 'leitura' && access.status !== 'familia' && !(webTest && access.status === 'pre_lancamento')) return null;
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
      <Txt variant="caption" color={colors.textSecondary}>
        {W.howItWorks}
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
 * Quem paga com Pix (D-093, caminho B; só na web): "Pagar mais um mês com Pix" (ou, no anual, "mais um ano", D-127) nos últimos dias do
 * período pago (PIX_PAY_AHEAD_DAYS_BY_PERIOD: 10 no mensal, 30 no anual), e o outro período como segunda opção (o plano continua o
 * mesmo); antes disso, a partir de quando dá. O mesmo Checkout do Asaas, do plano em vigor. A volta da página do Asaas esconde os botões
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
            label={period === 'anual' ? W.payNextPixAnnual : W.payNextPix}
            icon={QrCode}
            busy={busy === period}
            busyLabel={W.pixBusy}
            disabled={busy !== null && busy !== period}
            onPress={() => void pay(period)}
          />
          <Button
            label={W.payOtherPix(other)}
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
    const r = await buyPlan(user.id, what === 'plano' ? { plan: otherPlan, period } : { plan: current.plan, period: otherPeriod }, current);
    if (r === 'comprado' || r === 'pendente') await followUp();
    setMsg(purchaseMessage(r, true));
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
  const demo = useSession().auth.mode === 'demo';
  const [period, setPeriod] = useState<BillingPeriod>('anual');
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
      <Txt variant="caption" color={colors.textSecondary}>
        {PLAN_PERIOD_TEXT.note}
      </Txt>
      <Txt variant="caption" color={colors.textSecondary}>
        {demo ? T.demoNote : Platform.OS === 'web' ? T.howToPay : T.howToPayStore}
      </Txt>
      {!demo && (SUBSCRIBE_OPEN || webTest) && Platform.OS === 'web' && !subscribeHidden ? <WebSubscribeButtons access={access} webTest={webTest} period={period} /> : null}
      {!demo && (SUBSCRIBE_OPEN || STORE_TEST) && Platform.OS !== 'web' ? <StoreSubscribeButtons access={access} period={period} /> : null}
      {SUBSCRIBE_OPEN || demo ? null : (
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

const styles = StyleSheet.create({
  // O segmento dos períodos, como o de Barras e Bolhas em Análises: alvos de 56 px, o sinal de marcado e o fundo da superfície no escolhido.
  track: { flexDirection: 'row', backgroundColor: colors.muted, borderRadius: radius.md, padding: 4, gap: 4 },
  option: { flex: 1, minHeight: 56, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space[2], paddingVertical: space[2], gap: 2 },
  optionSelected: { backgroundColor: colors.surface },
  optionHead: { flexDirection: 'row', alignItems: 'center', gap: space[1] },
});
