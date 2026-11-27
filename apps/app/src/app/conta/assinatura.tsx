import {
  ACCESS_TEXT,
  FAMILY_PLAN_NEXT_TEXT,
  WEB_SUBSCRIPTION_TEXT,
  accessView,
  chosenPlanStillUseful,
  familyPlanNextStep,
  formatDateBR,
  parseWebPaymentReturn,
  todayIn,
  type Access,
} from '@clarevo/core';
import { router, useLocalSearchParams } from 'expo-router';
import { AlertCircle, CheckCircle2, Info, UserPlus, Users } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';

import { PixRenewCard, PlansCard, StoreManageCard, useAccessNow, useAccessTimeZone, useWebSubscriptionState } from '@/components/access-parts';
import { ConfirmDialog } from '@/components/dialog';
import { SubHeader } from '@/components/header';
import { ErrorState, LoadingState } from '@/components/states';
import { BenefitsCard, SubscriptionHero } from '@/components/subscription-parts';
import { Banner, Button, Card, LinkButton, Screen, Txt } from '@/components/ui';
import { clearChosenPlan, peekChosenPlan } from '@/lib/chosen-plan';
import { useWideLayout } from '@/lib/layout';
import { useAccess, useReloadAccess } from '@/state/access';
import { useFamily } from '@/state/family';
import { useRepo } from '@/state/session';
import { colors, space } from '@/theme/tokens';

const T = ACCESS_TEXT;
const W = WEB_SUBSCRIPTION_TEXT;

/** Computador: as notas pequenas param em 560 px (revisão visual de 23/11/2026: com 720 px, a linha passava de 110 letras). */
const NOTE_WIDE = { maxWidth: 560 } as const;

/**
 * Cancelar a assinatura feita na web (D-084): só na web e só para a assinatura da web (provider 'web'); a das lojas se cancela na loja.
 * A função do servidor remove a assinatura no Asaas; o período já pago continua valendo (o aviso do Asaas recalcula até quando). Já
 * cancelada (`canceled`, lida no Asaas), o botão sai e fica o aviso de que o acesso continua até o fim do período pago (12/11/2026).
 * `trialEnd`: quem assinou no teste grátis e ainda não pagou a primeira cobrança (D-129): cancelar não cobra nada, e o teste continua até
 * essa data (os textos da confirmação e do aviso dizem isso).
 */
function WebCancelCard({ canceled, trialEnd = null, onTrialCanceled }: { canceled: boolean; trialEnd?: string | null; onTrialCanceled?: (text: string) => void }) {
  const repo = useRepo();
  const reload = useReloadAccess();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const note = useWideLayout() ? NOTE_WIDE : undefined;
  const [msg, setMsg] = useState<{ tone: 'erro' | 'sucesso'; text: string } | null>(null);
  const cancel = async () => {
    setBusy(true);
    try {
      const r = await repo.cancelWebSubscription();
      if (r === 'cancelada' || r === 'sem_assinatura') {
        setDone(true);
        setMsg({ tone: 'sucesso', text: trialEnd ? W.cancelDoneTrial(trialEnd) : W.cancelDone });
        // No teste, o cartão some com a assinatura (a tela volta aos planos): o aviso fica no alto da tela.
        if (trialEnd) onTrialCanceled?.(W.cancelDoneTrial(trialEnd));
        void reload();
      } else {
        setMsg({ tone: 'erro', text: W.errors[r] });
      }
    } catch {
      setMsg({ tone: 'erro', text: W.errors.tente_de_novo });
    }
    setBusy(false);
    setOpen(false);
  };
  // Já cancelada antes de abrir a tela: o alto da tela diz até quando vale, e não há mais o que cancelar.
  if (canceled && !done) return null;
  return (
    <Card style={{ gap: space[3] }}>
      {done || trialEnd ? null : (
        <Txt variant="caption" color={colors.textSecondary} style={note}>
          {W.changePlan}
        </Txt>
      )}
      {msg ? (
        <Banner tone={msg.tone} icon={msg.tone === 'erro' ? AlertCircle : CheckCircle2}>
          <Txt variant="label" color={msg.tone === 'erro' ? colors.error : colors.text}>
            {msg.text}
          </Txt>
        </Banner>
      ) : null}
      {done ? null : <Button label={W.cancel} tone="soft" onPress={() => setOpen(true)} />}
      <ConfirmDialog
        visible={open}
        title={W.cancelConfirmTitle}
        cancelLabel={W.cancelKeep}
        confirmLabel={W.cancelConfirmAction}
        busy={busy}
        onCancel={() => setOpen(false)}
        onConfirm={() => void cancel()}
      >
        <Txt>{trialEnd ? W.cancelConfirmBodyTrial(trialEnd) : W.cancelConfirmBody}</Txt>
      </ConfirmDialog>
    </Card>
  );
}

