import {
  DELETE_CONFIRMATION_WORD,
  DELETE_TEXT,
  FAMILY_TEXT,
  STORE_SUBSCRIPTION_TEXT,
  WEB_SUBSCRIPTION_TEXT,
  canSubmitDelete,
  deleteErrorText,
  deleteFamilyOutcome,
  deleteFamilyText,
} from '@clarevo/core';
import { router } from 'expo-router';
import { AlertCircle, ExternalLink, FileDown, Info, Users } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { SubHeader } from '@/components/header';
import { Banner, Button, Card, LinkButton, Screen, TextField, Txt } from '@/components/ui';
import { forgetDevice } from '@/lib/device-forget';
import { signOutIntent } from '@/lib/nav';
import { DEVICE_STORE, openStoreSubscriptions } from '@/lib/store-purchases';
import { useAccess } from '@/state/access';
import { useDeleteAccount } from '@/state/account';
import { useFamily } from '@/state/family';
import { useRepo, useSession } from '@/state/session';
import { colors, fonts, space } from '@/theme/tokens';

const T = DELETE_TEXT;

type Msg = { tone: 'erro' | 'info'; text: string } | null;

/** Uma linha de lista: o marcador é enfeite, só o texto é lido. */
function Line({ text }: { text: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: space[2] }}>
      <Txt color={colors.textSecondary} accessibilityElementsHidden importantForAccessibility="no">
        •
      </Txt>
      <Txt style={{ flex: 1 }}>{text}</Txt>
    </View>
  );
}

/**
 * Excluir minha conta (D-058, CL-04 e CL-16): explica o que é apagado e o que continua (a Família conforme o papel), oferece
 * exportar antes (D-047), mostra o bloqueio de titular com o caminho para passar a titularidade, pede para digitar EXCLUIR e confirma.
 * Depois de excluir, o aparelho esquece a pessoa, a sessão termina e a tela de entrada diz "Sua conta foi excluída". Na demonstração a
 * tela abre e explica, mas o botão final diz que nada é apagado. Sem tom de alerta: a escolha é da pessoa.
 */
