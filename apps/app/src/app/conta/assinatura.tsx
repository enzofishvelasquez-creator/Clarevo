import { ACCESS_TEXT, WEB_SUBSCRIPTION_TEXT, accessView, parseWebPaymentReturn } from '@clarevo/core';
import { useLocalSearchParams } from 'expo-router';
import { AlertCircle, CheckCircle2, Info } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';

import { AccessSituation, PlansCard, StoreManageCard, useAccessTimeZone } from '@/components/access-parts';
import { ConfirmDialog } from '@/components/dialog';
import { SubHeader } from '@/components/header';
import { ErrorState, LoadingState } from '@/components/states';
import { Banner, Button, Card, LinkButton, Screen, Txt } from '@/components/ui';
import { useAccess, useReloadAccess } from '@/state/access';
import { useRepo } from '@/state/session';
import { colors, space } from '@/theme/tokens';

const T = ACCESS_TEXT;
const W = WEB_SUBSCRIPTION_TEXT;

/**
 * Cancelar a assinatura feita na web (D-084): só na web e só para a assinatura da web (provider 'web'); a das lojas se cancela na loja.
 * A função do servidor remove a assinatura no Asaas; o período já pago continua valendo (o aviso do Asaas recalcula até quando).
 */
function WebCancelCard() {
  const repo = useRepo();
  const reload = useReloadAccess();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'erro' | 'sucesso'; text: string } | null>(null);
  const cancel = async () => {
    setBusy(true);
    try {
      const r = await repo.cancelWebSubscription();
      if (r === 'cancelada') {
        setDone(true);
        setMsg({ tone: 'sucesso', text: W.cancelDone });
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
  return (
    <Card style={{ gap: space[3] }}>
      {done ? null : (
        <Txt variant="caption" color={colors.textSecondary}>
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
        <Txt>{W.cancelConfirmBody}</Txt>
      </ConfirmDialog>
    </Card>
  );
}

/**
 * Conta > Assinatura (D-083): a situação do acesso (teste grátis, só ver e exportar, plano, benefício, cortesia ou Plano Família da
 * pessoa titular), com as datas no fuso da pessoa, e os planos com os preços para quem ainda não paga. Na web, com a compra aberta
 * (SUBSCRIBE_OPEN), os botões de assinar pelo Asaas (D-084) e, para quem assinou na web, o cancelamento; a volta da página de pagamento
 * chega com `?pagamento=sucesso|cancelado|expirado`. No iPhone e no Android, a compra pela loja (D-090) e, para quem assina por ela, os
 * ajustes da loja e a troca de plano. A trava da escrita é do banco.
 */
export default function AssinaturaScreen() {
  const access = useAccess();
  const timeZone = useAccessTimeZone();
  const params = useLocalSearchParams<{ pagamento?: string; assinar?: string }>();
  const returned = parseWebPaymentReturn(params.pagamento);
  const webTest = Platform.OS === 'web' && params.assinar === 'teste';
  const refetch = access.refetch;
  // Voltou da página do Asaas: a situação pode ter mudado (o aviso do Asaas chega em segundos ou minutos).
  useEffect(() => {
    if (returned) void refetch();
  }, [returned, refetch]);
  const view = access.data ? accessView(access.data, new Date(), timeZone) : null;
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SubHeader title={T.screenTitle} />
      <Screen contentStyle={{ padding: space[5], gap: space[4] }}>
        {returned ? (
          <Banner tone={returned === 'sucesso' ? 'sucesso' : 'info'} icon={returned === 'sucesso' ? CheckCircle2 : Info}>
            <Txt variant="label">{W.returned[returned]}</Txt>
            {returned === 'sucesso' ? (
              <LinkButton label={W.refresh} onPress={() => void refetch()} style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }} />
            ) : null}
          </Banner>
        ) : null}
        {access.isPending ? (
          <LoadingState />
        ) : !access.data || !view ? (
          <ErrorState message={T.loadFailed} onRetry={() => access.refetch()} />
        ) : (
          <>
            <Card style={{ gap: space[3] }}>
              <AccessSituation situation={view.situation} />
              <Txt color={colors.text}>{view.body}</Txt>
            </Card>
            {access.data.status === 'assinatura' && access.data.provider === 'web' && Platform.OS === 'web' ? <WebCancelCard /> : null}
            {Platform.OS !== 'web' ? <StoreManageCard access={access.data} /> : null}
            {view.showPlans ? <PlansCard access={access.data} webTest={webTest} subscribeHidden={returned === 'sucesso'} /> : null}
            {view.showPlans ? (
              <Txt variant="caption" color={colors.textSecondary}>
                {T.benefitNote}
              </Txt>
            ) : null}
          </>
        )}
      </Screen>
    </View>
  );
}