/**
 * O próximo passo de quem paga o plano Família (jornada de compra de 27/11/2026): sem Família, criar; sem ninguém convidado, convidar.
 * Calmo e sem prazo; some quando a Família tem outra pessoa ou um convite válido (`familyPlanNextStep`).
 */
function FamilyNextStep({ access, now }: { access: Access; now: Date }) {
  const family = useFamily();
  const step = familyPlanNextStep(access, family.isSuccess ? family.data : undefined, now);
  if (!step) return null;
  const create = step === 'criar';
  return (
    <Card style={{ gap: space[3] }}>
      <Txt variant="title" accessibilityRole="header" aria-level={2}>
        {create ? FAMILY_PLAN_NEXT_TEXT.createTitle : FAMILY_PLAN_NEXT_TEXT.inviteTitle}
      </Txt>
      <Txt color={colors.textSecondary}>{create ? FAMILY_PLAN_NEXT_TEXT.createBody : FAMILY_PLAN_NEXT_TEXT.inviteBody}</Txt>
      <Button
        label={create ? FAMILY_PLAN_NEXT_TEXT.createAction : FAMILY_PLAN_NEXT_TEXT.inviteAction}
        icon={create ? Users : UserPlus}
        onPress={() => router.push(create ? '/familia/nova' : '/familia/convidar')}
      />
    </Card>
  );
}

/**
 * Conta > Assinatura (D-083): a situação do acesso (teste grátis, só ver e exportar, plano, benefício, cortesia ou Plano Família da
 * pessoa titular), com as datas no fuso da pessoa, e os planos com os preços para quem ainda não paga. Na web, com a compra aberta
 * (SUBSCRIBE_OPEN), os botões de assinar pelo Asaas (D-084) e, para quem assinou na web, o cancelamento; a volta da página de pagamento
 * chega com `?pagamento=sucesso|cancelado|expirado`. No iPhone e no Android, a compra pela loja (D-090) e, para quem assina por ela, os
 * ajustes da loja e a troca de plano. A trava da escrita é do banco.
 * Jornada de compra de 27/11/2026: para quem ainda escolhe um plano, os planos vêm logo depois da situação (com os botões dentro de cada
 * plano) e "O que a assinatura libera" depois deles; o plano e o período escolhidos no site (`lib/chosen-plan.ts`) abrem já marcados na
 * primeira vez e saem do aparelho; quem paga o plano Família ganha o próximo passo (criar a Família e convidar).
 */