export default function ExcluirContaScreen() {
  const { user, auth, signOut } = useSession();
  const repo = useRepo();
  const access = useAccess();
  const family = useFamily();
  const deleteAccount = useDeleteAccount();
  const demo = auth.mode === 'demo';
  const outcome = deleteFamilyOutcome(family.data);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const canSubmit = canSubmitDelete(typed, outcome) && !family.isPending;

  const submit = async () => {
    if (busy || !canSubmit) return;
    setMsg(null);
    if (demo) {
      setMsg({ tone: 'info', text: T.demo });
      return;
    }
    setBusy(true);
    // Assinatura feita na web (D-084): cancela no Asaas antes (em qualquer plataforma; a chamada não tem tela), para não cobrar uma
    // conta que já não existe. Sem conseguir, não exclui ainda: a rede de segurança (o próximo aviso do Asaas encontra a conta excluída
    // e a função do servidor cancela) chegaria depois de mais uma cobrança.
    if (access.data?.provider === 'web') {
      const cancelled = await repo.cancelWebSubscription().catch(() => 'tente_de_novo' as const);
      if (cancelled !== 'cancelada' && cancelled !== 'sem_assinatura') {
        setBusy(false);
        setMsg({ tone: 'erro', text: WEB_SUBSCRIPTION_TEXT.cancelBeforeDeleteFailed });
        return;
      }
    }
    // Assinatura que já passou por uma loja (D-090): a função apaga a pessoa no RevenueCat antes. Sem trava: se falhar, a conta sai do
    // mesmo jeito (no RevenueCat fica só o código aleatório da conta, sem ligação com ninguém depois da exclusão).
    await repo.forgetStoreCustomer().catch(() => 'tente_de_novo' as const);
    const r = await deleteAccount(DELETE_CONFIRMATION_WORD);
    if (!r.ok) {
      setBusy(false);
      setMsg({ tone: 'erro', text: deleteErrorText(r.code) });
      return;
    }
    // A conta já não existe (o hook marcou a exclusão como confirmada): o que o aparelho guardava dela sai também, a sessão termina e
    // a entrada diz "Sua conta foi excluída". Se a resposta se perder, o hook deixa a intenção marcada e o layout faz o mesmo quando a
    // sessão cair (e diz que não foi possível confirmar).
    if (user) await forgetDevice(user.id);
    signOutIntent.mark();
    try {
      await signOut();
    } catch {
      // O servidor já não conhece a sessão: o aparelho a encerra do mesmo jeito.
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SubHeader title={T.title} />
      <Screen contentStyle={{ padding: space[5], gap: space[4] }}>
        <Txt color={colors.textSecondary}>{T.intro}</Txt>

        {/* Assinatura pela App Store ou pelo Google Play (D-090): a Clarevo não consegue cancelar na loja; a pessoa cancela lá antes. */}
        {access.data?.status === 'assinatura' && (access.data.provider === 'apple' || access.data.provider === 'google') ? (
          <Banner tone="info" icon={Info}>
            <Txt variant="label">{STORE_SUBSCRIPTION_TEXT.deleteNote(access.data.provider)}</Txt>
            {DEVICE_STORE === access.data.provider ? (
              <LinkButton
                label={STORE_SUBSCRIPTION_TEXT.manage(access.data.provider)}
                icon={ExternalLink}
                onPress={() => void openStoreSubscriptions()}
                style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }}
              />
            ) : null}
          </Banner>
        ) : null}

        <Card style={{ gap: space[3] }}>
          <Txt variant="title" accessibilityRole="header" aria-level={2}>
            {T.erasedTitle}
          </Txt>
          {T.erased.map((line) => (
            <Line key={line} text={line} />
          ))}
        </Card>

        <Card style={{ gap: space[3] }}>
          <Txt variant="title" accessibilityRole="header" aria-level={2}>
            {T.keptTitle}
          </Txt>
          <Txt>{T.keptNone}</Txt>
          <Txt variant="label" style={{ fontFamily: fonts.bold }}>
            {T.familyTitle}
          </Txt>
          {family.isPending ? (
            <Txt color={colors.textSecondary}>{T.familyLoading}</Txt>
          ) : family.isError ? (
            <>
              <Txt color={colors.textSecondary}>{FAMILY_TEXT.loadFailed}</Txt>
              <LinkButton label="Tentar novamente" onPress={() => family.refetch()} style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }} />
            </>
          ) : (
            <>
              <Txt>{deleteFamilyText(outcome, family.data?.context.name ?? '')}</Txt>
              {outcome === 'nenhuma' ? <Txt variant="caption" color={colors.textSecondary}>{T.familyGeneral}</Txt> : null}
              {outcome === 'bloqueia' ? (
                <>
                  <Txt variant="caption" color={colors.textSecondary}>
                    {T.familyBlockedHow}
                  </Txt>
                  <Button label={T.familyOpen} icon={Users} tone="soft" onPress={() => router.push('/familia')} />
                </>
              ) : null}
            </>
          )}
        </Card>

        <Card style={{ gap: space[3] }}>
          <Txt variant="title" accessibilityRole="header" aria-level={2}>
            {T.exportTitle}
          </Txt>
          <Txt color={colors.textSecondary}>{T.exportHint}</Txt>
          <Button label={T.exportButton} icon={FileDown} tone="soft" onPress={() => router.push('/conta/exportar')} />
        </Card>

        <Card style={{ gap: space[3] }}>
          <Txt variant="title" accessibilityRole="header" aria-level={2}>
            {T.confirmTitle}
          </Txt>
          <TextField
            label={T.confirmLabel}
            hint={T.confirmHint}
            value={typed}
            onChangeText={(v) => {
              setTyped(v);
              setMsg(null);
            }}
            autoCapitalize="characters"
            autoCorrect={false}
            autoComplete="off"
            spellCheck={false}
            editable={!busy}
            returnKeyType="done"
            onSubmitEditing={submit}
          />
          {msg ? (
            <Banner tone={msg.tone} icon={msg.tone === 'erro' ? AlertCircle : Info}>
              <Txt variant="label" color={msg.tone === 'erro' ? colors.error : colors.text}>
                {msg.text}
              </Txt>
            </Banner>
          ) : null}
          <Button label={T.submit} busy={busy} busyLabel={T.submitBusy} disabled={!canSubmit} onPress={submit} />
          <Button label={T.cancel} tone="ghost" disabled={busy} onPress={() => (router.canGoBack() ? router.back() : router.replace('/conta'))} />
        </Card>
      </Screen>
    </View>
  );
}