export default function AssinaturaScreen() {
  const access = useAccess();
  const timeZone = useAccessTimeZone();
  const note = useWideLayout() ? NOTE_WIDE : undefined;
  const params = useLocalSearchParams<{ pagamento?: string; assinar?: string }>();
  const returned = parseWebPaymentReturn(params.pagamento);
  const webTest = Platform.OS === 'web' && params.assinar === 'teste';
  const refetch = access.refetch;
  // Voltou da página do Asaas: a situação pode ter mudado (o aviso do Asaas chega em segundos ou minutos).
  useEffect(() => {
    if (returned) void refetch();
  }, [returned, refetch]);
  const now = useAccessNow();
  const onWeb = Platform.OS === 'web';
  // A assinatura no cartão: primeiro o próprio direito, no banco; a situação no Asaas só com um direito pela web que vale (D-129).
  const web = useWebSubscriptionState(access.data, now);
  const webStatus = web.status;
  const webCard = onWeb && access.data?.status === 'assinatura' && access.data.provider === 'web';
  // Assinou no cartão durante o teste e a primeira cobrança ainda não foi paga (antes do dia dela ou no próprio dia, até a confirmação do
  // cartão): o cancelamento fica logo abaixo, sem os planos, com os textos do teste (nada é cobrado; o acesso acaba com o teste).
  const pending = web.firstCharge;
  const trialEnd = pending
    ? access.data?.status === 'teste' && access.data.until
      ? formatDateBR(todayIn(timeZone, new Date(access.data.until)))
      : formatDateBR(pending)
    : null;
  const view = access.data
    ? accessView(access.data, now, timeZone, { web: onWeb, webSubscription: web.reads ? webStatus.data : null, cancelBelow: true, firstCharge: pending })
    : null;
  // Voltou do pagamento e o acesso já mudou: o alto da tela dá as boas-vindas, e o aviso da volta sai.
  const welcomed = returned === 'sucesso' && access.data?.status === 'assinatura';
  const subscribed = access.data ? ['assinatura', 'familia', 'beneficio', 'cortesia'].includes(access.data.status) : false;
  const [trialCanceled, setTrialCanceled] = useState<string | null>(null);
  // O plano escolhido no site: lido uma vez ao abrir a tela. Com a situação lida, sai do aparelho (usado agora ou, para quem já não escolhe
  // plano, sem uso) e só vale enquanto esta tela está aberta.
  const [chosen, setChosen] = useState(() => peekChosenPlan());
  const status = access.data?.status;
  useEffect(() => {
    if (!status || !chosen) return;
    clearChosenPlan();
    if (!chosenPlanStillUseful(status)) setChosen(null);
  }, [status, chosen]);
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SubHeader title={T.screenTitle} />
      <Screen contentStyle={{ padding: space[5], gap: space[4] }}>
        {returned && !welcomed ? (
          <Banner tone={returned === 'sucesso' ? 'sucesso' : 'info'} icon={returned === 'sucesso' ? CheckCircle2 : Info}>
            <Txt variant="label">{W.returned[returned]}</Txt>
            {returned === 'sucesso' ? (
              <LinkButton label={W.refresh} onPress={() => void refetch()} style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }} />
            ) : null}
          </Banner>
        ) : null}
        {trialCanceled ? (
          <Banner tone="sucesso" icon={CheckCircle2}>
            <Txt variant="label">{trialCanceled}</Txt>
          </Banner>
        ) : null}
        {access.isPending ? (
          <LoadingState />
        ) : !access.data || !view ? (
          <ErrorState message={T.loadFailed} onRetry={() => access.refetch()} />
        ) : (
          <>
            <SubscriptionHero access={access.data} view={view} now={now} timeZone={timeZone} justPaid={welcomed} canceled={webCard && webStatus.data?.active === false} />
            {webCard && !pending ? <WebCancelCard canceled={webStatus.data?.active === false} /> : null}
            {onWeb && pending ? <WebCancelCard canceled={false} trialEnd={trialEnd} onTrialCanceled={setTrialCanceled} /> : null}
            {access.data.status === 'assinatura' && access.data.provider === 'pix' && Platform.OS === 'web' ? (
              <PixRenewCard access={access.data} hidden={returned === 'sucesso'} />
            ) : null}
            {Platform.OS !== 'web' ? <StoreManageCard access={access.data} /> : null}
            <FamilyNextStep access={access.data} now={now} />
            {/* Quem ainda escolhe um plano: os planos primeiro e o que a assinatura libera depois deles (jornada de compra de 27/11/2026). */}
            {view.showPlans ? null : <BenefitsCard subscribed={subscribed} />}
            {view.showPlans ? <PlansCard access={access.data} webTest={webTest} subscribeHidden={returned === 'sucesso'} chosen={chosen} /> : null}
            {view.showPlans ? <BenefitsCard subscribed={subscribed} /> : null}
            {view.showPlans ? (
              <Txt variant="caption" color={colors.textSecondary} style={note}>
                {T.benefitNote}
              </Txt>
            ) : null}
          </>
        )}
      </Screen>
    </View>
  );
}
